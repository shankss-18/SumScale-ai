"""
SumScale — Agentic Alert Engine
================================
Self-contained, async multi-step alert dispatch pipeline.

Architecture:
  ┌─────────────────────────────────────────────────────────┐
  │  Alert Request → Queue in MongoDB `alert_queue`         │
  │      ↓                                                  │
  │  APScheduler polls every 15s → pick QUEUED alerts       │
  │      ↓                                                  │
  │  Step 1: Dispatch via Brevo REST API (primary)          │
  │  Step 2: Retry with SMTP fallback if Brevo fails        │
  │  Step 3: Mark SUCCESS / schedule RETRY (max 3 attempts) │
  │  Step 4: Update audit log in MongoDB                    │
  └─────────────────────────────────────────────────────────┘

No n8n external dependency required — fully self-hosted agentic loop.
"""

import os
import logging
import asyncio
from datetime import datetime, timezone
from typing import Optional, Dict, Any
import httpx

logger = logging.getLogger("omniaid.alert_engine")

BREVO_API_KEY = os.getenv("BREVO_API_KEY", "")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", "noreply@sumscale.ai")
MAX_RETRY_ATTEMPTS = 3


# ---------------------------------------------------------------------------
# Core Brevo Dispatcher
# ---------------------------------------------------------------------------
async def dispatch_brevo_email(
    recipient_email: str,
    subject: str,
    html_body: str,
    sender_name: str = "SumScale Alerts",
) -> bool:
    """
    Sends an email via Brevo REST API or SMTP fallback (Gmail / Brevo SMTP).
    Returns True on success, False on failure.
    """
    sender_email = SMTP_FROM_EMAIL or "noreply@sumscale.ai"

    # 1. Try Brevo REST API (HTTPS Port 443 — free 300/day)
    if BREVO_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    "https://api.brevo.com/v3/smtp/email",
                    headers={
                        "api-key": BREVO_API_KEY,
                        "Content-Type": "application/json",
                    },
                    json={
                        "sender": {"name": sender_name, "email": sender_email},
                        "to": [{"email": recipient_email}],
                        "subject": subject,
                        "htmlContent": html_body,
                    },
                )
                if response.status_code in (200, 201):
                    logger.info(f"✅ Alert email dispatched to {recipient_email} via Brevo API")
                    return True
                else:
                    logger.error(
                        f"❌ Brevo dispatch failed ({response.status_code}): {response.text[:200]}"
                    )
        except Exception as exc:
            logger.error(f"❌ Brevo dispatch exception for {recipient_email}: {exc}")

    # 2. Try SMTP Fallback (Gmail / Custom SMTP)
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    if smtp_user and smtp_password:
        try:
            import smtplib
            from email.mime.text import MIMEText
            from email.mime.multipart import MIMEMultipart

            smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
            smtp_port = int(os.getenv("SMTP_PORT", 465))

            msg = MIMEMultipart()
            msg["From"] = f"{sender_name} <{sender_email}>"
            msg["To"] = recipient_email
            msg["Subject"] = subject
            msg.attach(MIMEText(html_body, "html"))

            if smtp_port == 465:
                with smtplib.SMTP_SSL(smtp_host, 465, timeout=8.0) as server:
                    server.login(smtp_user, smtp_password)
                    server.sendmail(sender_email, recipient_email, msg.as_string())
            else:
                with smtplib.SMTP(smtp_host, smtp_port, timeout=8.0) as server:
                    server.starttls()
                    server.login(smtp_user, smtp_password)
                    server.sendmail(sender_email, recipient_email, msg.as_string())

            logger.info(f"✅ Alert email dispatched to {recipient_email} via SMTP ({smtp_host})")
            return True
        except Exception as exc:
            logger.error(f"❌ SMTP dispatch failed for {recipient_email}: {exc}")

    return False


# ---------------------------------------------------------------------------
# Queue an alert into MongoDB for agentic retry-loop processing
# ---------------------------------------------------------------------------
async def queue_alert(
    db: Any,
    alert_type: str,
    recipient_email: str,
    subject: str,
    html_body: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Enqueues an alert into `alert_queue` collection and attempts immediate delivery.
    Returns the queue entry ID.
    """
    from uuid import uuid4
    entry_id = f"aq_{uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)

    # Attempt immediate delivery
    sent_immediately = await dispatch_brevo_email(
        recipient_email=recipient_email,
        subject=subject,
        html_body=html_body,
    )

    doc = {
        "_id": entry_id,
        "alert_type": alert_type,
        "recipient_email": recipient_email,
        "subject": subject,
        "html_body": html_body,
        "status": "sent" if sent_immediately else "queued",
        "attempt_count": 1 if sent_immediately else 0,
        "max_attempts": MAX_RETRY_ATTEMPTS,
        "metadata": metadata or {},
        "created_at": now,
        "updated_at": now,
        "sent_at": now if sent_immediately else None,
        "next_retry_at": now,
        "last_error": None,
    }
    await db.alert_queue.insert_one(doc)
    logger.info(f"📬 Alert queued [{alert_type}] for {recipient_email} (id={entry_id}, sent={sent_immediately})")
    return entry_id


# ---------------------------------------------------------------------------
# Agentic Alert Processor — called by APScheduler every 15 seconds
# ---------------------------------------------------------------------------
async def process_alert_queue(db: Any) -> int:
    """
    Core agentic loop: picks up queued/retry-eligible alerts, dispatches them
    via Brevo, and handles success/failure audit logging.
    Called automatically by APScheduler — never needs manual invocation.

    Returns count of alerts processed in this cycle.
    """
    if db is None:
        return 0

    now = datetime.now(timezone.utc)
    processed = 0

    try:
        # Pick up queued alerts that are ready to be retried
        cursor = db.alert_queue.find({
            "status": {"$in": ["queued", "retrying"]},
            "next_retry_at": {"$lte": now},
            "attempt_count": {"$lt": MAX_RETRY_ATTEMPTS},
        }).sort("created_at", 1).limit(20)

        pending_alerts = await cursor.to_list(length=20)

        for alert in pending_alerts:
            entry_id = alert["_id"]
            attempt = alert["attempt_count"] + 1

            # Mark as processing to prevent double-dispatch
            await db.alert_queue.update_one(
                {"_id": entry_id},
                {"$set": {"status": "processing", "attempt_count": attempt, "updated_at": now}},
            )

            success = await dispatch_brevo_email(
                recipient_email=alert["recipient_email"],
                subject=alert["subject"],
                html_body=alert["html_body"],
            )

            if success:
                await db.alert_queue.update_one(
                    {"_id": entry_id},
                    {"$set": {
                        "status": "sent",
                        "sent_at": now,
                        "updated_at": now,
                        "last_error": None,
                    }},
                )
                logger.info(f"✅ Alert {entry_id} sent successfully (attempt {attempt})")
            else:
                if attempt >= MAX_RETRY_ATTEMPTS:
                    await db.alert_queue.update_one(
                        {"_id": entry_id},
                        {"$set": {
                            "status": "failed",
                            "updated_at": now,
                            "last_error": f"All {MAX_RETRY_ATTEMPTS} attempts exhausted",
                        }},
                    )
                    logger.error(f"❌ Alert {entry_id} permanently failed after {attempt} attempts")
                else:
                    # Exponential backoff: 30s, 2min, 10min
                    backoff_seconds = [30, 120, 600][min(attempt - 1, 2)]
                    from datetime import timedelta
                    next_retry = now + timedelta(seconds=backoff_seconds)
                    await db.alert_queue.update_one(
                        {"_id": entry_id},
                        {"$set": {
                            "status": "retrying",
                            "next_retry_at": next_retry,
                            "updated_at": now,
                            "last_error": f"Attempt {attempt} failed — retry at {next_retry.isoformat()}",
                        }},
                    )
                    logger.warning(f"⏳ Alert {entry_id} will retry in {backoff_seconds}s (attempt {attempt}/{MAX_RETRY_ATTEMPTS})")

            processed += 1

    except Exception as exc:
        logger.error(f"Alert queue processor error: {exc}")

    if processed > 0:
        logger.info(f"🤖 Agentic alert engine processed {processed} alert(s) this cycle")

    return processed


# ---------------------------------------------------------------------------
# Convenience wrappers for common alert types
# ---------------------------------------------------------------------------
async def send_safety_alert_email(
    db: Any,
    recipient_email: str,
    recipient_name: str,
    sender_name: str,
    alert_time: str,
) -> str:
    """Queue a safety/emergency alert email."""
    html_body = f"""
    <div style="font-family:Arial,sans-serif;padding:20px;background:#f4f7f6">
      <div style="max-width:520px;margin:0 auto;background:#fff;border:2px solid #dc2626;border-radius:24px;padding:32px;text-align:center">
        <div style="font-size:48px;margin-bottom:16px">🚨</div>
        <h2 style="color:#dc2626;margin:0 0 16px">SumScale Emergency Safety Alert</h2>
        <p style="font-size:15px;color:#333;line-height:1.6">
          Hi <strong>{recipient_name}</strong>,<br><br>
          <strong>{sender_name}</strong> has triggered a safety alert and
          may be in an unsafe situation.
        </p>
        <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:12px;padding:16px;margin:20px 0">
          <p style="margin:0;font-size:14px;color:#7f1d1d">
            ⏰ Alert triggered at: <strong>{alert_time}</strong>
          </p>
        </div>
        <p style="font-size:14px;color:#555">
          Please contact them immediately and check that they are safe.
        </p>
        <p style="font-size:11px;color:#aaa;margin-top:24px">
          SumScale Trust Circle is a peer safety tool and is not a replacement for emergency services (112/911).<br>
          © 2026 SumScale Multimodal AI Platform
        </p>
      </div>
    </div>
    """
    return await queue_alert(
        db=db,
        alert_type="safety_alert",
        recipient_email=recipient_email,
        subject=f"🚨 SAFETY ALERT: {sender_name} may need help",
        html_body=html_body,
        metadata={"sender_name": sender_name, "recipient_name": recipient_name},
    )


async def send_reminder_email(
    db: Any,
    recipient_email: str,
    title: str,
    notes: str,
    priority: str = "medium",
    category: str = "Personal",
) -> str:
    """Queue a reminder notification email with a modern, compact, and lively HTML template."""
    priority_color = {"urgent": "#dc2626", "high": "#e11d48", "medium": "#d97706", "low": "#006D77"}.get(priority, "#006D77")
    priority_bg = {"urgent": "#fef2f2", "high": "#fff1f2", "medium": "#fffbeb", "low": "#EDF6F9"}.get(priority, "#EDF6F9")
    priority_border = {"urgent": "#fca5a5", "high": "#fda4af", "medium": "#fde68a", "low": "#83C5BE"}.get(priority, "#83C5BE")

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
    notes_html = f'<p style="font-size:13px;color:#475569;margin:8px 0 0;line-height:1.5;">{notes}</p>' if notes else ''

    html_body = f"""
    <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:28px 12px;background:#f0f4f8">
      <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:20px;padding:32px 28px;border:1px solid #e2e8f0;box-shadow:0 10px 25px -5px rgba(0,0,0,0.05)">

        <!-- Header -->
        <div style="margin-bottom:24px;border-bottom:2px solid #f1f5f9;padding-bottom:16px">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td>
                <div style="display:flex;align-items:center;">
                  <span style="font-size:24px;margin-right:10px;">⏰</span>
                  <div>
                    <h2 style="color:#006D77;margin:0;font-size:18px;font-weight:800;letter-spacing:-0.3px">SumScale Reminder</h2>
                    <span style="font-size:11px;color:#64748b;font-weight:600">Automated Task & Schedule Alert</span>
                  </div>
                </div>
              </td>
              <td style="text-align:right;">
                <span style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;padding:4px 10px;border-radius:99px;background:{priority_bg};color:{priority_color};border:1px solid {priority_border}">
                  {priority.upper()} PRIORITY
                </span>
              </td>
            </tr>
          </table>
        </div>

        <!-- Content Card -->
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:20px;margin-bottom:20px">
          <h3 style="color:#0f172a;margin:0;font-size:16px;font-weight:700;line-height:1.4">
            {title}
          </h3>
          {notes_html}
        </div>

        <!-- Details Grid -->
        <div style="background:#EDF6F9;border:1px solid #83C5BE;border-radius:14px;padding:12px 18px;margin-bottom:24px">
          <span style="font-size:12px;color:#006D77;font-weight:700">
            📂 Category: <strong>{category}</strong> &nbsp;·&nbsp; 🔔 Notification Channel: <strong>Gmail SMTP</strong>
          </span>
        </div>

        <!-- Button -->
        <div style="text-align:center;margin-top:24px;padding-top:16px;border-top:1px solid #f1f5f9">
          <a href="{frontend_url}/dashboard?panel=reminders" style="display:inline-block;background:#006D77;color:#ffffff;font-weight:700;font-size:13px;text-decoration:none;padding:12px 28px;border-radius:99px;box-shadow:0 4px 12px rgba(0,109,119,0.25)">
            Open Reminders Hub →
          </a>
        </div>

        <!-- Footer -->
        <p style="font-size:11px;color:#94a3b8;margin-top:24px;text-align:center;line-height:1.5">
          Sent automatically by <strong>SumScale Multimodal AI Control Center</strong><br>
          © 2026 SumScale AI Platform
        </p>
      </div>
    </div>
    """
    return await queue_alert(
        db=db,
        alert_type="reminder",
        recipient_email=recipient_email,
        subject=f"🔔 Reminder: {title}",
        html_body=html_body,
        metadata={"title": title, "priority": priority},
    )


async def send_case_awareness_email(
    db: Any,
    recipient_email: str,
    recipient_name: str,
    sender_name: str,
    case_title: str,
    problem_description: str = "",
    how_it_started: str = "",
    risks: str = "",
    security_suggestions: str = "",
    summary: str = "",
    preventions: str = "",
) -> str:
    """Queue a structured Case Awareness Alert email with Problem Description, How It Started, What Risks & Security Suggestions."""
    p_desc = problem_description or summary or "Document Analysis Findings"
    h_start = how_it_started or "Analysis initiated from uploaded document intake."
    r_text = risks or "Security, compliance, or financial risk identified."
    s_sug = security_suggestions or preventions or "Verify vendor credentials and follow safety protocols."

    html_body = f"""
    <div style="font-family:Arial,sans-serif;padding:24px;background:#f4f7f6">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #83C5BE;border-radius:24px;padding:32px;box-shadow:0 4px 12px rgba(0,0,0,0.05)">
        <div style="display:flex;align-items:center;margin-bottom:16px">
          <span style="font-size:32px;margin-right:12px">📢</span>
          <div>
            <h2 style="color:#006D77;margin:0;font-size:20px;font-weight:800">SumScale Case Awareness Alert</h2>
            <p style="margin:2px 0 0;font-size:12px;color:#64748b">Important awareness update shared by <strong>{sender_name}</strong></p>
          </div>
        </div>

        <h3 style="margin:0 0 12px;font-size:15px;color:#006D77;font-weight:800">📋 Case: {case_title}</h3>

        <!-- 1. Problem Description -->
        <div style="background:#f8fafc;border-left:4px solid #475569;border-radius:12px;padding:14px;margin:12px 0">
          <h4 style="margin:0 0 4px;font-size:13px;color:#1e293b;font-weight:700">📌 Problem Description</h4>
          <p style="margin:0;font-size:13px;color:#334155;line-height:1.5">{p_desc}</p>
        </div>

        <!-- 2. How It Started -->
        <div style="background:#f0f9ff;border-left:4px solid #0284c7;border-radius:12px;padding:14px;margin:12px 0">
          <h4 style="margin:0 0 4px;font-size:13px;color:#0369a1;font-weight:700">🚀 How It Started</h4>
          <p style="margin:0;font-size:13px;color:#0c4a6e;line-height:1.5">{h_start}</p>
        </div>

        <!-- 3. What Risks -->
        <div style="background:#fff1f2;border-left:4px solid #e11d48;border-radius:12px;padding:14px;margin:12px 0">
          <h4 style="margin:0 0 4px;font-size:13px;color:#be123c;font-weight:700">⚠️ What Risks</h4>
          <p style="margin:0;font-size:13px;color:#881337;line-height:1.5">{r_text}</p>
        </div>

        <!-- 4. Security Suggestions -->
        <div style="background:#fffbe6;border-left:4px solid #d97706;border-radius:12px;padding:14px;margin:12px 0">
          <h4 style="margin:0 0 4px;font-size:13px;color:#b45309;font-weight:700">🔒 Security Suggestions</h4>
          <p style="margin:0;font-size:13px;color:#78350f;line-height:1.5">{s_sug}</p>
        </div>

        <p style="font-size:11px;color:#94a3b8;margin-top:24px;text-align:center;line-height:1.5">
          This notification was generated to provide awareness regarding case analysis.<br>
          © 2026 SumScale Multimodal AI Platform
        </p>
      </div>
    </div>
    """
    return await queue_alert(
        db=db,
        alert_type="case_awareness",
        recipient_email=recipient_email,
        subject=f"📢 Case Awareness Alert: {case_title}",
        html_body=html_body,
        metadata={
            "sender_name": sender_name,
            "recipient_name": recipient_name,
            "case_title": case_title,
        },
    )


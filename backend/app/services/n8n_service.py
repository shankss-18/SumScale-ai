"""
SumScale — n8n Automation & Webhook Integration Service
======================================================
Coordinates asynchronous notifications between SumScale backend, n8n workflows,
and the internal Agentic Alert Engine.

All email dispatch now goes through `alert_engine.py` (Brevo async) instead
of synchronous SMTP calls.
"""

import os
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List

import httpx

from app.services.alert_engine import send_safety_alert_email, send_reminder_email

logger = logging.getLogger("omniaid.n8n_service")

# N8N Configuration (optional — used only if you also run a real n8n server)
N8N_REMINDER_WEBHOOK_URL = os.getenv("N8N_REMINDER_WEBHOOK_URL", "")
N8N_SAFETY_WEBHOOK_URL = os.getenv("N8N_SAFETY_WEBHOOK_URL", "")
N8N_WEBHOOK_SECRET = os.getenv("N8N_WEBHOOK_SECRET", "sumscale_n8n_secret_key_2026")


async def trigger_n8n_reminder_workflow(
    reminder_doc: Dict[str, Any],
    db: Any,
) -> bool:
    """
    Triggers reminder notification workflow:
    1. (Optional) Fires external n8n webhook if N8N_REMINDER_WEBHOOK_URL is set.
    2. Queues email via Agentic Alert Engine (Brevo, async, with retry).
    3. Sends Web Push notification if browser subscriptions exist.
    """
    reminder_id = reminder_doc.get("_id") or reminder_doc.get("id")
    user_id = reminder_doc.get("user_id")
    title = reminder_doc.get("title", "Reminder")
    notes = reminder_doc.get("notes") or reminder_doc.get("description") or "You have an active SumScale reminder."
    priority = reminder_doc.get("priority", "medium")
    category = reminder_doc.get("category", "Personal")

    # Idempotency check
    existing_log = await db.notification_logs.find_one({
        "reminder_id": reminder_id,
        "event_type": "reminder_due",
        "due_date": reminder_doc.get("due_date"),
    })
    if existing_log:
        logger.info(f"Skipping duplicate notification for reminder {reminder_id}")
        return True

    # Resolve user email robustly
    user_email = None
    if isinstance(user_id, str) and "@" in user_id:
        user_email = user_id
    else:
        from bson import ObjectId
        user_query = []
        if ObjectId.is_valid(str(user_id)):
            user_query.append({"_id": ObjectId(str(user_id))})
        user_query.append({"_id": str(user_id)})
        user_query.append({"email": str(user_id)})

        user_doc = await db.users.find_one({"$or": user_query})
        if user_doc:
            user_email = user_doc.get("email")

    if not user_email:
        user_email = reminder_doc.get("user_email") or reminder_doc.get("recipient_email") or os.getenv("SMTP_FROM_EMAIL") or "thezeroprof@gmail.com"

    # 1. Optional external n8n webhook
    n8n_success = False
    if N8N_REMINDER_WEBHOOK_URL:
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.post(
                    N8N_REMINDER_WEBHOOK_URL,
                    json={
                        "event_type": "reminder_due",
                        "reminder_id": reminder_id,
                        "user_id": user_id,
                        "user_email": user_email,
                        "title": title,
                        "notes": notes,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    },
                    headers={"X-SumScale-Signature": N8N_WEBHOOK_SECRET},
                )
                n8n_success = res.status_code in [200, 201, 202]
        except Exception as exc:
            logger.warning(f"n8n reminder webhook failed: {exc}")

    # 2. Queue email via Agentic Alert Engine
    email_queued = False
    channels = reminder_doc.get("notification_channels", ["push", "email"])
    if "email" in channels and user_email:
        await send_reminder_email(
            db=db,
            recipient_email=user_email,
            title=title,
            notes=notes,
            priority=priority,
            category=category,
        )
        email_queued = True

    # 3. Web Push
    push_sent = False
    if "push" in channels:
        from app.services.webpush_service import send_web_push_notification
        cursor = db.push_subscriptions.find({"user_id": user_id})
        subscriptions = await cursor.to_list(length=10)
        for sub in subscriptions:
            ok = await send_web_push_notification(
                subscription_info=sub,
                title=f"🔔 SumScale: {title}",
                body=notes[:150],
                url="/profile?tab=reminders",
                db=db,
            )
            if ok:
                push_sent = True

    # Audit log
    await db.notification_logs.insert_one({
        "reminder_id": reminder_id,
        "user_id": user_id,
        "event_type": "reminder_due",
        "due_date": reminder_doc.get("due_date"),
        "n8n_success": n8n_success,
        "email_queued": email_queued,
        "push_sent": push_sent,
        "created_at": datetime.now(timezone.utc),
    })

    return True


async def trigger_n8n_safety_alert_workflow(
    alert_doc: Dict[str, Any],
    eligible_contacts: List[Dict[str, Any]],
    db: Any,
) -> bool:
    """
    Triggers safety alert workflow:
    1. (Optional) Fires external n8n webhook if configured.
    2. Queues emergency emails for all eligible Trust Circle contacts via Agentic Alert Engine.
    """
    alert_id = str(alert_doc.get("_id") or alert_doc.get("id"))
    user_name = alert_doc.get("user_name", "A SumScale User")
    alert_time = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    # 1. Optional external n8n webhook
    n8n_success = False
    if N8N_SAFETY_WEBHOOK_URL:
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.post(
                    N8N_SAFETY_WEBHOOK_URL,
                    json={
                        "event_type": "safety_alert",
                        "alert_id": alert_id,
                        "user_name": user_name,
                        "eligible_contacts": eligible_contacts,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    },
                    headers={"X-SumScale-Signature": N8N_WEBHOOK_SECRET},
                )
                n8n_success = res.status_code in [200, 201, 202]
        except Exception as exc:
            logger.warning(f"n8n safety webhook failed: {exc}")

    # 2. Queue emergency email for each eligible contact via Agentic Alert Engine
    queue_ids = []
    for contact in eligible_contacts:
        c_email = contact.get("email")
        c_name = contact.get("name", "Trusted Contact")
        if not c_email:
            continue
        qid = await send_safety_alert_email(
            db=db,
            recipient_email=c_email,
            recipient_name=c_name,
            sender_name=user_name,
            alert_time=alert_time,
        )
        queue_ids.append(qid)

    # Update alert audit log
    await db.safety_alerts.update_one(
        {"_id": alert_id},
        {"$set": {
            "notified_members": eligible_contacts,
            "alert_queue_ids": queue_ids,
            "audit_log": [{
                "action": "dispatched_via_alert_engine",
                "n8n_success": n8n_success,
                "recipient_count": len(queue_ids),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }],
        }},
    )

    logger.info(f"🤖 Safety alert {alert_id} queued for {len(queue_ids)} contacts via Agentic Alert Engine")
    return True

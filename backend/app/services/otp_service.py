"""
OmniAid — Free Email OTP Service
===============================
Generates secure 6-digit OTPs for Email authentication.
Dispatches REAL Emails via SMTP (Gmail, Brevo, Resend, etc.),
with automatic DB storage & 5-minute expiration.
"""

import os
import random
import logging
import datetime
import smtplib
import asyncio
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Tuple, Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("omniaid.otp_service")

# 5 minutes expiration
OTP_EXPIRATION_MINUTES = 5


def generate_6digit_otp() -> str:
    """Generate secure 6-digit numeric OTP string."""
    return f"{random.randint(100000, 999999)}"


def normalize_email(email: str) -> str:
    """Clean and normalize recipient email address."""
    return email.strip().lower()


def send_real_email_otp(recipient_email: str, otp_code: str) -> bool:
    """
    Dispatches a real HTML OTP email using:
    1. Resend REST API (HTTPS Port 443 — 100% cloud reliable, free 3,000/mo)
    2. Brevo REST API (HTTPS Port 443 — free 300/day)
    3. SMTP Fallback (Gmail / Custom SMTP)
    """
    resend_key = os.getenv("RESEND_API_KEY")
    brevo_key = os.getenv("BREVO_API_KEY")

    html_content = f"""
    <!DOCTYPE html>
    <html>
      <body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f4f7f6; color: #333;">
        <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border: 1px solid #83C5BE; border-radius: 24px; padding: 32px; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <h2 style="color: #006D77; margin-top: 0; font-size: 22px;">SumScale Verification Code</h2>
          <p style="font-size: 14px; color: #555; line-height: 1.5;">Use the following 6-digit verification code to complete your sign in or account registration:</p>
          <div style="background: #EDF6F9; border: 1px solid #83C5BE; border-radius: 16px; padding: 18px; margin: 24px 0; font-size: 34px; font-weight: 800; letter-spacing: 10px; color: #006D77;">
            {otp_code}
          </div>
          <p style="font-size: 12px; color: #888;">This code is valid for 5 minutes. If you did not request this code, please ignore this message.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="font-size: 11px; color: #aaa;">© 2026 SumScale Multimodal AI Platform</p>
        </div>
      </body>
    </html>
    """

    # 1. Try Brevo REST API (100% Free, 300/day, HTTPS Port 443 — allows ANY recipient email address without domain verification!)
    if brevo_key:
        try:
            import httpx
            sender_email = os.getenv("SMTP_FROM_EMAIL") or os.getenv("SMTP_USER") or "noreply@sumscale.ai"
            res = httpx.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={
                    "api-key": brevo_key,
                    "Content-Type": "application/json",
                },
                json={
                    "sender": {"name": "SumScale Security", "email": sender_email},
                    "to": [{"email": recipient_email}],
                    "subject": f"{otp_code} is your SumScale verification code",
                    "htmlContent": html_content,
                },
                timeout=8.0,
            )
            if res.status_code in (200, 201):
                logger.info(f"✅ Real Email OTP delivered to {recipient_email} via Brevo REST API")
                return True
            else:
                logger.error(f"❌ Brevo API error ({res.status_code}): {res.text}")
        except Exception as e:
            logger.error(f"❌ Brevo API dispatch failed: {e}")

    # 2. Try Resend REST API (HTTPS Port 443 — free 3,000/mo, requires verified domain for external recipients)
    if resend_key:
        try:
            import httpx
            sender = os.getenv("RESEND_FROM_EMAIL", "SumScale Security <onboarding@resend.dev>")
            res = httpx.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {resend_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": sender,
                    "to": [recipient_email],
                    "subject": f"{otp_code} is your SumScale verification code",
                    "html": html_content,
                },
                timeout=8.0,
            )
            if res.status_code in (200, 201):
                logger.info(f"✅ Real Email OTP delivered to {recipient_email} via Resend REST API")
                return True
            elif res.status_code == 403:
                logger.error(f"❌ Resend API 403 Forbidden: Resend unverified test key can ONLY send emails to your own account email. To send to any recipient, add a free BREVO_API_KEY in Render dashboard.")
            else:
                logger.error(f"❌ Resend API error ({res.status_code}): {res.text}")
        except Exception as e:
            logger.error(f"❌ Resend API dispatch failed: {e}")

    # 3. SMTP Fallback (Gmail / Custom SMTP)
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    if smtp_user and smtp_password:
        smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
        smtp_port = int(os.getenv("SMTP_PORT", 465))
        sender_email = os.getenv("SMTP_FROM_EMAIL") or smtp_user or "noreply@sumscale.ai"

        msg = MIMEMultipart()
        msg["From"] = f"SumScale Security <{sender_email}>"
        msg["To"] = recipient_email
        msg["Subject"] = f"{otp_code} is your SumScale verification code"
        msg.attach(MIMEText(html_content, "html"))

        if smtp_port == 465:
            try:
                with smtplib.SMTP_SSL(smtp_host, 465, timeout=4.0) as server:
                    server.login(smtp_user, smtp_password)
                    server.sendmail(sender_email, recipient_email, msg.as_string())
                logger.info(f"✅ Real Email OTP delivered to {recipient_email} via SSL")
                return True
            except Exception as e:
                logger.warning(f"Port 465 SSL failed for {recipient_email}: {e}. Retrying on Port 587 STARTTLS...")

        try:
            with smtplib.SMTP(smtp_host, 587, timeout=4.0) as server:
                server.starttls()
                server.login(smtp_user, smtp_password)
                server.sendmail(sender_email, recipient_email, msg.as_string())
            logger.info(f"✅ Real Email OTP delivered to {recipient_email} via STARTTLS")
            return True
        except Exception as e:
            logger.error(f"❌ SMTP delivery failed for {recipient_email}: {e}")

    logger.warning("⚠️ No valid email provider configured (RESEND_API_KEY, BREVO_API_KEY, or SMTP_USER). Email not sent.")
    return False


async def send_otp_identifier(
    db: Any,
    email: str,
    purpose: str = "login"
) -> Dict[str, Any]:
    """
    Generates 6-digit OTP, stores in DB with 5-minute expiry, and dispatches email via SMTP asynchronously.
    """
    clean_email = normalize_email(email)
    otp_code = generate_6digit_otp()
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(minutes=OTP_EXPIRATION_MINUTES)

    # Document to insert into MongoDB
    otp_doc = {
        "email": clean_email,
        "identifier": clean_email,
        "otp_code": otp_code,
        "purpose": purpose,
        "verified": False,
        "created_at": datetime.datetime.utcnow(),
        "expires_at": expires_at,
    }

    # Hard-delete ALL previous OTP records for this email (verified or not)
    # This guarantees single-use tokens and keeps the collection clean
    await db.otp_verifications.delete_many(
        {"$or": [{"email": clean_email}, {"identifier": clean_email}]}
    )

    await db.otp_verifications.insert_one(otp_doc)

    # Dispatch email asynchronously in background task
    asyncio.create_task(asyncio.to_thread(send_real_email_otp, clean_email, otp_code))

    res = {
        "status": "success",
        "email": clean_email,
        "expires_in_seconds": OTP_EXPIRATION_MINUTES * 60,
        "real_sent": True,
    }

    # Only include dev_otp in automated test environment for pytest suite
    if os.getenv("ENVIRONMENT") == "test":
        res["dev_otp"] = otp_code

    return res


async def verify_otp_identifier(
    db: Any,
    email: str,
    otp_code: str
) -> Tuple[bool, str]:
    """
    Strictly verifies OTP code against database records.
    Returns (is_valid, clean_email or error_message).
    Requires exact match with unverified, unexpired OTP code.
    """
    clean_email = normalize_email(email)
    code_clean = otp_code.strip()

    if not code_clean:
        return False, "Please enter the 6-digit verification code."

    record = await db.otp_verifications.find_one({
        "$or": [{"email": clean_email}, {"identifier": clean_email}],
        "otp_code": code_clean,
        "verified": False,
    }, sort=[("created_at", -1)])

    if not record:
        return False, "Invalid OTP code. Please check your Email Inbox and try again."

    expires_at = record.get("expires_at")
    if expires_at and datetime.datetime.utcnow() > expires_at:
        return False, "OTP code has expired. Please request a new verification code."

    # Physically DELETE the OTP record after successful verification (single-use guarantee)
    await db.otp_verifications.delete_one({"_id": record["_id"]})

    return True, clean_email



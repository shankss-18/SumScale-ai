"""
SumScale — Proactive Health Alerts Service (Feature 3A)
========================================================
Sends Twilio SMS to a user's emergency contact when a critical
health metric is detected in uploaded documents.

Features:
- 24-hour per-metric deduplification (MongoDB alerts_sent collection)
- Graceful fallback: logs alert if Twilio not configured
- audit_log stored in MongoDB for traceability
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import settings

logger = logging.getLogger("omniaid.alerts")

_ALERTS_COLLECTION = "alerts_sent"
_DEDUP_HOURS = 24   # one alert per metric per 24 hours


# ---------------------------------------------------------------------------
# Twilio sender
# ---------------------------------------------------------------------------

def _send_twilio_sms(to_number: str, body: str) -> bool:
    """Synchronous Twilio SMS send. Returns True on success."""
    sid = settings.TWILIO_ACCOUNT_SID
    token = settings.TWILIO_AUTH_TOKEN
    from_num = settings.TWILIO_FROM_NUMBER

    if not all([sid, token, from_num]):
        logger.warning(
            "Twilio credentials not configured — skipping SMS send. "
            "Alert body: " + body
        )
        return False

    try:
        from twilio.rest import Client
        client = Client(sid, token)
        message = client.messages.create(
            body=body,
            from_=from_num,
            to=to_number,
        )
        logger.info(f"Twilio SMS sent: SID={message.sid} to={to_number[:5]}***")
        return True
    except Exception as exc:
        logger.error(f"Twilio SMS failed: {exc}")
        return False


# ---------------------------------------------------------------------------
# Deduplification check
# ---------------------------------------------------------------------------

async def _is_already_alerted(
    user_id: str,
    metric_name: str,
    db: AsyncIOMotorDatabase,
) -> bool:
    """Return True if an alert was already sent for this metric in the last 24 hours."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=_DEDUP_HOURS)
    existing = await db[_ALERTS_COLLECTION].find_one({
        "user_id": user_id,
        "metric_name": metric_name,
        "sent_at": {"$gte": cutoff},
    })
    return existing is not None


# ---------------------------------------------------------------------------
# Main function
# ---------------------------------------------------------------------------

async def send_critical_alert(
    user_id: str,
    metric_name: str,
    value: str,
    ref_range: str,
    db: AsyncIOMotorDatabase,
    emergency_contact_phone: Optional[str] = None,
    user_name: Optional[str] = None,
) -> dict:
    """
    Send a Twilio SMS alert to the user's emergency contact for a critical health metric.
    Deduplicates: max 1 alert per metric per 24 hours.

    Returns: {"sent": bool, "reason": str}
    """
    if not emergency_contact_phone:
        return {"sent": False, "reason": "no_emergency_contact"}

    # Deduplification check
    if await _is_already_alerted(user_id, metric_name, db):
        logger.info(f"Alert suppressed (already sent within 24h): user={user_id} metric={metric_name}")
        return {"sent": False, "reason": "already_sent_within_24h"}

    display_name = user_name or "Your contact"
    body = (
        f"SumScale Health Alert: {display_name}'s recent {metric_name} reading is "
        f"{value}, which is outside the normal range ({ref_range}). "
        f"Please check in with them. — SumScale AI"
    )

    sms_sent = _send_twilio_sms(emergency_contact_phone, body)

    # Audit log regardless of SMS success
    try:
        await db[_ALERTS_COLLECTION].insert_one({
            "user_id": user_id,
            "metric_name": metric_name,
            "value": value,
            "ref_range": ref_range,
            "emergency_contact": emergency_contact_phone[:5] + "***",  # masked
            "sms_sent": sms_sent,
            "sent_at": datetime.now(timezone.utc),
            "body_preview": body[:100],
        })
    except Exception as exc:
        logger.error(f"Failed to write alert audit log: {exc}")

    reason = "sms_sent" if sms_sent else "twilio_not_configured_logged"
    return {"sent": sms_sent, "reason": reason}

"""
SumScale — Shared Intel & Alerts Router (Feature 3)
====================================================
GET  /api/fraud/intel-stats         — public community intel stats
POST /api/alerts/test               — test emergency contact alert (dev only)
PUT  /api/alerts/contact            — update emergency contact phone
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.dependencies.auth import get_current_user
from app.services.shared_intel import get_intel_stats
from app.services.alerts import send_critical_alert
from app.utils.limiter import limiter

logger = logging.getLogger("omniaid.routers.intel")

router = APIRouter(tags=["Intel & Alerts"])


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


# ---------------------------------------------------------------------------
# Shared Intel Stats
# ---------------------------------------------------------------------------

@router.get("/api/fraud/intel-stats")
async def intel_stats(
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Public endpoint — community fraud intelligence aggregate stats.
    No authentication required.
    """
    stats = await get_intel_stats(db)
    return stats


# ---------------------------------------------------------------------------
# Emergency Contact Management
# ---------------------------------------------------------------------------

class EmergencyContactRequest(BaseModel):
    emergency_contact_phone: str
    alert_consent: bool = False


@router.put("/api/alerts/contact")
async def update_emergency_contact(
    request: Request,
    body: EmergencyContactRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Update the user's emergency contact phone number and alert consent."""
    user_id = str(current_user.get("id") or current_user.get("_id", ""))

    # Validate phone is non-empty and starts with + or digit
    phone = body.emergency_contact_phone.strip()
    if not phone or len(phone) < 7:
        raise HTTPException(status_code=422, detail="Invalid phone number")

    await db["users"].update_one(
        {"_id": user_id},
        {"$set": {
            "emergency_contact_phone": phone,
            "alert_consent": body.alert_consent,
        }},
    )
    return {"success": True, "emergency_contact_phone": phone[:5] + "***", "alert_consent": body.alert_consent}


@router.get("/api/alerts/contact")
async def get_emergency_contact(
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get the user's current emergency contact settings."""
    user_id = str(current_user.get("id") or current_user.get("_id", ""))
    user = await db["users"].find_one({"_id": user_id}, {"emergency_contact_phone": 1, "alert_consent": 1})
    if not user:
        return {"emergency_contact_phone": None, "alert_consent": False}
    phone = user.get("emergency_contact_phone")
    return {
        "emergency_contact_phone": (phone[:5] + "***") if phone else None,
        "alert_consent": user.get("alert_consent", False),
    }


# ---------------------------------------------------------------------------
# Test Alert (development / demo use only)
# ---------------------------------------------------------------------------

class TestAlertRequest(BaseModel):
    metric_name: str = "Fever"
    value: str = "104°F"
    ref_range: str = "97–99°F"


@router.post("/api/alerts/test")
@limiter.limit("3/minute")
async def test_alert(
    request: Request,
    body: TestAlertRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Send a test critical health alert to the user's emergency contact.
    Useful for verifying Twilio integration.
    """
    user_id = str(current_user.get("id") or current_user.get("_id", ""))
    user = await db["users"].find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    contact = user.get("emergency_contact_phone")
    if not contact:
        raise HTTPException(status_code=400, detail="No emergency contact phone set. Use PUT /api/alerts/contact first.")

    if not user.get("alert_consent", False):
        raise HTTPException(status_code=403, detail="Alert consent not given. Update consent via PUT /api/alerts/contact.")

    result = await send_critical_alert(
        user_id=user_id,
        metric_name=body.metric_name,
        value=body.value,
        ref_range=body.ref_range,
        db=db,
        emergency_contact_phone=contact,
        user_name=user.get("email", "User"),
    )
    return result

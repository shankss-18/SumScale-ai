"""
SumScale — Safety Alert & Trust Circle Workflow Router
=====================================================
Handles explicit user safety confirmations, safety alert MongoDB creation,
Trust Circle permission filtering, and emergency notification workflow triggers.
"""

from datetime import datetime, timezone
from typing import List, Dict, Any
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, status, Request

from app.models.safety_alert import SafetyAlertInDB, SafetyAlertTriggerRequest
from app.dependencies.auth import get_current_user
from app.models.user import UserInDB
from app.services.n8n_service import trigger_n8n_safety_alert_workflow

router = APIRouter(prefix="/safety", tags=["safety"])


@router.post(
    "/trigger-alert",
    response_model=Dict[str, Any],
    status_code=status.HTTP_201_CREATED,
    summary="Trigger safety alert workflow after explicit user confirmation",
)
async def trigger_safety_alert(
    request: Request,
    body: SafetyAlertTriggerRequest,
    current_user: UserInDB = Depends(get_current_user),
):
    if not body.user_confirmation:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Safety alert dispatch requires explicit user confirmation (user_confirmation=True).",
        )

    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    # SECURITY RULE 2 & 3: Query ONLY active Trust Circle members who have safety_alerts permission enabled
    cursor = db.trust_circle.find({
        "user_id": current_user.id,
        "status": "active",
        "permissions.safety_alerts": True,
    })
    eligible_members = await cursor.to_list(length=100)

    alert_id = f"sa_{uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    user_display_name = current_user.full_name or current_user.email

    alert_msg = (
        f"SumScale Safety Alert:\n"
        f"{user_display_name} requested help and may be in an unsafe situation.\n"
        f"Time: {now.strftime('%Y-%m-%d %H:%M:%S UTC')}\n"
        f"Please contact them and check that they are safe."
    )

    formatted_eligible = [
        {
            "id": m["_id"],
            "name": m.get("name"),
            "email": m.get("email"),
            "phone": m.get("phone"),
            "relationship": m.get("relationship"),
        }
        for m in eligible_members
    ]

    alert_doc = {
        "_id": alert_id,
        "user_id": current_user.id,
        "user_name": user_display_name,
        "user_email": current_user.email,
        "status": "triggered",
        "notified_members": formatted_eligible,
        "message_text": alert_msg,
        "audit_log": [
            {
                "action": "initiated",
                "eligible_contacts_count": len(eligible_members),
                "timestamp": now.isoformat(),
            }
        ],
        "created_at": now,
    }

    # Save safety alert record in MongoDB source of truth
    await db.safety_alerts.insert_one(alert_doc)

    # Asynchronously trigger n8n + Web Push + Gmail notification workflow
    await trigger_n8n_safety_alert_workflow(alert_doc, formatted_eligible, db)

    return {
        "status": "success",
        "alert_id": alert_id,
        "message": f"Safety alert dispatched to {len(eligible_members)} trusted contacts.",
        "notified_count": len(eligible_members),
        "disclaimer": "SumScale Trust Circle is a peer notification feature and does not replace emergency services (112/911).",
    }


@router.get(
    "/alerts",
    response_model=List[SafetyAlertInDB],
    summary="List past safety alerts and audit log for authenticated user",
)
async def list_safety_alerts(
    request: Request,
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    cursor = db.safety_alerts.find({"user_id": current_user.id}).sort("created_at", -1)
    docs = await cursor.to_list(length=50)
    return [SafetyAlertInDB(**doc) for doc in docs]

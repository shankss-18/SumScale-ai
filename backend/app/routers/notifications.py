"""
SumScale — In-App Notifications & Case Awareness Alerts Router
===============================================================
Provides API endpoints for managing website in-app notifications,
unread counts, mark as read, and dispatching multi-channel Case Awareness
Alerts (In-App + Email) containing Case Summary, Preventions, and Security Suggestions.
"""

from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, Field

from app.dependencies.auth import get_current_user
from app.models.user import UserInDB
from app.services.alert_engine import send_case_awareness_email

router = APIRouter(prefix="/notifications", tags=["notifications"])


class CaseAwarenessAlertRequest(BaseModel):
    case_id: Optional[str] = None
    case_title: str = Field(..., example="Medication Side Effects Guidance")
    problem_description: Optional[str] = Field(None, example="Brief description of the problem encountered.")
    how_it_started: Optional[str] = Field(None, example="How the case started / source of issue.")
    risks: Optional[str] = Field(None, example="Identified risks or potential hazards.")
    security_suggestions: Optional[str] = Field(None, example="Security, safety, and guidance suggestions.")
    # Backwards compatibility fallbacks
    summary: Optional[str] = None
    preventions: Optional[str] = None
    send_to_trust_circle: bool = True
    recipient_emails: Optional[List[str]] = None


@router.get(
    "",
    response_model=Dict[str, Any],
    summary="Get in-app notifications for authenticated user",
)
async def get_in_app_notifications(
    request: Request,
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    cursor = db.in_app_notifications.find(
        {"user_id": current_user.id}
    ).sort("created_at", -1).limit(50)

    docs = await cursor.to_list(length=50)

    # Normalize _id to string id
    notifications = []
    for d in docs:
        d["id"] = str(d["_id"])
        notifications.append(d)

    unread_count = await db.in_app_notifications.count_documents({
        "user_id": current_user.id,
        "is_read": False,
    })

    return {
        "notifications": notifications,
        "unread_count": unread_count,
    }


@router.post(
    "/dispatch-awareness-alert",
    status_code=status.HTTP_201_CREATED,
    summary="Dispatch Case Awareness Alert (Website In-App Notifications + Email)",
)
async def dispatch_case_awareness_alert(
    request: Request,
    body: CaseAwarenessAlertRequest,
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    user_display_name = current_user.full_name or current_user.email
    now = datetime.now(timezone.utc)

    # Resolve compact section content with intelligent fallback defaults
    problem_text = (body.problem_description or body.summary or "Document Findings Analysis").strip()
    origin_text = (body.how_it_started or "Analysis triggered from uploaded document intake & AI evaluation.").strip()
    risks_text = (body.risks or "Potential security, compliance, or medical risk identified.").strip()
    sec_suggestions_text = (body.security_suggestions or body.preventions or "Verify credentials, follow safety protocols, and keep record copies.").strip()

    # Determine recipient emails & users
    recipients = []
    target_user_ids = {current_user.id}

    # Add current user
    recipients.append({
        "name": user_display_name,
        "email": current_user.email,
        "user_id": current_user.id,
    })

    # Query Trust Circle contacts if requested
    if body.send_to_trust_circle:
        cursor = db.trust_circle.find({
            "user_id": current_user.id,
            "status": "active",
        })
        tc_members = await cursor.to_list(length=100)

        for m in tc_members:
            m_email = m.get("email")
            m_name = m.get("name", "Trusted Person")
            if m_email and not any(r["email"] == m_email for r in recipients):
                matched_user = await db.users.find_one({"email": m_email})
                matched_user_id = str(matched_user["_id"]) if matched_user else None

                recipients.append({
                    "name": m_name,
                    "email": m_email,
                    "user_id": matched_user_id,
                })
                if matched_user_id:
                    target_user_ids.add(matched_user_id)

    # Custom recipient emails provided explicitly
    if body.recipient_emails:
        for email in body.recipient_emails:
            if not any(r["email"] == email for r in recipients):
                matched_user = await db.users.find_one({"email": email})
                matched_user_id = str(matched_user["_id"]) if matched_user else None
                recipients.append({
                    "name": email.split("@")[0],
                    "email": email,
                    "user_id": matched_user_id,
                })
                if matched_user_id:
                    target_user_ids.add(matched_user_id)

    # 1. Create In-App Notification records in MongoDB
    in_app_count = 0
    for uid in target_user_ids:
        notif_id = f"notif_{uuid4().hex[:12]}"
        notif_doc = {
            "_id": notif_id,
            "user_id": uid,
            "sender_name": user_display_name,
            "sender_email": current_user.email,
            "type": "case_awareness",
            "title": f"Case Awareness Alert: {body.case_title}",
            "case_id": body.case_id,
            "case_title": body.case_title,
            "problem_description": problem_text,
            "how_it_started": origin_text,
            "risks": risks_text,
            "security_suggestions": sec_suggestions_text,
            "summary": problem_text, # legacy fallback
            "preventions": sec_suggestions_text, # legacy fallback
            "is_read": False,
            "created_at": now,
        }
        await db.in_app_notifications.insert_one(notif_doc)
        in_app_count += 1

    # 2. Dispatch structured HTML emails via alert engine
    email_count = 0
    for r in recipients:
        await send_case_awareness_email(
            db=db,
            recipient_email=r["email"],
            recipient_name=r["name"],
            sender_name=user_display_name,
            case_title=body.case_title,
            problem_description=problem_text,
            how_it_started=origin_text,
            risks=risks_text,
            security_suggestions=sec_suggestions_text,
        )
        email_count += 1

    return {
        "status": "success",
        "message": f"Case Awareness Alert sent to {in_app_count} website notification inbox(es) and queued for {email_count} email recipient(s).",
        "in_app_sent": in_app_count,
        "email_sent": email_count,
    }


@router.put(
    "/{notification_id}/read",
    summary="Mark single in-app notification as read",
)
async def mark_notification_read(
    notification_id: str,
    request: Request,
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    res = await db.in_app_notifications.update_one(
        {"_id": notification_id, "user_id": current_user.id},
        {"$set": {"is_read": True, "updated_at": datetime.now(timezone.utc)}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")

    return {"status": "success", "message": "Notification marked as read"}


@router.put(
    "/read-all",
    summary="Mark all in-app notifications as read",
)
async def mark_all_notifications_read(
    request: Request,
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    res = await db.in_app_notifications.update_many(
        {"user_id": current_user.id, "is_read": False},
        {"$set": {"is_read": True, "updated_at": datetime.now(timezone.utc)}},
    )

    return {"status": "success", "modified_count": res.modified_count}


@router.delete(
    "/{notification_id}",
    summary="Delete in-app notification",
)
async def delete_notification(
    notification_id: str,
    request: Request,
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    res = await db.in_app_notifications.delete_one(
        {"_id": notification_id, "user_id": current_user.id}
    )
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")

    return {"status": "success", "message": "Notification deleted"}

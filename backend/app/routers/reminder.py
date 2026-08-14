"""
SumScale — Centralized Reminder Router
======================================
Endpoints for creating, listing, updating, snoozing, completing, deleting, and parsing reminders.
MongoDB remains the single source of truth.
Every operation is strictly scoped to `user_id == current_user.id`.
"""

from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query

from app.schemas.reminder import (
    ReminderCreateRequest,
    ReminderUpdateRequest,
    ReminderSnoozeRequest,
    NaturalLanguageReminderParseRequest,
)
from app.models.reminder import ReminderInDB
from app.dependencies.auth import get_current_user
from app.models.user import UserInDB
from app.services.ai_service import call_text_llm, clean_json_response
from app.services.n8n_service import trigger_n8n_reminder_workflow

router = APIRouter(prefix="/reminders", tags=["reminders"])


def _calculate_next_occurrence(due_date: datetime, repeat: str) -> datetime:
    """Calculates next occurrence datetime based on repeat configuration."""
    if repeat == "daily":
        return due_date + timedelta(days=1)
    elif repeat == "weekly":
        return due_date + timedelta(weeks=1)
    elif repeat == "monthly":
        return due_date + timedelta(days=30)
    elif repeat == "yearly":
        return due_date + timedelta(days=365)
    return due_date + timedelta(days=1)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=ReminderInDB,
    summary="Create a new reminder in MongoDB",
)
async def create_reminder(
    request: Request,
    body: ReminderCreateRequest,
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    reminder_id = f"rem_{uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)

    # Ensure due_date is offset-aware UTC datetime to prevent TypeError
    due_dt = body.due_date
    if isinstance(due_dt, datetime) and due_dt.tzinfo is None:
        due_dt = due_dt.replace(tzinfo=timezone.utc)

    # Determine initial status
    is_due = due_dt <= now
    initial_status = "due" if is_due else "pending"

    reminder_doc = {
        "_id": reminder_id,
        "id": reminder_id,
        "user_id": current_user.id,
        "case_id": body.case_id,
        "title": body.title.strip(),
        "notes": body.notes.strip() if body.notes else None,
        "due_date": due_dt,
        "timezone": body.timezone or "UTC",
        "repeat": body.repeat or "none",
        "priority": body.priority or "medium",
        "category": body.category or "Personal",
        "status": initial_status,
        "is_completed": False,
        "notification_channels": body.notification_channels or ["push", "email"],
        "shared_with": body.shared_with or [],
        "snoozed_until": None,
        "completed_at": None,
        "created_at": now,
        "updated_at": now,
    }

    await db.reminders.insert_one(reminder_doc)

    # If already due upon creation, immediately trigger workflow
    if is_due:
        await trigger_n8n_reminder_workflow(reminder_doc, db)

    return ReminderInDB(**reminder_doc)


@router.get(
    "",
    response_model=List[ReminderInDB],
    summary="List reminders for authenticated user with status/category filters",
)
async def list_reminders(
    request: Request,
    status_filter: Optional[str] = Query(default=None, alias="status"),
    category_filter: Optional[str] = Query(default=None, alias="category"),
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    # SECURITY RULE 12: Filter strictly by user_id
    query: Dict[str, Any] = {"user_id": current_user.id}
    now = datetime.now(timezone.utc)

    if status_filter:
        if status_filter == "overdue":
            query["is_completed"] = False
            query["due_date"] = {"$lt": now}
        elif status_filter == "today":
            start_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
            end_today = start_today + timedelta(days=1)
            query["due_date"] = {"$gte": start_today, "$lt": end_today}
        elif status_filter == "upcoming":
            query["is_completed"] = False
            query["due_date"] = {"$gt": now}
        else:
            query["status"] = status_filter

    if category_filter:
        query["category"] = category_filter

    cursor = db.reminders.find(query).sort("due_date", 1)
    docs = await cursor.to_list(length=200)

    result = []
    for doc in docs:
        doc["id"] = str(doc.get("_id") or doc.get("id"))
        result.append(ReminderInDB(**doc))

    return result


@router.put(
    "/{reminder_id}",
    response_model=ReminderInDB,
    summary="Update reminder details",
)
async def update_reminder(
    request: Request,
    reminder_id: str,
    body: ReminderUpdateRequest,
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    existing = await db.reminders.find_one({"_id": reminder_id, "user_id": current_user.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Reminder not found")

    now = datetime.now(timezone.utc)
    updates: Dict[str, Any] = {"updated_at": now}

    if body.title is not None:
        updates["title"] = body.title.strip()
    if body.notes is not None:
        updates["notes"] = body.notes.strip()
    if body.due_date is not None:
        due_dt = body.due_date
        if isinstance(due_dt, datetime) and due_dt.tzinfo is None:
            due_dt = due_dt.replace(tzinfo=timezone.utc)
        updates["due_date"] = due_dt
        updates["status"] = "due" if due_dt <= now else "pending"
    if body.priority is not None:
        updates["priority"] = body.priority
    if body.category is not None:
        updates["category"] = body.category
    if body.repeat is not None:
        updates["repeat"] = body.repeat
    if body.notification_channels is not None:
        updates["notification_channels"] = body.notification_channels
    if body.shared_with is not None:
        updates["shared_with"] = body.shared_with
    if body.timezone is not None:
        updates["timezone"] = body.timezone
    if body.is_completed is not None:
        updates["is_completed"] = body.is_completed
        updates["status"] = "completed" if body.is_completed else "pending"
        updates["completed_at"] = now if body.is_completed else None

    await db.reminders.update_one(
        {"_id": reminder_id, "user_id": current_user.id},
        {"$set": updates},
    )

    updated = await db.reminders.find_one({"_id": reminder_id, "user_id": current_user.id})
    updated["id"] = str(updated.get("_id") or updated.get("id"))
    return ReminderInDB(**updated)


@router.put(
    "/{reminder_id}/complete",
    response_model=ReminderInDB,
    summary="Mark reminder as completed (advances recurring reminders)",
)
async def complete_reminder(
    request: Request,
    reminder_id: str,
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    existing = await db.reminders.find_one({"_id": reminder_id, "user_id": current_user.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Reminder not found")

    now = datetime.now(timezone.utc)
    repeat_mode = existing.get("repeat", "none")

    # If recurring, calculate and schedule next occurrence
    if repeat_mode and repeat_mode != "none":
        next_due = _calculate_next_occurrence(existing["due_date"], repeat_mode)
        next_id = f"rem_{uuid4().hex[:12]}"
        next_doc = {
            **existing,
            "_id": next_id,
            "id": next_id,
            "due_date": next_due,
            "status": "pending",
            "is_completed": False,
            "completed_at": None,
            "snoozed_until": None,
            "created_at": now,
            "updated_at": now,
        }
        await db.reminders.insert_one(next_doc)

    await db.reminders.update_one(
        {"_id": reminder_id, "user_id": current_user.id},
        {"$set": {"is_completed": True, "status": "completed", "completed_at": now, "updated_at": now}},
    )

    updated = await db.reminders.find_one({"_id": reminder_id, "user_id": current_user.id})
    updated["id"] = str(updated.get("_id") or updated.get("id"))
    return ReminderInDB(**updated)


@router.put(
    "/{reminder_id}/snooze",
    response_model=ReminderInDB,
    summary="Snooze a reminder by specified minutes",
)
async def snooze_reminder(
    request: Request,
    reminder_id: str,
    body: ReminderSnoozeRequest,
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    existing = await db.reminders.find_one({"_id": reminder_id, "user_id": current_user.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Reminder not found")

    now = datetime.now(timezone.utc)
    snoozed_until = now + timedelta(minutes=body.minutes)

    await db.reminders.update_one(
        {"_id": reminder_id, "user_id": current_user.id},
        {
            "$set": {
                "status": "snoozed",
                "snoozed_until": snoozed_until,
                "updated_at": now,
            }
        },
    )

    updated = await db.reminders.find_one({"_id": reminder_id, "user_id": current_user.id})
    updated["id"] = str(updated.get("_id") or updated.get("id"))
    return ReminderInDB(**updated)


@router.delete(
    "/{reminder_id}",
    summary="Delete a reminder",
)
async def delete_reminder(
    request: Request,
    reminder_id: str,
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    res = await db.reminders.delete_one({"_id": reminder_id, "user_id": current_user.id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Reminder not found")

    return {"status": "deleted", "reminder_id": reminder_id}


@router.post(
    "/parse-nl",
    summary="Extract structured reminder parameters from natural language input via AI",
)
async def parse_natural_language_reminder(
    body: NaturalLanguageReminderParseRequest,
    _current_user: UserInDB = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    prompt = f"""
Extract reminder details from the following user prompt.
Current UTC Time: {now.isoformat()}
User Timezone: {body.user_timezone}

User Input: "{body.message}"

Return ONLY valid JSON:
{{
    "is_reminder_request": true or false,
    "title": "Clear concise reminder title",
    "due_date": "ISO 8601 string representation of due datetime",
    "category": "Study" or "Work" or "Finance" or "Personal" or "Family" or "Health" or "Documents" or "Other",
    "priority": "low" or "medium" or "high" or "urgent",
    "repeat": "none" or "daily" or "weekly" or "monthly" or "yearly"
}}
"""
    try:
        raw_res = call_text_llm(prompt, temperature=0.2)
        parsed = clean_json_response(raw_res)
        return parsed
    except Exception as exc:
        return {
            "is_reminder_request": True,
            "title": body.message[:100],
            "due_date": (now + timedelta(hours=24)).isoformat(),
            "category": "Personal",
            "priority": "medium",
            "repeat": "none",
        }


# ---------------------------------------------------------------------------
# Free Email Alerts & 1-Click Google Calendar Integrations
# ---------------------------------------------------------------------------

from pydantic import BaseModel
from app.services.reminder_service import create_google_calendar_link, send_free_email_alert


class EmailAlertRequest(BaseModel):
    case_id: Optional[str] = None
    title: str
    summary: str
    checklist: Optional[List[str]] = None
    recipient_email: Optional[str] = None
    due_date: Optional[datetime] = None


class CalendarLinkRequest(BaseModel):
    title: str
    details: str
    start_dt: Optional[datetime] = None


@router.post("/send-email", summary="Send free email notification & Google Calendar alert via Gmail SMTP")
async def send_email_notification_endpoint(
    body: EmailAlertRequest,
    current_user: UserInDB = Depends(get_current_user),
):
    target_email = body.recipient_email or current_user.email
    if not target_email:
        raise HTTPException(status_code=400, detail="No valid recipient email address provided")

    cal_link = create_google_calendar_link(
        title=body.title,
        details=body.summary,
        start_dt=body.due_date,
    )

    success = send_free_email_alert(
        recipient_email=target_email,
        case_title=body.title,
        summary=body.summary,
        checklist=body.checklist or [],
        google_calendar_url=cal_link,
    )

    return {
        "success": success,
        "recipient": target_email,
        "google_calendar_url": cal_link,
        "message": "Email alert dispatched successfully" if success else "Failed to send email alert",
    }


@router.post("/google-calendar", summary="Generate a 1-click Google Calendar template URL")
async def get_google_calendar_link(
    body: CalendarLinkRequest,
    _current_user: UserInDB = Depends(get_current_user),
):
    url = create_google_calendar_link(
        title=body.title,
        details=body.details,
        start_dt=body.start_dt,
    )
    return {"google_calendar_url": url}

"""
SumScale — n8n & Workflow Integration Router
============================================
Webhook endpoints for n8n execution triggers, due reminder processing,
and system status callbacks.
"""

import os
from datetime import datetime, timezone
from typing import Dict, Any
from fastapi import APIRouter, Request, HTTPException, Header, status

from app.services.n8n_service import trigger_n8n_reminder_workflow

router = APIRouter(prefix="/n8n", tags=["n8n"])

N8N_SECRET = os.getenv("N8N_WEBHOOK_SECRET", "sumscale_n8n_secret_key_2026")


@router.post(
    "/process-due-reminders",
    summary="Process pending/due reminders and trigger n8n notification workflows",
)
async def process_due_reminders(
    request: Request,
    x_sumscale_signature: str = Header(default=None),
):
    """
    Scans MongoDB for pending reminders whose due_date <= now.
    Triggers n8n / Push / Gmail workflows for each due reminder.
    Advances recurring reminders to their next calculated due date.
    """
    if x_sumscale_signature and x_sumscale_signature != N8N_SECRET:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature")

    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    now = datetime.now(timezone.utc)

    # Find pending or snoozed reminders that are due
    query = {
        "status": {"$in": ["pending", "snoozed"]},
        "$or": [
            {"due_date": {"$lte": now}},
            {"snoozed_until": {"$lte": now}},
        ],
    }

    cursor = db.reminders.find(query)
    due_reminders = await cursor.to_list(length=100)

    processed_count = 0
    for rem in due_reminders:
        # Mark status as due
        await db.reminders.update_one(
            {"_id": rem["_id"]},
            {"$set": {"status": "due", "updated_at": now}},
        )

        # Trigger n8n workflow
        await trigger_n8n_reminder_workflow(rem, db)
        processed_count += 1

    return {
        "status": "success",
        "processed_count": processed_count,
        "timestamp": now.isoformat(),
    }

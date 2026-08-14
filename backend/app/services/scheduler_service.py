"""
SumScale — APScheduler Background Service
=========================================
Runs two continuous agentic jobs:

1. check_due_reminders (every 30s)
   Finds pending/snoozed reminders that are due → marks as 'due'
   → triggers n8n / Push / Brevo notification workflows.

2. process_alert_queue (every 15s)
   Picks up queued/retry-eligible alerts from `alert_queue` collection
   → dispatches via Brevo REST API → handles success/failure/retry.
"""

import logging
from datetime import datetime, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler

logger = logging.getLogger("omniaid.scheduler")

scheduler = AsyncIOScheduler()


async def check_due_reminders(db):
    """
    Finds pending or snoozed reminders whose due_date or snoozed_until is in the past,
    updates their status to 'due', and dispatches notification workflows.
    """
    if db is None:
        return

    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    try:
        query = {
            "status": {"$in": ["pending", "snoozed"]},
            "$or": [
                {"due_date": {"$lte": now}},
                {"due_date": {"$lte": now_iso}},
                {"snoozed_until": {"$lte": now}},
                {"snoozed_until": {"$lte": now_iso}},
            ],
        }
        cursor = db.reminders.find(query)
        due_list = await cursor.to_list(length=100)

        for rem in due_list:
            rem_id = rem["_id"]
            await db.reminders.update_one(
                {"_id": rem_id},
                {"$set": {"status": "due", "updated_at": now}},
            )
            from app.services.n8n_service import trigger_n8n_reminder_workflow
            await trigger_n8n_reminder_workflow(rem, db)

        if len(due_list) > 0:
            logger.info(f"APScheduler: Processed {len(due_list)} due reminders.")
    except Exception as exc:
        logger.error(f"Error checking due reminders: {exc}")


async def run_alert_queue_processor(db):
    """
    Agentic alert queue processor — dispatches queued alerts via Brevo REST API,
    retries failures with exponential backoff, and logs all outcomes.
    Runs every 15 seconds to ensure near-real-time delivery.
    """
    if db is None:
        return

    try:
        from app.services.alert_engine import process_alert_queue
        count = await process_alert_queue(db)
        if count > 0:
            logger.info(f"Alert engine cycle: processed {count} alert(s).")
    except Exception as exc:
        logger.error(f"Alert queue processor error in scheduler: {exc}")


def start_scheduler(app):
    """Start background scheduler loop with both agentic jobs."""
    if not scheduler.running:
        db = getattr(app.state, "db", None)

        # Job 1: Due reminder checker — every 5 seconds
        scheduler.add_job(
            check_due_reminders,
            "interval",
            seconds=5,
            args=[db],
            id="check_due_reminders_job",
            replace_existing=True,
        )

        # Job 2: Agentic alert queue processor — every 5 seconds
        scheduler.add_job(
            run_alert_queue_processor,
            "interval",
            seconds=5,
            args=[db],
            id="alert_queue_processor_job",
            replace_existing=True,
        )

        scheduler.start()
        logger.info(
            "APScheduler started: "
            "[1] due-reminder checker (5s) "
            "[2] agentic alert queue processor (5s)"
        )


def shutdown_scheduler():
    """Shut down background scheduler loop."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler shut down.")

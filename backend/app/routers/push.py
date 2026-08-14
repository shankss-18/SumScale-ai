"""
SumScale — Web Push Subscriptions Router
========================================
Endpoints for registering and managing browser Web Push subscriptions.
Every subscription is bound strictly to `user_id == current_user.id`.
"""

from datetime import datetime, timezone
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, status, Request

from app.models.push_subscription import PushSubscriptionInDB, PushSubscriptionCreateRequest
from app.dependencies.auth import get_current_user
from app.models.user import UserInDB
from app.services.webpush_service import get_vapid_public_key

router = APIRouter(prefix="/push", tags=["push"])


@router.get(
    "/vapid-public-key",
    summary="Get VAPID public key for browser push registration",
)
async def get_public_key():
    return {"public_key": get_vapid_public_key()}


@router.post(
    "/subscribe",
    response_model=PushSubscriptionInDB,
    status_code=status.HTTP_201_CREATED,
    summary="Register browser Web Push subscription for authenticated user",
)
async def subscribe_push(
    request: Request,
    body: PushSubscriptionCreateRequest,
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    now = datetime.now(timezone.utc)
    user_agent = request.headers.get("user-agent")

    # Upsert by endpoint URL for current user
    existing = await db.push_subscriptions.find_one({"endpoint": body.endpoint})
    if existing:
        await db.push_subscriptions.update_one(
            {"_id": existing["_id"]},
            {
                "$set": {
                    "user_id": current_user.id,
                    "keys": body.keys.model_dump(),
                    "user_agent": user_agent,
                    "updated_at": now,
                }
            },
        )
        updated = await db.push_subscriptions.find_one({"_id": existing["_id"]})
        return PushSubscriptionInDB(**updated)

    sub_id = f"psub_{uuid4().hex[:12]}"
    doc = {
        "_id": sub_id,
        "user_id": current_user.id,
        "endpoint": body.endpoint,
        "keys": body.keys.model_dump(),
        "user_agent": user_agent,
        "created_at": now,
        "updated_at": now,
    }

    await db.push_subscriptions.insert_one(doc)
    return PushSubscriptionInDB(**doc)


@router.post(
    "/unsubscribe",
    summary="Unsubscribe browser push endpoint",
)
async def unsubscribe_push(
    request: Request,
    endpoint: str,
    current_user: UserInDB = Depends(get_current_user),
):
    db = getattr(request.app.state, "db", None)
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection unavailable")

    await db.push_subscriptions.delete_one({"endpoint": endpoint, "user_id": current_user.id})
    return {"status": "unsubscribed"}

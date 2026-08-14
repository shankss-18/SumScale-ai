"""
SumScale — Web Push Subscription Model
======================================
Pydantic v2 domain model for Web Push API subscriptions stored in MongoDB.
Each record is associated strictly with a specific user_id.
"""

from datetime import datetime, timezone
from typing import Dict, Optional
from pydantic import BaseModel, Field, ConfigDict


class PushSubscriptionKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionInDB(BaseModel):
    """
    MongoDB representation of a browser push subscription.
    """
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(alias="_id", description="Subscription unique ID")
    user_id: str = Field(description="Owner user ID")
    endpoint: str = Field(description="Browser Web Push endpoint URL")
    keys: PushSubscriptionKeys
    user_agent: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PushSubscriptionCreateRequest(BaseModel):
    endpoint: str
    keys: PushSubscriptionKeys

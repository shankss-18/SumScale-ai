"""
OmniAid — User Model
====================
Pydantic v2 domain model for User documents stored in MongoDB.
"""

from typing import Optional
from datetime import datetime, timezone
from pydantic import BaseModel, EmailStr, Field, ConfigDict


class UserInDB(BaseModel):
    """
    Representation of a User stored in MongoDB.
    """

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(alias="_id", description="MongoDB ObjectId as string")
    email: EmailStr
    full_name: Optional[str] = Field(default=None, description="User full name")
    phone_number: Optional[str] = Field(default=None, description="Optional phone number")
    hashed_password: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # Feature 3 — Proactive Alerts
    emergency_contact_phone: Optional[str] = Field(default=None, description="Emergency contact phone for health alerts")
    alert_consent: bool = Field(default=False, description="User has consented to emergency alerts")


class UserResponse(BaseModel):
    """
    Public user representation returned to clients — sensitive fields excluded.
    """

    id: str
    email: EmailStr
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    created_at: datetime
    emergency_contact_phone: Optional[str] = None
    alert_consent: bool = False



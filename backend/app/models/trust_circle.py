"""
SumScale — Trust Circle Member Model
=====================================
Pydantic v2 domain model for Trust Circle contacts stored in MongoDB.
Each record belongs to a specific user_id and contains granular permission toggles.

invite_status lifecycle:
  "pending"  → invitation sent, awaiting acceptance by recipient
  "accepted" → recipient accepted, both sides active
  "declined" → recipient declined, entry is kept for audit but inactive
  "manual"   → directly added without invite (legacy / self-added non-user contact)

sync_status:
  "origin"   → the user who initiated the invite/add
  "mirrored" → the counter-entry auto-created in the other user's circle
"""

from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, ConfigDict


class TrustCirclePermissions(BaseModel):
    """
    Granular permissions granted by the user to a trusted contact.
    All permissions default to FALSE for maximum privacy.
    """
    safety_alerts: bool = Field(default=False, description="Allow receiving emergency safety alerts")
    shared_reminders: bool = Field(default=False, description="Allow receiving shared reminders")
    shared_documents: bool = Field(default=False, description="Allow receiving shared document summaries")


class TrustCircleMemberInDB(BaseModel):
    """
    MongoDB representation of a trusted contact.
    """
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(description="Unique member ID")
    user_id: str = Field(description="Owner user ID")
    name: str = Field(max_length=150)
    relationship: str = Field(default="Friend", max_length=100)
    email: EmailStr
    phone: Optional[str] = Field(default=None)
    permissions: TrustCirclePermissions = Field(default_factory=TrustCirclePermissions)
    status: str = Field(default="active", description="active | inactive")

    # Invite flow fields
    invite_status: str = Field(
        default="manual",
        description="pending | accepted | declined | manual"
    )
    sync_status: str = Field(
        default="origin",
        description="origin (initiator) | mirrored (auto-created counterpart)"
    )
    # ID of the counterpart document in the other user's trust_circle
    mirror_member_id: Optional[str] = Field(default=None)
    # User ID of who sent the invite (for display in pending invites)
    invited_by_user_id: Optional[str] = Field(default=None)
    invited_by_name: Optional[str] = Field(default=None)
    invited_by_email: Optional[str] = Field(default=None)

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TrustCircleCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    relationship: str = Field(default="Friend", max_length=100)
    email: EmailStr
    phone: Optional[str] = None
    permissions: Optional[TrustCirclePermissions] = Field(default_factory=TrustCirclePermissions)


class TrustCircleUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=150)
    relationship: Optional[str] = Field(default=None, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    permissions: Optional[TrustCirclePermissions] = None
    status: Optional[str] = None

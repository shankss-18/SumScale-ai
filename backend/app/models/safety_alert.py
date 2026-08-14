"""
SumScale — Safety Alert Model
=============================
Pydantic v2 domain model for Safety Alerts stored in MongoDB.
Logs safety events triggered by explicit user confirmation.
"""

from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field, ConfigDict


class SafetyAlertInDB(BaseModel):
    """
    MongoDB representation of a safety alert event.
    """
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(description="Unique alert ID")
    user_id: str = Field(description="Owner user ID")
    user_name: str = Field(description="Name or email of user requesting help")
    user_email: str = Field(description="User email")
    status: str = Field(default="triggered", description="triggered | resolved")
    notified_members: List[Dict[str, Any]] = Field(default_factory=list, description="List of Trust Circle contacts notified")
    message_text: str = Field(description="Minimal safety alert text dispatched")
    audit_log: List[Dict[str, Any]] = Field(default_factory=list, description="Timestamped audit trail of dispatches")

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    resolved_at: Optional[datetime] = None


class SafetyAlertTriggerRequest(BaseModel):
    user_confirmation: bool = Field(..., description="Must be true to dispatch safety alert")
    note: Optional[str] = Field(default=None, description="Optional brief context provided by user")

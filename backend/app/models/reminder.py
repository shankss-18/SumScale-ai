"""
SumScale — Reminder Model
========================
Pydantic v2 domain model for Reminder documents stored in MongoDB.
Always associated with a specific user_id.
"""

from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class ReminderInDB(BaseModel):
    """
    Representation of a Reminder document stored in MongoDB.
    Always associated with a specific user_id.
    """

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(description="Reminder unique identifier")
    user_id: str = Field(description="Owner user ID")
    case_id: Optional[str] = Field(default=None, description="Linked case/document ID if applicable")
    title: str = Field(max_length=200)
    notes: Optional[str] = Field(default=None, max_length=1000)
    due_date: datetime
    timezone: str = Field(default="UTC", description="User local timezone identifier")
    repeat: str = Field(default="none", description="none | daily | weekly | monthly | yearly | custom")
    priority: str = Field(default="medium", description="low | medium | high | urgent")
    category: str = Field(default="Personal", description="Study | Work | Finance | Personal | Family | Health | Documents | Other")
    status: str = Field(default="pending", description="pending | due | completed | snoozed | overdue")
    is_completed: bool = False

    notification_channels: List[str] = Field(default_factory=lambda: ["push", "email"])
    shared_with: List[str] = Field(default_factory=list, description="Trust Circle member IDs shared with")

    snoozed_until: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

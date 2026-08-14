"""
SumScale — Reminder Schemas
==========================
Input validation schemas for creating, updating, and parsing reminders.
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class ReminderCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200, description="Reminder title")
    due_date: datetime = Field(description="ISO 8601 due date")
    notes: Optional[str] = Field(default=None, max_length=1000, description="Optional notes")
    case_id: Optional[str] = Field(default=None, max_length=100, description="Optional linked case ID")
    timezone: Optional[str] = Field(default="UTC")
    repeat: Optional[str] = Field(default="none", description="none | daily | weekly | monthly | yearly | custom")
    priority: Optional[str] = Field(default="medium", description="low | medium | high | urgent")
    category: Optional[str] = Field(default="Personal", description="Study | Work | Finance | Personal | Family | Health | Documents | Other")
    notification_channels: Optional[List[str]] = Field(default_factory=lambda: ["push", "email"])
    shared_with: Optional[List[str]] = Field(default_factory=list)


class ReminderUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    due_date: Optional[datetime] = None
    notes: Optional[str] = Field(default=None, max_length=1000)
    is_completed: Optional[bool] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    repeat: Optional[str] = None
    notification_channels: Optional[List[str]] = None
    shared_with: Optional[List[str]] = None
    timezone: Optional[str] = None


class ReminderSnoozeRequest(BaseModel):
    minutes: int = Field(default=15, ge=1, le=43200, description="Snooze duration in minutes")


class NaturalLanguageReminderParseRequest(BaseModel):
    message: str = Field(min_length=1, description="Natural language prompt like 'remind me to pay bills tomorrow 7pm'")
    user_timezone: Optional[str] = Field(default="UTC")

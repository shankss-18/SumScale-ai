"""
OmniAid — Case Model
====================
Pydantic v2 domain model for Case documents stored in MongoDB.
Encapsulates the multimodal intake envelope across Health, Fraud, and Data departments.
"""

from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field, ConfigDict


class EvidenceItem(BaseModel):
    file_id: Optional[str] = None
    file_type: str = Field(description="MIME type or category (e.g. image/png, audio/wav, text/plain)")
    original_name: Optional[str] = None
    extracted_text: Optional[str] = Field(default=None, max_length=10000)
    meta: Dict[str, Any] = Field(default_factory=dict)


class ClarifyingQA(BaseModel):
    question_id: str
    question: str = Field(max_length=500)
    answer: Optional[str] = Field(default=None, max_length=1000)
    answered_at: Optional[datetime] = None


class ReminderAction(BaseModel):
    reminder_id: str
    title: str = Field(max_length=200)
    due_date: datetime
    is_completed: bool = False
    notes: Optional[str] = Field(default=None, max_length=500)


class CaseInDB(BaseModel):
    """
    Representation of a Case stored in MongoDB.
    Always associated with a specific user_id.
    """

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(alias="_id", description="Case unique identifier")
    user_id: str = Field(description="Owner user ID")
    title: Optional[str] = Field(default=None, max_length=200, description="Custom chat/case title")
    department: Literal["health", "fraud", "data"]
    status: Literal["draft", "clarifying", "completed", "archived"] = "draft"
    
    evidence: List[EvidenceItem] = Field(default_factory=list)
    merged_facts: Dict[str, Any] = Field(default_factory=dict)
    clarifying_qa: List[ClarifyingQA] = Field(default_factory=list)
    findings: Dict[str, Any] = Field(default_factory=dict)
    reminder: Optional[ReminderAction] = None
    chat_history: List[Dict[str, Any]] = Field(default_factory=list)

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

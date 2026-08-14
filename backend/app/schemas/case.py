"""
OmniAid — Case Intake & Query Schemas
=====================================
Strict input validation schemas for case submission and interaction.
Imposes explicit character caps on free-text inputs.
"""

from typing import Optional, Literal
from pydantic import BaseModel, Field


class CaseCreateRequest(BaseModel):
    department: Literal["health", "fraud", "data"]
    description: Optional[str] = Field(
        default=None,
        max_length=5000,
        description="Free text input (e.g., symptom description, message text, notes). Maximum 5000 characters.",
    )


class CaseClarifyingAnswerRequest(BaseModel):
    question_id: str = Field(min_length=1, max_length=100)
    answer: str = Field(
        min_length=1,
        max_length=1000,
        description="User's answer to clarifying question. Maximum 1000 characters.",
    )


class CaseUpdateTitleRequest(BaseModel):
    title: str = Field(
        min_length=1,
        max_length=200,
        description="Custom title for case/chat session. Maximum 200 characters.",
    )


class CaseMarkCategoryRequest(BaseModel):
    status: Optional[str] = Field(default=None, description="Status category e.g. 'completed', 'clarifying', 'draft'")
    severity: Optional[str] = Field(default=None, description="Severity category e.g. 'high', 'medium', 'low'")



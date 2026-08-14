"""
SumScale — Chatbot Schemas
=========================
Input validation schemas for RAG Chatbot queries.
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(
        min_length=1,
        max_length=2000,
        description="User chat message or question about their case history.",
    )
    case_id: Optional[str] = Field(default=None, description="Optional target case_id to scope retrieval strictly to one case.")
    language: Optional[str] = Field(default="en", description="Output language code (e.g. en, hi, es)")
    chat_history: Optional[List[dict]] = Field(default_factory=list)


class CaseCitation(BaseModel):
    case_id: str
    department: str
    summary: str


class ChatResponse(BaseModel):
    answer: str
    cited_cases: List[CaseCitation] = Field(default_factory=list)
    suggested_next_questions: List[str] = Field(default_factory=list)
    auto_generated_title: Optional[str] = None
    safety_check: Optional[Dict[str, Any]] = None
    reminder_suggestion: Optional[Dict[str, Any]] = None

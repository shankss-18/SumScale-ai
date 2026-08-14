"""
SumScale — Fraud Verification Pydantic Schemas
================================================
Request and response models for POST /api/fraud/verify
and supporting endpoints.
"""

from typing import Optional, List, Literal
from datetime import datetime
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Request
# ---------------------------------------------------------------------------

class FraudVerifyRequest(BaseModel):
    entity_type: Literal["url", "phone", "domain", "ip"] = Field(
        ..., description="Type of entity to verify"
    )
    value: str = Field(..., min_length=1, max_length=2048, description="Entity value to check")


# ---------------------------------------------------------------------------
# Sub-check results
# ---------------------------------------------------------------------------

class SafeBrowsingResult(BaseModel):
    malicious: bool = False
    threat_type: Optional[str] = None
    source: str = "Google Safe Browsing"
    available: bool = True  # False if API key not configured


class VirusTotalResult(BaseModel):
    malicious_count: int = 0
    total_engines: int = 0
    engines_flagged: List[str] = []
    source: str = "VirusTotal"
    available: bool = True


class DomainAgeResult(BaseModel):
    created_date: Optional[str] = None
    age_days: Optional[int] = None
    is_new: bool = False          # True if age_days < 30
    source: str = "WhoisXML"
    available: bool = True


class PhoneResult(BaseModel):
    is_voip: bool = False
    is_disposable: bool = False
    risk_score: int = 0
    carrier: Optional[str] = None
    source: str = "IPQualityScore"
    available: bool = True


# ---------------------------------------------------------------------------
# Shared intelligence entry
# ---------------------------------------------------------------------------

class SharedIntelResult(BaseModel):
    found: bool = False
    report_count: int = 0
    auto_flagged: bool = False
    last_reported: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Unified Verdict
# ---------------------------------------------------------------------------

class EvidenceItem(BaseModel):
    source: str
    finding: str
    severity: Literal["safe", "suspicious", "malicious", "unknown"]


class FraudVerdict(BaseModel):
    entity_type: str
    value: str
    verdict: Literal["safe", "suspicious", "malicious", "unknown"]
    risk_score: int = Field(ge=0, le=100, description="0=safe, 100=definitely malicious")
    evidence: List[EvidenceItem] = []
    safe_browsing: Optional[SafeBrowsingResult] = None
    virus_total: Optional[VirusTotalResult] = None
    domain_age: Optional[DomainAgeResult] = None
    phone_check: Optional[PhoneResult] = None
    shared_intel: Optional[SharedIntelResult] = None
    cached: bool = False
    checked_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Intel stats
# ---------------------------------------------------------------------------

class IntelStats(BaseModel):
    total_entities_tracked: int
    auto_flagged_count: int
    top_flagged_this_week: List[dict] = []

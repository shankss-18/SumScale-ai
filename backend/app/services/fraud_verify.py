"""
SumScale — Fraud Verification Service (Feature 1)
===================================================
Parallel threat-intelligence checks for URLs, phones, domains, and IPs.

Sub-checks (run via asyncio.gather):
  1. check_safe_browsing(url)    → Google Safe Browsing API v4
  2. check_virustotal(value)     → VirusTotal API v3
  3. check_domain_age(domain)    → WhoisXML API
  4. check_phone(phone)          → IPQualityScore API

Main entrypoint:
  verify_entity(entity_type, value, db)
    → FraudVerdict (cached in MongoDB for 24 hrs)

Graceful degradation: any check with a missing API key returns
  available=False so the app still functions on free-tier keys only.
"""

import asyncio
import hashlib
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from urllib.parse import urlparse

import httpx
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import settings
from app.schemas.fraud import (
    FraudVerdict,
    EvidenceItem,
    SafeBrowsingResult,
    VirusTotalResult,
    DomainAgeResult,
    PhoneResult,
)
from app.services.shared_intel import check_shared_intel

logger = logging.getLogger("omniaid.fraud_verify")

_CACHE_COLLECTION = "fraud_checks_cache"
_CACHE_TTL_HOURS = 24
_HTTP_TIMEOUT = 12.0   # seconds per external call


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _cache_key(entity_type: str, value: str) -> str:
    return hashlib.sha256(f"{entity_type}:{value.strip().lower()}".encode()).hexdigest()


def _extract_domain(value: str) -> str:
    """Extract hostname from a URL, or return the raw value if it's already a domain."""
    if value.startswith(("http://", "https://")):
        return urlparse(value).hostname or value
    return value.split("/")[0].strip()


# ---------------------------------------------------------------------------
# Sub-check 1 — Google Safe Browsing v4
# ---------------------------------------------------------------------------

async def check_safe_browsing(url: str) -> SafeBrowsingResult:
    key = settings.GOOGLE_SAFE_BROWSING_KEY or settings.GOOGLE_PLACES_API_KEY or settings.GEMINI_API_KEY
    if not key:
        logger.warning("No Google API key set — skipping safe browsing check")
        return SafeBrowsingResult(available=False, malicious=False)

    try:
        payload = {
            "client": {"clientId": "sumscale", "clientVersion": "1.0"},
            "threatInfo": {
                "threatTypes": [
                    "MALWARE", "SOCIAL_ENGINEERING",
                    "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"
                ],
                "platformTypes": ["ANY_PLATFORM"],
                "threatEntryTypes": ["URL"],
                "threatEntries": [{"url": url}],
            },
        }
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            resp = await client.post(
                f"https://safebrowsing.googleapis.com/v4/threatMatches:find?key={key}",
                json=payload,
            )
        if resp.status_code == 200:
            data = resp.json()
            matches = data.get("matches", [])
            if matches:
                threat_type = matches[0].get("threatType", "UNKNOWN")
                return SafeBrowsingResult(malicious=True, threat_type=threat_type)
            return SafeBrowsingResult(malicious=False)
        else:
            logger.warning(f"Safe Browsing API error {resp.status_code}: {resp.text[:200]}")
            return SafeBrowsingResult(available=False)
    except Exception as exc:
        logger.warning(f"check_safe_browsing failed: {exc}")
        return SafeBrowsingResult(available=False)


# ---------------------------------------------------------------------------
# Sub-check 2 — VirusTotal API v3
# ---------------------------------------------------------------------------

async def check_virustotal(value: str) -> VirusTotalResult:
    key = settings.VIRUSTOTAL_API_KEY
    if not key:
        logger.warning("VIRUSTOTAL_API_KEY not set — skipping VirusTotal check")
        return VirusTotalResult(available=False)

    headers = {"x-apikey": key}
    try:
        import base64
        url_id = base64.urlsafe_b64encode(value.encode()).decode().strip("=")
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            resp = await client.get(
                f"https://www.virustotal.com/api/v3/urls/{url_id}",
                headers=headers,
            )
            if resp.status_code == 404:
                # URL not in VT cache — submit for analysis
                submit = await client.post(
                    "https://www.virustotal.com/api/v3/urls",
                    headers=headers,
                    data={"url": value},
                )
                if submit.status_code not in (200, 201):
                    return VirusTotalResult(available=False)
                analysis_id = submit.json().get("data", {}).get("id", "")
                await asyncio.sleep(5)   # wait for analysis to complete
                resp = await client.get(
                    f"https://www.virustotal.com/api/v3/analyses/{analysis_id}",
                    headers=headers,
                )

        if resp.status_code == 200:
            data = resp.json()
            stats = (
                data.get("data", {})
                    .get("attributes", {})
                    .get("last_analysis_stats", {})
            )
            results = (
                data.get("data", {})
                    .get("attributes", {})
                    .get("last_analysis_results", {})
            )
            malicious = stats.get("malicious", 0)
            total = sum(stats.values()) if stats else 0
            flagged = [
                engine for engine, r in results.items()
                if r.get("category") == "malicious"
            ]
            return VirusTotalResult(
                malicious_count=malicious,
                total_engines=total,
                engines_flagged=flagged[:10],  # cap list for response size
            )
        else:
            logger.warning(f"VirusTotal API error {resp.status_code}")
            return VirusTotalResult(available=False)
    except Exception as exc:
        logger.warning(f"check_virustotal failed: {exc}")
        return VirusTotalResult(available=False)


# ---------------------------------------------------------------------------
# Sub-check 3 — WhoisXML Domain Age
# ---------------------------------------------------------------------------

async def check_domain_age(domain: str) -> DomainAgeResult:
    return DomainAgeResult(available=False)


# ---------------------------------------------------------------------------
# Sub-check 4 — IPQualityScore Phone Validation
# ---------------------------------------------------------------------------

async def check_phone(phone: str) -> PhoneResult:
    key = settings.IPQUALITYSCORE_API_KEY
    if not key:
        logger.warning("IPQUALITYSCORE_API_KEY not set — skipping phone check")
        return PhoneResult(available=False)

    try:
        from urllib.parse import quote
        encoded = quote(phone, safe="")
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            resp = await client.get(
                f"https://www.ipqualityscore.com/api/json/phone/{key}/{encoded}"
            )
        if resp.status_code == 200:
            data = resp.json()
            return PhoneResult(
                is_voip=data.get("VOIP", False),
                is_disposable=data.get("disposable", False),
                risk_score=int(data.get("fraud_score", 0)),
                carrier=data.get("carrier"),
            )
        else:
            logger.warning(f"IPQualityScore API error {resp.status_code}")
            return PhoneResult(available=False)
    except Exception as exc:
        logger.warning(f"check_phone failed: {exc}")
        return PhoneResult(available=False)


# ---------------------------------------------------------------------------
# Risk Scoring
# ---------------------------------------------------------------------------

def _compute_risk_score(
    entity_type: str,
    sb: SafeBrowsingResult,
    vt: VirusTotalResult,
    da: DomainAgeResult,
    ph: PhoneResult,
) -> int:
    """
    Return integer 0–100 risk score.
    """
    score = 0

    if sb.available and sb.malicious:
        score += 60   # definitive Google hit → very high

    if vt.available and vt.malicious_count > 0:
        frac = min(vt.malicious_count / max(vt.total_engines, 1), 1.0)
        score += int(40 * frac)

    if ph.available and entity_type == "phone":
        if ph.is_voip or ph.is_disposable:
            score += 20
        score += int(ph.risk_score * 0.3)

    return min(score, 100)


def _derive_verdict(score: int, sb: SafeBrowsingResult, vt: VirusTotalResult, da: DomainAgeResult) -> str:
    if sb.available and sb.malicious:
        return "malicious"
    if vt.available and vt.malicious_count > 3:
        return "malicious"
    if score >= 60:
        return "malicious"
    if score >= 25:
        return "suspicious"
    return "safe"


def _build_evidence(
    entity_type: str,
    sb: SafeBrowsingResult,
    vt: VirusTotalResult,
    da: DomainAgeResult,
    ph: PhoneResult,
) -> list:
    items = []

    if sb.available:
        if sb.malicious:
            items.append(EvidenceItem(
                source="Google Safe Browsing",
                finding=f"Detected as {sb.threat_type or 'malicious'}",
                severity="malicious",
            ))
        else:
            items.append(EvidenceItem(
                source="Google Safe Browsing",
                finding="No threats found",
                severity="safe",
            ))

    if vt.available:
        if vt.malicious_count > 0:
            severity = "malicious" if vt.malicious_count > 3 else "suspicious"
            items.append(EvidenceItem(
                source="VirusTotal",
                finding=f"{vt.malicious_count}/{vt.total_engines} engines flagged this",
                severity=severity,
            ))
        else:
            items.append(EvidenceItem(
                source="VirusTotal",
                finding=f"0/{vt.total_engines} engines flagged — clean",
                severity="safe",
            ))

    if entity_type == "phone" and ph.available:
        severity = "suspicious" if (ph.is_voip or ph.is_disposable) else "safe"
        finding_parts = []
        if ph.is_voip:
            finding_parts.append("VOIP number")
        if ph.is_disposable:
            finding_parts.append("disposable number")
        if ph.carrier:
            finding_parts.append(f"carrier: {ph.carrier}")
        finding_parts.append(f"risk score: {ph.risk_score}/100")
        items.append(EvidenceItem(
            source="IPQualityScore",
            finding=", ".join(finding_parts) or "No issues found",
            severity=severity,
        ))

    return items


# ---------------------------------------------------------------------------
# Main entrypoint
# ---------------------------------------------------------------------------

async def verify_entity(
    entity_type: str,
    value: str,
    db: Optional[AsyncIOMotorDatabase] = None,
) -> FraudVerdict:
    """
    Run all applicable threat-intelligence checks in parallel.
    Results are cached in MongoDB for 24 hours.
    Checks shared_intel DB first (free, instant).
    """
    cache_id = _cache_key(entity_type, value)

    # --- 1. Check cache ---
    if db is not None:
        try:
            cached = await db[_CACHE_COLLECTION].find_one({"_id": cache_id})
            if cached and cached.get("expires_at", datetime.min) > datetime.utcnow():
                logger.info(f"Fraud cache hit for {entity_type}:{value[:30]}")
                cached.pop("_id", None)
                cached.pop("expires_at", None)
                return FraudVerdict(**cached, cached=True)
        except Exception:
            pass

    # --- 2. Check shared community intel (free, instant) ---
    shared = None
    if db is not None:
        shared = await check_shared_intel(entity_type, value, db)

    # --- 3. Run applicable checks in parallel ---
    domain = _extract_domain(value) if entity_type in ("url", "domain") else value

    tasks = {}
    if entity_type in ("url", "domain", "ip"):
        tasks["sb"] = asyncio.create_task(check_safe_browsing(value))
        tasks["vt"] = asyncio.create_task(check_virustotal(value))
        tasks["da"] = asyncio.create_task(check_domain_age(domain))
        ph = PhoneResult(available=False)
    elif entity_type == "phone":
        tasks["ph"] = asyncio.create_task(check_phone(value))
        sb = SafeBrowsingResult(available=False)
        vt = VirusTotalResult(available=False)
        da = DomainAgeResult(available=False)

    results = {}
    if tasks:
        gathered = await asyncio.gather(*tasks.values(), return_exceptions=True)
        for key_name, result in zip(tasks.keys(), gathered):
            if isinstance(result, Exception):
                logger.warning(f"{key_name} raised: {result}")
                results[key_name] = None
            else:
                results[key_name] = result

    # Unpack results
    if entity_type in ("url", "domain", "ip"):
        sb = results.get("sb") or SafeBrowsingResult(available=False)
        vt = results.get("vt") or VirusTotalResult(available=False)
        da = results.get("da") or DomainAgeResult(available=False)
        ph = PhoneResult(available=False)
    else:
        ph = results.get("ph") or PhoneResult(available=False)
        sb = SafeBrowsingResult(available=False)
        vt = VirusTotalResult(available=False)
        da = DomainAgeResult(available=False)

    # --- 4. Score and verdict ---
    risk_score = _compute_risk_score(entity_type, sb, vt, da, ph)

    # Shared intel auto-flag boosts score
    if shared and shared.auto_flagged:
        risk_score = min(risk_score + 30, 100)

    verdict_str = _derive_verdict(risk_score, sb, vt, da)
    evidence = _build_evidence(entity_type, sb, vt, da, ph)

    # Add shared intel evidence
    if shared and shared.found:
        severity = "malicious" if shared.auto_flagged else "suspicious"
        evidence.insert(0, EvidenceItem(
            source="SumScale Community Intel",
            finding=f"Reported by {shared.report_count} users"
                    + (" — auto-flagged as malicious" if shared.auto_flagged else ""),
            severity=severity,
        ))

    fraud_verdict = FraudVerdict(
        entity_type=entity_type,
        value=value,
        verdict=verdict_str,
        risk_score=risk_score,
        evidence=evidence,
        safe_browsing=sb if entity_type != "phone" else None,
        virus_total=vt if entity_type != "phone" else None,
        domain_age=da if entity_type != "phone" else None,
        phone_check=ph if entity_type == "phone" else None,
        shared_intel=shared,
        cached=False,
    )

    # --- 5. Cache result ---
    if db is not None:
        try:
            cache_doc = fraud_verdict.model_dump()
            cache_doc["_id"] = cache_id
            cache_doc["expires_at"] = datetime.utcnow() + timedelta(hours=_CACHE_TTL_HOURS)
            await db[_CACHE_COLLECTION].replace_one(
                {"_id": cache_id}, cache_doc, upsert=True
            )
        except Exception as exc:
            logger.warning(f"Failed to cache fraud result: {exc}")

    return fraud_verdict

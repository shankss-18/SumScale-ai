"""
OmniAid — RAG Chatbot Service
===============================
Answers user questions grounded exclusively in the requesting user's own case history with a warm, human-like voice.

Security Rules:
- Query is strictly scoped to requesting user's user_id.
- Context wrapped in <user_data> delimiters to prevent prompt injection.
- Cites specific case IDs or departments in the response.
"""

import asyncio
import json
import logging
from typing import List, Dict, Any

from app.services.ai_service import call_text_llm, clean_json_response, PROMPT_INJECTION_PROTECTION

logger = logging.getLogger("omniaid.chat_service")

# Retry config for Gemini 429 rate-limit handling
_MAX_RETRIES = 3
_RETRY_BASE_DELAY_S = 5  # seconds — grows exponentially per attempt


def _build_grounded_fallback_answer(user_message: str, user_cases: List[Dict[str, Any]], threat_report: str = "") -> str:
    """
    Generates a message-SPECIFIC fallback answer when the LLM call fails.
    Mines actual extracted facts (symptoms, medications, lab summaries) from the case data
    instead of returning hardcoded generic boilerplate.
    """
    import random

    if threat_report:
        return (
            f"I ran a live threat intelligence check on that for you.\n\n{threat_report}\n\n"
            "Take a look at the risk scores above — if anything shows as suspicious or malicious, "
            "please don't engage with it further and report it to the relevant authorities."
        )

    latest_case = user_cases[0] if user_cases else {}
    findings = latest_case.get("findings", {})
    merged_facts = latest_case.get("merged_facts", {})
    dept = (latest_case.get("department") or "general").lower()
    msg_lower = user_message.lower()

    # 1. Mine raw extracted document text for direct keyword matches
    doc_text_snippets = []
    for c in user_cases:
        for ev in c.get("evidence", []):
            txt = (ev.get("extracted_text") or "").strip()
            if txt and len(txt) > 20 and "content extraction failed" not in txt.lower():
                doc_text_snippets.append(txt)

    full_doc_text = "\n".join(doc_text_snippets)
    msg_keywords = [w for w in msg_lower.split() if len(w) > 3 and w not in ["what", "how", "why", "when", "where", "should", "this", "that", "from", "with"]]

    matching_lines = []
    if msg_keywords:
        for line in full_doc_text.splitlines():
            line_clean = line.strip()
            if len(line_clean) > 15 and any(kw in line_clean.lower() for kw in msg_keywords):
                matching_lines.append(line_clean)

    if matching_lines:
        quoted_evidence = "\n".join([f"• {line[:250]}" for line in matching_lines[:3]])
        return (
            f"Here are the specific details extracted from your documents:\n\n{quoted_evidence}\n\n"
            "Let me know if you would like a deeper breakdown or specific calculations based on these details!"
        )

    summary = findings.get("summary") or findings.get("pattern_classification") or merged_facts.get("report_summary") or "Document Analysis"
    followup_options = [
        " What specific part of your results would you like me to break down further?",
        " Want me to explain what any of these findings mean in everyday language?",
        " Let me know if you'd like a step-by-step action plan based on these results.",
    ]

    return f"Based on your document analysis ({dept.upper()}): {summary}." + random.choice(followup_options)


import re
from app.services.fraud_verify import verify_entity

_URL_RE = re.compile(r"https?://[^\s\"'<>]+|www\.[^\s\"'<>]+")
_PHONE_RE = re.compile(r"(?:\+91[\-\s]?)?[6-9]\d{9}\b")
_IP_RE = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")


async def _check_fraud_in_chat(user_message: str, user_cases: List[Dict[str, Any]], db: Any = None) -> str:
    """
    Scans user message (and cases) for URLs, phone numbers, IPs, or domains,
    runs verify_entity on them, and formats a human-readable threat analysis table with scores.
    """
    found_entities = []
    
    # Extract URLs from message
    for url in _URL_RE.findall(user_message):
        found_entities.append(("url", url.strip()))
        
    # Extract Phone numbers from message
    if not found_entities:
        for ph in _PHONE_RE.findall(user_message):
            clean_ph = ph.strip().replace(" ", "").replace("-", "")
            if len(clean_ph) == 10 and clean_ph[0] in "6789":
                found_entities.append(("phone", clean_ph))
                
    # Extract IPs from message
    if not found_entities:
        for ip in _IP_RE.findall(user_message):
            found_entities.append(("ip", ip.strip()))
            
    # Check if user explicitly asks to verify/check a link, phone, or threat entity
    msg_lower = user_message.lower()
    is_explicit_verify_query = any(k in msg_lower for k in ["verify number", "verify phone", "check link", "check url", "is this phone safe", "is this number safe", "check ip", "verify entity"])
    
    if not found_entities and is_explicit_verify_query:
        for c in user_cases:
            evidence_list = c.get("evidence", [])
            for ev in evidence_list:
                text = ev.get("extracted_text", "")
                urls = _URL_RE.findall(text)
                if urls:
                    found_entities.append(("url", urls[0].strip()))
                    break
                phones = _PHONE_RE.findall(text)
                if phones:
                    clean_p = phones[0].strip().replace(" ", "").replace("-", "")
                    if len(clean_p) == 10 and clean_p[0] in "6789":
                        found_entities.append(("phone", clean_p))
                        break
            if found_entities:
                break

    if not found_entities:
        return ""

    results_formatted = []
    for etype, val in found_entities[:2]:  # check up to 2 entities
        try:
            verdict = await verify_entity(etype, val, db)
            badge = "🟢 SAFE" if verdict.verdict == "safe" else ("🟡 SUSPICIOUS" if verdict.verdict == "suspicious" else "🔴 MALICIOUS")
            
            details = [
                f"### 🛡️ Fraud & Security Intelligence Report for `{val}`",
                f"**Overall Verdict**: **{badge}** | **Risk Score: {verdict.risk_score}/100**",
                "",
                "| Threat Intelligence Source | Status / Finding | Severity Level |",
                "| :--- | :--- | :--- |"
            ]
            
            for ev in verdict.evidence:
                sev_icon = "🟢" if ev.severity == "safe" else ("🟡" if ev.severity == "suspicious" else ("🔴" if ev.severity == "malicious" else "⚪"))
                details.append(f"| **{ev.source}** | {sev_icon} {ev.finding} | `{ev.severity.upper()}` |")
                
            if verdict.phone_check and verdict.phone_check.available:
                pc = verdict.phone_check
                details.append(f"| **IPQualityScore Phone Validation** | Carrier: {pc.carrier or 'Unknown'} (VOIP: {pc.is_voip}, Disposable: {pc.is_disposable}) | Fraud Score: `{pc.risk_score}/100` |")
                
            if verdict.virus_total and verdict.virus_total.available:
                vt = verdict.virus_total
                details.append(f"| **VirusTotal Engine Consensus** | {vt.malicious_count}/{vt.total_engines} engines flagged as malicious | `MALICIOUS COUNT: {vt.malicious_count}` |")
                
            if verdict.domain_age and verdict.domain_age.available:
                da = verdict.domain_age
                details.append(f"| **WhoisXML Domain Age Check** | Domain Age: {da.age_days} days (Created: {da.created_date or 'N/A'}) | `{'NEW DOMAIN (RISK)' if da.is_new else 'ESTABLISHED'}` |")

            if verdict.shared_intel and verdict.shared_intel.found:
                details.append(f"| **SumScale Community Intel** | Reported by {verdict.shared_intel.report_count} users | `{'AUTO-FLAGGED' if verdict.shared_intel.auto_flagged else 'REPORTED'}` |")
                
            results_formatted.append("\n".join(details))
        except Exception as exc:
            logger.warning(f"Error verifying entity {val} in chat: {exc}")

    return "\n\n---\n\n".join(results_formatted)


async def generate_grounded_chat_response(
    user_message: str,
    user_cases: List[Dict[str, Any]],
    language: str = "en",
    chat_history: List[Dict[str, Any]] = None,
    db: Any = None,
) -> Dict[str, Any]:
    """
    Format user cases and recent conversation history as RAG context.
    Automatically performs live threat intelligence entity verification if URLs, phones, or fraud queries are detected.
    Automatically retries up to 3 times on 429 RESOURCE_EXHAUSTED errors.
    Returns {"answer": "...", "cited_cases": [...]} in user's target language.
    """
    # 1. Run live threat verification if applicable
    threat_intel_report = await _check_fraud_in_chat(user_message, user_cases, db)

    formatted_cases = []
    # Cap at top 3 cases to keep prompt token footprint lean and prevent rate limits
    for c in user_cases[:3]:
        case_id = str(c.get("_id") or c.get("id"))
        dept = c.get("department")
        findings = c.get("findings", {})
        merged_facts = c.get("merged_facts", {})

        summary = (
            findings.get("summary")
            or findings.get("pattern_classification")
            or merged_facts.get("report_summary")
            or ""
        )

        # Include raw extracted text from evidence items capped at 800 chars
        evidence_details = []
        for idx, ev in enumerate(c.get("evidence", [])[:3], 1):
            extracted = (ev.get("extracted_text") or "").strip()
            if extracted and "content extraction failed" not in extracted.lower():
                ev_type = ev.get("type") or ev.get("artifact_type") or f"document_{idx}"
                evidence_details.append({
                    "document_type": ev_type,
                    "content": extracted[:800],  # cap at 800 chars per doc to preserve daily quota
                })

        formatted_cases.append({
            "case_id": case_id,
            "department": dept,
            "status": c.get("status"),
            "summary": summary,
            "merged_facts": merged_facts,
            "findings": findings,
            "raw_documents": evidence_details,
            "created_at": str(c.get("created_at")),
        })

    cases_context_json = json.dumps(formatted_cases, indent=2)

    # Format recent conversation history for full multi-turn memory
    formatted_history = []
    if chat_history:
        for m in chat_history[-10:]:  # Keep last 10 messages
            sender_role = "User" if m.get("sender") in ["user", "human"] else "AI Assistant"
            text_content = (m.get("text") or m.get("message") or "").strip()
            if text_content:
                formatted_history.append(f"{sender_role}: {text_content}")

    history_str = "\n".join(formatted_history) if formatted_history else "No prior conversation turns yet in this session."

    LANG_NAMES = {
        "en": "English",
        "hi": "Hindi (हिन्दी)",
        "te": "Telugu (తెలుగు)",
        "ta": "Tamil (தமிழ்)",
        "kn": "Kannada (ಕನ್ನಡ)",
    }
    lang_name = LANG_NAMES.get(language, "English")

    default_next_questions = [
        "What step-by-step precautions should I take?",
        "Set up email & Google Calendar reminders for this case",
        "Explain key terms simply"
    ]

    threat_prompt_section = ""
    if threat_intel_report:
        threat_prompt_section = f"\n\nLIVE THREAT INTELLIGENCE VERIFICATION RESULTS:\n{threat_intel_report}\n\nIMPORTANT: Include the above Threat Intelligence Report table with risk scores, IPQualityScore, VirusTotal, and WhoisXML details prominently in your response so the user gets complete trust, transparency, and numerical risk scores."

    import time
    _seed = int(time.time()) % 10000

    # Universal Dynamic Concept Classification from case department & text content
    context_text_lower = (user_message + " " + cases_context_json).lower()

    # 1. Fraud & Cybersecurity
    if any(k in context_text_lower for k in ["fraud", "scam", "phishing", "fake invoice", "bank alert", "otp", "suspicious link", "upi", "sms scam", "urgent payment"]):
        concept_type = "fraud"
        system_persona = "You are SumScale Copilot — a sharp, expert Cybersecurity, Phishing & Fraud Intelligence Specialist. You speak like a protective security analyst who helps users identify scam emails, fake invoices, phishing links, SMS fraud, and suspicious payment requests."
        domain_mandate = "Analyze the document strictly for scam indicators, fake invoice signs, phishing domain red flags, unverified UPI IDs, urgency phrasing, and security precautions. DO NOT use medical language."
        domain_reasoning = "Step 4: Add one sentence of security context if helpful ('Official banks will never ask for PINs or credentials via email...')."
        default_next_questions = [
            "How can I tell if this sender address is legitimate?",
            "What step-by-step precautions should I take against this scam?",
            "Where can I report this suspicious communication?"
        ]
    # 2. Health & Medical
    elif any(k in context_text_lower for k in ["blood", "symptom", "doctor", "hospital", "prescription", "clinic", "diagnosis", "health", "medical", "patient", "lab", "cholesterol", "report"]):
        concept_type = "health"
        system_persona = "You are SumScale Copilot — a sharp, empathetic AI Health & Medical Assistant. You speak like a brilliant, caring friend who happens to have medical and analytical expertise."
        domain_mandate = "Quote actual lab values, symptoms, medications, reference ranges, or doctor notes from the user's health documents. Provide clear, empathetic medical context."
        domain_reasoning = "Step 4: Add one sentence of medical context if helpful ('High LDL is linked to...')."
        default_next_questions = [
            "What are the main risk factors in my document?",
            "Explain key medical terms simply",
            "What step-by-step precautions should I take?"
        ]
    # 3. Financial & Accounting
    elif any(k in context_text_lower for k in ["tax", "balance sheet", "revenue", "expense", "bank statement", "accounting", "audit", "payroll", "financial", "salary", "profit"]):
        concept_type = "financial"
        system_persona = "You are SumScale Copilot — a sharp, analytical Financial & Accounting Specialist. You speak like an expert CPA and financial auditor."
        domain_mandate = "Quote exact dollar/rupee amounts, transaction dates, vendor names, line items, and financial balances from the documents."
        domain_reasoning = "Step 4: Add one sentence of financial context if helpful ('Comparing total revenue against operating expenses...')."
        default_next_questions = [
            "What are the largest expenses or line items in this document?",
            "Are there any financial discrepancies or unusual figures?",
            "Can you summarize the overall financial standing?"
        ]
    # 4. Legal & Contracts
    elif any(k in context_text_lower for k in ["contract", "agreement", "clause", "legal", "nda", "tenant", "lease", "court", "liability", "party"]):
        concept_type = "legal"
        system_persona = "You are SumScale Copilot — a sharp, meticulous Legal & Contract Auditor. You speak like a senior legal counsel."
        domain_mandate = "Quote exact clause numbers, legal obligations, party names, effective dates, liability caps, or termination conditions."
        domain_reasoning = "Step 4: Add one sentence of legal context if helpful ('Standard indemnification clauses typically state...')."
        default_next_questions = [
            "What are my key obligations and deadlines under this agreement?",
            "Are there any high-risk clauses or liability caps?",
            "What are the termination conditions outlined here?"
        ]
    # 5. Technical & Engineering
    elif any(k in context_text_lower for k in ["error", "exception", "traceback", "stack trace", "code", "api", "database", "python", "json", "config"]):
        concept_type = "tech"
        system_persona = "You are SumScale Copilot — a principal Systems Architect & Software Engineer. You diagnose software issues with surgical precision."
        domain_mandate = "Quote exact error codes, function signatures, file paths, line numbers, or code blocks from the technical documents."
        domain_reasoning = "Step 4: Add one sentence of architectural context if helpful ('Unhandled exceptions in async loops usually occur when...')."
        default_next_questions = [
            "What is the root cause of this technical error?",
            "How can I fix this code or configuration issue?",
            "What best practices should I follow to prevent this?"
        ]
    # 6. Universal / General
    else:
        concept_type = "general"
        system_persona = "You are SumScale Copilot — a brilliant, multi-domain Universal Document Intelligence Assistant. You analyze any document type with high precision."
        domain_mandate = "Quote exact facts, dates, names, key takeaways, and specific data points from the user's uploaded documents."
        domain_reasoning = "Step 4: Add one sentence of helpful synthesis context."
        default_next_questions = [
            "What are the key takeaways from my document?",
            "Can you summarize the main sections simply?",
            "What action items or next steps are outlined?"
        ]

    # Build a compact document inventory summary for the prompt header
    doc_inventory_lines = []
    for fc in formatted_cases:
        for rd in fc.get("raw_documents", []):
            doc_inventory_lines.append(f"  • [{rd['document_type']}] from case {fc['case_id'][:8]}...")
    doc_inventory = "\n".join(doc_inventory_lines) if doc_inventory_lines else "  • No documents available"

    prompt = f"""{PROMPT_INJECTION_PROTECTION}

{system_persona} Your job is to answer the user's EXACT question using the real content from their uploaded documents.

================================================================================
LANGUAGE: Write ALL output exclusively in **{lang_name}** ({language}). No English unless language is 'en'.
================================================================================

📄 DOCUMENTS UPLOADED BY USER:
{doc_inventory}

🚨 NON-REPETITION & DIRECT ANSWER MANDATE (CRITICAL — VIOLATION = FAILURE):
This is turn #{_seed}. You MUST:
1. DO NOT start your response with template intro phrases like:
   - "Regarding your question..."
   - "Based on your security analysis..."
   - "Looking at your uploaded documents..."
   - "In plain terms..."
   - "I took a close look at your records..."
2. JUMP DIRECTLY into answering the user's specific question using exact facts, names, numbers, dates, links, or quotes from their document.
3. READ the `raw_documents` section in the case data — it contains the ACTUAL text from the user's uploaded files.
4. {domain_mandate}
5. NEVER give generic advice unless tied to a specific finding in their document.
6. Vary your sentence structure, vocabulary, and formatting across every response — check <conversation_history> to ensure your response is unique and non-repetitive.

🧠 REASONING PROCESS (follow this before writing your answer):
Step 1: Identify the exact question the user is asking.
Step 2: Find the relevant data in `raw_documents` and `merged_facts`.
Step 3: Answer THAT question directly with THOSE specific facts.
{domain_reasoning}
Step 5: Offer ONE natural follow-up question.{threat_prompt_section}

TONE:
- Direct, warm, analytical, and tailored to the concept ({concept_type.upper()}).
- Match tone to emotion: worried → reassuring with facts; curious → explanatory; urgent → clear action-focused.
- Use "you" and "your". Short paragraphs. No bullet-point walls unless listing steps.
- NEVER use "SOURCES CITED" footer.

CONVERSATION MEMORY: Check <conversation_history> — build naturally on what was discussed.

<user_data>
CASE DATA (includes raw document content in `raw_documents`):
{cases_context_json}

CONVERSATION SO FAR:
<conversation_history>
{history_str}
</conversation_history>

USER'S CURRENT MESSAGE — answer THIS and ONLY THIS:
{user_message}
</user_data>

Return ONLY valid JSON:
{{
    "answer": "Direct, highly specific, document-grounded answer addressing ONLY what the user asked. Quotes actual facts/numbers/names/dates. In {lang_name}.",
    "cited_cases": [
        {{
            "case_id": "case_id_here",
            "department": "department_here",
            "summary": "Brief relevant summary"
        }}
    ],
    "suggested_next_questions": [
        "A follow-up that makes sense given THIS specific answer and THIS user's actual documents",
        "Another relevant contextual follow-up based on what was found",
        "One more natural follow-up question"
    ],
    "auto_generated_title": "3-6 word title capturing THIS specific question in {lang_name}"
}}
"""

    last_exc = None

    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            raw = call_text_llm(prompt, temperature=0.75)
            result = clean_json_response(raw)
            answer_val = result.get("answer")
            if not answer_val or not str(answer_val).strip():
                answer_val = _build_grounded_fallback_answer(user_message, user_cases, threat_intel_report)

            # 2. Check for Safety Concern or Natural Language Reminder intents
            safety_check_result = None
            msg_lower = user_message.lower()
            safety_keywords = [
                "in danger", "help me i am scared", "following me", "someone broke in",
                "threatened", "feeling unsafe", "domestic emergency", "stalker", "trapped",
                "sos", "emergency help", "hurt me", "immediate danger", "unsafe situation"
            ]
            if any(k in msg_lower for k in safety_keywords):
                safety_check_result = {
                    "safety_alert_detected": True,
                    "question": "Are you in immediate danger?",
                    "options": ["Yes, Alert My Trust Circle", "No", "I'm Not Sure"],
                    "disclaimer": "SumScale Trust Circle is a peer notification tool and is not a replacement for emergency services (112/911).",
                }

            reminder_suggestion_result = None
            if any(k in msg_lower for k in ["remind me", "set a reminder", "add a reminder", "schedule reminder"]):
                from datetime import datetime, timezone, timedelta
                now = datetime.now(timezone.utc)
                clean_title = user_message
                for p in ["remind me to ", "remind me ", "set a reminder to ", "add a reminder for "]:
                    if msg_lower.startswith(p):
                        clean_title = user_message[len(p):]
                        break
                reminder_suggestion_result = {
                    "reminder_detected": True,
                    "title": clean_title.capitalize(),
                    "due_date": (now + timedelta(hours=24)).isoformat(),
                    "suggested_time_label": "Tomorrow at 7:00 PM",
                    "category": "Personal",
                    "repeat": "none",
                }

            parts = re.split(r"(?:\*\*|###|##|#|\s|^)*sources\s+cited:?", str(answer_val), flags=re.IGNORECASE)
            clean_answer = parts[0].strip()
            return {
                "answer": clean_answer,
                "cited_cases": result.get("cited_cases", []),
                "suggested_next_questions": result.get("suggested_next_questions", [
                    "What step-by-step precautions should I take?",
                    "Set up email & Google Calendar reminders for this case",
                    "Explain key terms simply"
                ]),
                "auto_generated_title": result.get("auto_generated_title", None),
                "safety_check": safety_check_result,
                "reminder_suggestion": reminder_suggestion_result,
            }

        except Exception as exc:
            last_exc = exc
            err_str = str(exc)

            if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str or "rate_limit" in err_str.lower():
                if attempt < _MAX_RETRIES:
                    wait_s = _RETRY_BASE_DELAY_S * (2 ** (attempt - 1))
                    logger.warning(
                        f"Rate-limit hit (attempt {attempt}/{_MAX_RETRIES}). "
                        f"Retrying in {wait_s}s..."
                    )
                    await asyncio.sleep(wait_s)
                    continue
                else:
                    # All retries exhausted — return a grounded answer based on case data
                    logger.warning("Rate-limit: all retries exhausted. Returning grounded local fallback.")
                    return {
                        "answer": _build_grounded_fallback_answer(user_message, user_cases, threat_intel_report),
                        "cited_cases": [],
                        "suggested_next_questions": default_next_questions,
                        "safety_check": None,
                        "reminder_suggestion": None,
                    }
            else:
                logger.error(f"Error during RAG chat response generation: {exc}")
                return {
                    "answer": _build_grounded_fallback_answer(user_message, user_cases, threat_intel_report),
                    "cited_cases": [],
                    "suggested_next_questions": default_next_questions,
                    "safety_check": None,
                    "reminder_suggestion": None,
                }

    logger.error(f"Unexpected exit from retry loop: {last_exc}")
    return {
        "answer": _build_grounded_fallback_answer(user_message, user_cases, threat_intel_report),
        "cited_cases": [],
        "suggested_next_questions": default_next_questions,
        "safety_check": None,
        "reminder_suggestion": None,
    }


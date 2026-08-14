"""
OmniAid — Multimodal Extractor Service
======================================
Extracts text content from uploaded files (PDFs, images, audio, plain text)
using Gemini 2.5 Flash multimodal capabilities.

Wrapped in strict error handling and timeouts.
"""

import logging
from pathlib import Path
from google import genai
from google.genai import types

from app.config import settings
from app.services.ai_service import get_genai_client, PROMPT_INJECTION_PROTECTION

logger = logging.getLogger("omniaid.multimodal_extractor")


import base64

def _call_groq_vision(file_bytes: bytes, mime_type: str, prompt: str) -> str:
    """Fallback image text extraction using active Groq Vision models."""
    try:
        from app.services.ai_service import get_groq_client
        client = get_groq_client()
        if not client:
            return ""

        clean_mime = mime_type if "/" in mime_type else "image/png"
        b64_str = base64.b64encode(file_bytes).decode("utf-8")
        data_url = f"data:{clean_mime};base64,{b64_str}"

        # Active non-decommissioned Groq Vision models
        vision_models = ["llama-3.2-11b-vision-instruct", "llama-3.2-90b-vision-instruct"]
        for model_name in vision_models:
            try:
                res = client.chat.completions.create(
                    model=model_name,
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": prompt},
                                {"type": "image_url", "image_url": {"url": data_url}},
                            ],
                        }
                    ],
                    max_tokens=2048,
                    temperature=0.1,
                )
                txt = res.choices[0].message.content
                if txt and txt.strip():
                    logger.info(f"Multimodal extraction success via Groq Vision ({model_name})")
                    return txt.strip()
            except Exception as err:
                logger.warning(f"Groq Vision {model_name} failed: {err}")
    except Exception as exc:
        logger.warning(f"Groq Vision helper error: {exc}")
    return ""


def _call_ocr_space(file_bytes: bytes, mime_type: str) -> str:
    """Fallback OCR using OCR.space free API engine."""
    import httpx
    try:
        url = "https://api.ocr.space/parse/image"
        payload = {
            "apikey": "helloworld",
            "language": "eng",
            "isOverlayRequired": False,
            "detectOrientation": True,
            "scale": True,
            "OCREngine": "2"
        }
        files = {"file": ("document.png", file_bytes, mime_type)}
        with httpx.Client(timeout=25.0) as http_client:
            res = http_client.post(url, data=payload, files=files)
            if res.status_code == 200:
                data = res.json()
                results = data.get("ParsedResults", [])
                if results and results[0].get("ParsedText"):
                    txt = results[0]["ParsedText"].strip()
                    if txt and len(txt) > 10:
                        logger.info("OCR.space free engine extraction success!")
                        return txt
    except Exception as exc:
        logger.warning(f"OCR.space engine call failed: {exc}")
    return ""


async def extract_text_from_file(file_path: Path, mime_type: str) -> str:
    """
    Extracts text/transcript from PDF, image, audio, or text file.
    Uses Gemini, Groq & OCR.space multimodal input for image/audio/pdf,
    or direct UTF-8 reading for plain text / CSV.
    """
    # Plain text / CSV files read directly
    if mime_type.startswith("text/") or mime_type in ("text/plain", "text/csv", "application/csv") or file_path.suffix.lower() in (".txt", ".csv"):
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()[:10000]
        except Exception as e:
            logger.error(f"Failed to read text file {file_path}: {e}")
            return f"Document file {file_path.name} attached for review."

    client = get_genai_client()

    try:
        with open(file_path, "rb") as f:
            file_bytes = f.read()

        file_part = types.Part.from_bytes(
            data=file_bytes,
            mime_type=mime_type,
        )

        prompt = f"""{PROMPT_INJECTION_PROTECTION}

Task: Transcribe or extract all visible text, numbers, dates, addresses, claimed amounts, URLs, spoken audio, or document details from the attached file.
Language Recognition Rule: The file or spoken audio may be in any language (English, Hindi, Telugu, Tamil, Kannada, etc.). Accurately extract all text, numbers, links, headers, amounts, and specific details preserving key terms.
Return plain text summary/transcription ONLY.
"""

        # Try extraction with Gemini models first
        _multimodal_models = ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-2.5-flash-lite"]
        extracted = None

        for model_name in _multimodal_models:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=[file_part, prompt],
                    config=types.GenerateContentConfig(
                        temperature=0.1,
                        max_output_tokens=4096,
                    ),
                )
                if response and response.text:
                    extracted = response.text.strip()
                    logger.info(f"Multimodal extraction success via {model_name} for {file_path.name}")
                    break
            except Exception as e:
                logger.warning(f"Multimodal extraction failed with {model_name} for {file_path.name}: {type(e).__name__}: {e}")

        # Fallback 1: Groq Vision (llama-3.2-11b-vision-instruct)
        if not extracted and mime_type.startswith("image/"):
            extracted = _call_groq_vision(file_bytes, mime_type, prompt)

        # Fallback 2: OCR.space Engine
        if not extracted and mime_type.startswith("image/"):
            extracted = _call_ocr_space(file_bytes, mime_type)

        if not extracted or "content extraction failed" in extracted.lower():
            logger.warning(f"Using default fallback descriptor for {file_path.name}")
            return f"Uploaded document: {file_path.name}. Preserved for AI case analysis and threat audit."

        return extracted[:10000]

    except Exception as e:
        logger.error(f"Multimodal extraction failed for {file_path.name} ({mime_type}): {e}")
        return f"Uploaded document: {file_path.name}. Preserved for AI case analysis."

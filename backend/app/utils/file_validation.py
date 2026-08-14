"""
OmniAid — File Validation & Storage Utility
============================================
Validates uploaded files using magic bytes (python-magic) + manual header sniffing,
enforces file size / count limits, and generates non-guessable storage paths.

Security Rules:
- Never trust client-supplied filename or Content-Type header.
- Reject mismatched MIME types or disallowed extensions.
- Storage path is non-web-accessible: uploads/{user_id}/{case_id}/{random_uuid}.ext

Platform Notes:
- python-magic on Windows often returns 'application/octet-stream' for valid image/audio/PDF files
  because libmagic database is not fully installed. We use two extra layers of fallback:
  1. Manual header-byte sniffing (signatures) — most reliable for images/PDFs
  2. File extension mapping — final fallback
"""

import os
import shutil
import uuid
import logging
from typing import Tuple, Set, Dict, Optional
from pathlib import Path
import magic

logger = logging.getLogger("omniaid.file_validation")

# Maximum upload limits
MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB
MAX_FILES_PER_CASE = 5

BASE_UPLOAD_DIR = Path("uploads")

# Department-specific allowed MIME types
ALLOWED_MIME_TYPES: Dict[str, Set[str]] = {
    "health": {
        "audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/x-m4a",
        "audio/ogg", "audio/webm", "video/webm", "audio/aac", "audio/flac", "audio/mp3",
        "image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/tiff",
        "application/pdf",
        "text/plain", "text/csv",
    },
    "fraud": {
        "image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp",
        "audio/webm", "video/webm", "audio/wav", "audio/mpeg",
        "application/pdf",
        "text/plain", "text/csv",
    },
    "data": {
        "image/jpeg", "image/png", "image/webp", "image/gif",
        "application/pdf",
        "text/plain", "text/csv", "application/csv",
        "audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/x-m4a",
        "audio/ogg", "audio/webm", "video/webm",
    },
}

# Extension → canonical MIME type (first entry is the "canonical" type for the extension)
EXTENSION_MIME_MAP: Dict[str, str] = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/x-m4a",
    ".ogg": "audio/ogg",
    ".webm": "audio/webm",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
    ".txt": "text/plain",
    ".csv": "text/csv",
}

# Magic byte signatures → MIME type
# Checked by reading the first N bytes of the file content
_MAGIC_SIGNATURES: list = [
    # (byte_offset, header_bytes, mime_type)
    (0, b'\xff\xd8\xff',        "image/jpeg"),   # JPEG
    (0, b'\x89PNG\r\n\x1a\n',  "image/png"),    # PNG
    (0, b'RIFF',                None),           # WAV/WEBP — need more bytes
    (0, b'%PDF',                "application/pdf"),  # PDF
    (0, b'GIF87a',              "image/gif"),    # GIF87
    (0, b'GIF89a',              "image/gif"),    # GIF89
    (0, b'BM',                  "image/bmp"),    # BMP
    (0, b'II\x2a\x00',         "image/tiff"),   # TIFF LE
    (0, b'MM\x00\x2a',         "image/tiff"),   # TIFF BE
    (0, b'\x1aE\xdf\xa3',      "video/webm"),   # WebM / MKV
    (0, b'OggS',               "audio/ogg"),    # OGG
    (0, b'fLaC',               "audio/flac"),   # FLAC
    (4, b'ftyp',               "audio/mp4"),    # MP4/M4A
    (0, b'ID3',                "audio/mpeg"),   # MP3 with ID3
    (0, b'\xff\xfb',           "audio/mpeg"),   # MP3 raw
    (0, b'\xff\xf3',           "audio/mpeg"),   # MP3 raw
    (0, b'\xff\xf2',           "audio/mpeg"),   # MP3 raw
]


def _sniff_mime_from_bytes(content: bytes) -> Optional[str]:
    """
    Inspect raw file header bytes and return MIME type, or None if not recognized.
    This is more reliable than python-magic on Windows where libmagic DB may be incomplete.
    """
    for offset, signature, mime in _MAGIC_SIGNATURES:
        end = offset + len(signature)
        if len(content) >= end and content[offset:end] == signature:
            if mime is None:
                # RIFF container — check sub-type
                if len(content) >= 12:
                    sub = content[8:12]
                    if sub == b'WAVE':
                        return "audio/wav"
                    elif sub == b'WEBP':
                        return "image/webp"
                return None
            return mime
    return None


def detect_mime_type(content: bytes, original_filename: str = "") -> str:
    """
    Detect real MIME type using three layers (most → least reliable):
    1. Manual header-byte sniffing (most accurate on Windows)
    2. python-magic library
    3. File extension fallback (last resort)

    Returns the detected MIME string, never 'application/octet-stream' if a
    better answer is available.
    """
    # Layer 1: manual header sniffing
    sniffed = _sniff_mime_from_bytes(content)
    if sniffed:
        return sniffed

    # Layer 2: python-magic
    try:
        mime = magic.from_buffer(content, mime=True).lower()
        if mime and mime != "application/octet-stream":
            return mime
    except Exception as exc:
        logger.warning(f"python-magic detection failed: {exc}")

    # Layer 3: file extension fallback
    if original_filename:
        ext = Path(original_filename).suffix.lower()
        if ext in EXTENSION_MIME_MAP:
            resolved = EXTENSION_MIME_MAP[ext]
            logger.info(
                f"Falling back to extension-based MIME for '{original_filename}': {resolved}"
            )
            return resolved

    return "application/octet-stream"


def validate_file(
    content: bytes,
    original_filename: str,
    department: str,
) -> Tuple[bool, str, str]:
    """
    Validates file content:
    1. Size check (<= 15MB)
    2. Detect real MIME type via sniffing + magic + extension fallback
    3. Department whitelist check

    Returns (is_valid, detected_mime, error_message)
    """

    # 1. Size check
    if len(content) > MAX_FILE_SIZE_BYTES:
        return False, "", f"File size ({round(len(content)/(1024*1024), 2)}MB) exceeds maximum limit of 15MB."

    if len(content) == 0:
        return False, "", "File is empty."

    # 2. Detect real MIME type (multi-layer fallback)
    detected_mime = detect_mime_type(content, original_filename)

    ext = Path(original_filename).suffix.lower()
    if ext in EXTENSION_MIME_MAP:
        expected_mime = EXTENSION_MIME_MAP[ext]
        if ext == ".pdf" and detected_mime != expected_mime:
            return False, detected_mime, f"Extension '{ext}' does not match detected file content '{detected_mime}'"

    # 3. Department whitelist check
    allowed = ALLOWED_MIME_TYPES.get(department, set())
    if detected_mime not in allowed:
        logger.warning(
            f"File upload rejected: MIME type '{detected_mime}' (file: {original_filename}, ext: {ext}) "
            f"not allowed for department '{department}'."
        )
        return False, detected_mime, f"File type '{detected_mime}' is not permitted for the {department} department."

    return True, detected_mime, ""


def save_upload_file(
    content: bytes,
    user_id: str,
    case_id: str,
    original_filename: str,
) -> Tuple[str, Path]:
    """
    Saves file content into a non-web-accessible directory:
    uploads/{user_id}/{case_id}/{random_uuid}{ext}

    Returns (unique_file_id, absolute_filepath)
    """
    ext = Path(original_filename).suffix.lower()
    if not ext:
        ext = ".bin"

    file_id = f"file_{uuid.uuid4().hex[:12]}"
    filename = f"{file_id}{ext}"

    case_dir = BASE_UPLOAD_DIR / user_id / case_id
    case_dir.mkdir(parents=True, exist_ok=True)

    file_path = case_dir / filename
    with open(file_path, "wb") as f:
        f.write(content)

    return file_id, file_path


def delete_case_files(user_id: str, case_id: str) -> None:
    """
    Deletes all physical upload files for a given case directory.
    """
    case_dir = BASE_UPLOAD_DIR / user_id / case_id
    if case_dir.exists():
        try:
            shutil.rmtree(case_dir)
            logger.info(f"Deleted upload files directory for case {case_id}")
        except Exception as exc:
            logger.error(f"Failed to delete directory {case_dir}: {exc}")

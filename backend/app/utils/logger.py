"""
OmniAid — Structured JSON Logger
==================================
Sets up a project-wide logger that emits newline-delimited JSON records.

REDACTION POLICY (hard rule — never log these):
  - File contents or binary data
  - Extracted health symptoms, diagnoses, or medical facts
  - Extracted fraud evidence or PII
  - Passwords, hashed passwords, or raw tokens
  - Full request/response bodies
  - Any value whose key name contains: password, token, secret, key, content,
    text, body, evidence, symptoms, diagnosis, result

Only log: request_id, method, path, status_code, duration_ms, user_id (opaque).
"""

import logging
import sys
from pythonjsonlogger import json as jsonlogger

# Fields that must NEVER appear in log output
_REDACTED_FIELD_PATTERNS = frozenset(
    {
        "password",
        "token",
        "secret",
        "api_key",
        "key",
        "content",
        "text",
        "body",
        "evidence",
        "symptoms",
        "diagnosis",
        "result",
        "resume",
        "report",
        "audio",
        "image",
        "file",
    }
)


class RedactingJsonFormatter(jsonlogger.JsonFormatter):  # type: ignore[attr-defined]
    """
    JSON formatter that strips any field whose name matches a redacted pattern.
    Extends python-json-logger's JsonFormatter.
    """

    def add_fields(self, log_record: dict, record: logging.LogRecord, message_dict: dict) -> None:
        super().add_fields(log_record, record, message_dict)
        # Remove any key that looks sensitive
        keys_to_delete = [
            k
            for k in list(log_record.keys())
            if any(pat in k.lower() for pat in _REDACTED_FIELD_PATTERNS)
        ]
        for key in keys_to_delete:
            log_record[key] = "[REDACTED]"


def setup_logging(log_level: str = "INFO") -> None:
    """
    Configure the root logger with JSON output to stdout.
    Call this once at application startup (before any other imports that log).
    """
    handler = logging.StreamHandler(sys.stdout)
    formatter = RedactingJsonFormatter(
        fmt="%(asctime)s %(name)s %(levelname)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers = []           # Remove any pre-existing handlers
    root.addHandler(handler)
    root.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # Quiet noisy third-party loggers
    for noisy in ("uvicorn.access", "motor", "pymongo"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """Return a named child logger inheriting root config."""
    return logging.getLogger(name)

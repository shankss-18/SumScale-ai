"""
OmniAid — Request Logging Middleware
======================================
Attaches a unique request_id to every request and logs:
  - method, path, status_code, duration_ms, request_id

NEVER logs:
  - Request body, form data, or file contents
  - Response body
  - Authorization headers or cookies
  - Any extracted AI results
"""

import time
import uuid
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("omniaid.requests")

# Headers that must never be echoed in logs
_SENSITIVE_HEADERS = frozenset(
    {"authorization", "cookie", "set-cookie", "x-api-key", "x-auth-token"}
)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Logs one structured JSON line per request:
      {"request_id": "...", "method": "POST", "path": "/api/health/analyze",
       "status_code": 200, "duration_ms": 143, "level": "INFO"}
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = str(uuid.uuid4())
        start = time.perf_counter()

        # Attach request_id so downstream code can reference it
        request.state.request_id = request_id

        try:
            response = await call_next(request)
            duration_ms = round((time.perf_counter() - start) * 1000, 2)

            log_payload = {
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
            }

            level = logging.WARNING if response.status_code >= 400 else logging.INFO
            logger.log(level, "request completed", extra=log_payload)

            # Propagate request_id back to the client for correlation
            response.headers["X-Request-ID"] = request_id
            return response

        except Exception as exc:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            logger.error(
                "request failed with unhandled exception",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "duration_ms": duration_ms,
                    "error_type": type(exc).__name__,
                    # NOT logging exc message — it may contain user data
                },
            )
            raise

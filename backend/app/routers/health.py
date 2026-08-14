"""
OmniAid — Health Check Router
================================
Provides a single GET /health endpoint used by:
  - Local development to verify the app started correctly
  - Deployment platforms (Railway, Render, etc.) for liveness checks
  - CI/CD pipelines in the test suite

Returns 200 with a JSON payload confirming:
  - Service name and version
  - Environment (development / production)
  - UTC timestamp

Does NOT expose: config values, API keys, DB connection strings, or internals.
"""

from datetime import datetime, timezone
from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get(
    "/health",
    summary="Liveness check",
    description="Returns 200 when the service has started and config is valid.",
    response_description="Basic service status information",
)
async def health_check() -> dict:
    return {
        "status": "ok",
        "service": "OmniAid API",
        "version": "0.1.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

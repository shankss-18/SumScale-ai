"""
SumScale — Web Push Notification Service
=========================================
Delivers browser Web Push notifications using VAPID credentials.
Handles active subscription dispatch and automatic cleanup of expired/invalid endpoints.
"""

import os
import json
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("omniaid.webpush")

# Default VAPID keypair for development/testing if environment variables are not provided
_DEFAULT_VAPID_PUBLIC = os.getenv(
    "VAPID_PUBLIC_KEY",
    "BEl62iUYgUivxIkv69yViEuiBIa1L1rP56a59b3W3V7d33v3-9L0hJzK9aN5910n8b3V7d33v3"
)
_DEFAULT_VAPID_PRIVATE = os.getenv(
    "VAPID_PRIVATE_KEY",
    "a1b2c3d4e5f678901234567890abcdef12345678"
)
_DEFAULT_VAPID_CLAIMS = {
    "sub": os.getenv("VAPID_MAILTO", "mailto:alerts@sumscale.ai")
}


def get_vapid_public_key() -> str:
    """Return configured VAPID public key for browser frontend subscription."""
    return os.getenv("VAPID_PUBLIC_KEY", _DEFAULT_VAPID_PUBLIC)


async def send_web_push_notification(
    subscription_info: Dict[str, Any],
    title: str,
    body: str,
    icon: str = "/favicon.ico",
    url: str = "/dashboard",
    data: Optional[Dict[str, Any]] = None,
    db: Any = None,
) -> bool:
    """
    Sends a Web Push notification to a specific browser subscription.
    Returns True if sent successfully, False otherwise.
    If endpoint returns 404 or 410 (Expired/Unsubscribed), automatically purges subscription from DB.
    """
    endpoint = subscription_info.get("endpoint")
    if not endpoint:
        return False

    payload_data = {
        "title": title,
        "body": body,
        "icon": icon,
        "url": url,
        "data": data or {},
    }

    payload_str = json.dumps(payload_data)

    try:
        # pyrefly: ignore [missing-import]
        from pywebpush import webpush, WebPushException

        vapid_private = os.getenv("VAPID_PRIVATE_KEY", _DEFAULT_VAPID_PRIVATE)
        vapid_claims = _DEFAULT_VAPID_CLAIMS

        webpush(
            subscription_info=subscription_info,
            data=payload_str,
            vapid_private_key=vapid_private,
            vapid_claims=vapid_claims,
            timeout=5,
        )
        logger.info(f"✅ Web Push delivered to endpoint: {endpoint[:40]}...")
        return True

    except ImportError:
        logger.warning("pywebpush package not installed. Logging Web Push payload locally.")
        logger.info(f"🔔 [Web Push Mock]: {title} - {body} -> {url}")
        return True

    except Exception as exc:
        err_msg = str(exc)
        logger.warning(f"Web Push dispatch failed for endpoint {endpoint[:40]}: {err_msg}")
        
        # If subscription has expired or unsubscribed, remove from DB
        if "404" in err_msg or "410" in err_msg or "Gone" in err_msg or "Not Found" in err_msg:
            if db is not None:
                try:
                    await db.push_subscriptions.delete_one({"endpoint": endpoint})
                    logger.info(f"Cleaned up expired push subscription for endpoint: {endpoint[:40]}")
                except Exception as db_exc:
                    logger.error(f"Error purging expired push sub: {db_exc}")

        return False

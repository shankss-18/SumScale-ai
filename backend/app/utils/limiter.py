"""
OmniAid — Rate Limiter Utility
==============================
Initializes slowapi Limiter instance for endpoint rate limiting.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

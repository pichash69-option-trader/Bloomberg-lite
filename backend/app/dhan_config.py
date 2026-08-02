# -*- coding: utf-8 -*-
"""
dhan_config.py — DhanHQ client + credential detection.

`has_creds()` decides mock vs real everywhere: if the .env creds are missing or
still the placeholder, the app stays on synthetic data. `get_dhan()` lazily builds
the authenticated client only when it is actually needed.
"""
from functools import lru_cache

from app.config import get_settings


def has_creds() -> bool:
    """True only when real DhanHQ creds are present (not placeholders)."""
    s = get_settings()
    return bool(
        s.dhan_client_id
        and s.dhan_access_token
        and "your_" not in s.dhan_client_id
        and "your_" not in s.dhan_access_token
    )


@lru_cache
def get_dhan():
    """Authenticated dhanhq REST client (option_chain, historical, orders…)."""
    from dhanhq import DhanContext, dhanhq

    s = get_settings()
    ctx = DhanContext(s.dhan_client_id, s.dhan_access_token)
    return dhanhq(ctx)


def mode() -> str:
    return "real" if has_creds() else "mock"

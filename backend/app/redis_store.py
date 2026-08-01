# -*- coding: utf-8 -*-
"""
redis_store.py — async Redis client for live tick state + pub/sub fanout.

Phase 0: connection + ping. Live keys/channels (see CLAUDE.md §6) come in Phase 2.
"""
import redis.asyncio as aioredis

from app.config import get_settings

settings = get_settings()

_redis: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis


async def ping() -> bool:
    """True if Redis is reachable."""
    return await get_redis().ping()


async def close() -> None:
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None

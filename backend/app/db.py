# -*- coding: utf-8 -*-
"""
db.py — async SQLAlchemy engine/session for Postgres + TimescaleDB.

Phase 0: connection + a ping() + ensure the TimescaleDB extension exists.
Models/hypertables come in Phase 1.
"""
from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (AsyncSession, async_sessionmaker,
                                    create_async_engine)
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

settings = get_settings()

engine = create_async_engine(settings.database_url, echo=False, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session


async def ping() -> bool:
    """True if Postgres is reachable."""
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    return True


async def ensure_timescale() -> None:
    """Create the TimescaleDB extension if not present (idempotent)."""
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS timescaledb"))

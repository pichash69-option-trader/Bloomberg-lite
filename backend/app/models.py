# -*- coding: utf-8 -*-
"""
models.py — SQLAlchemy ORM models (Postgres/TimescaleDB tables).

Phase 1: `instruments` (symbol → DhanHQ SecurityId map). `candles` (history) is
added in Step 2 as a Timescale hypertable.
"""
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Float, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Instrument(Base):
    """One row per tradable leg we care about, per underlying.

    For each of the 51 underlyings we store its `spot` (equity or index) and its
    near-month `future`. Options are fetched live via the Option-Chain API using
    the underlying's security_id, so we don't store every strike here.
    """
    __tablename__ = "instruments"

    security_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    segment: Mapped[str] = mapped_column(String(16), primary_key=True)  # NSE_EQ / IDX_I / NSE_FNO

    symbol: Mapped[str] = mapped_column(String(40), index=True)   # display: RELIANCE / NIFTY 50
    kind: Mapped[str] = mapped_column(String(10))                 # spot / future
    instrument_type: Mapped[str] = mapped_column(String(12))      # EQUITY / INDEX / FUTSTK / FUTIDX
    trading_symbol: Mapped[str] = mapped_column(String(64))       # raw scrip symbol
    expiry: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    lot_size: Mapped[int | None] = mapped_column(Integer, nullable=True)

    __table_args__ = (Index("ix_instruments_symbol_kind", "symbol", "kind"),)

    def __repr__(self) -> str:
        return (f"<Instrument {self.symbol} {self.kind} "
                f"id={self.security_id} seg={self.segment}>")


class Candle(Base):
    """OHLC(+OI) candle. Timescale hypertable partitioned on `ts`.
    interval = '1d' (daily) or '1m' (intraday minute)."""
    __tablename__ = "candles"

    symbol: Mapped[str] = mapped_column(String(40), primary_key=True)
    segment: Mapped[str] = mapped_column(String(16), primary_key=True)
    interval: Mapped[str] = mapped_column(String(4), primary_key=True)   # '1d' / '1m'
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)

    open: Mapped[float] = mapped_column(Float)
    high: Mapped[float] = mapped_column(Float)
    low: Mapped[float] = mapped_column(Float)
    close: Mapped[float] = mapped_column(Float)
    volume: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    oi: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    __table_args__ = (Index("ix_candles_symbol_interval_ts", "symbol", "interval", "ts"),)

    def __repr__(self) -> str:
        return f"<Candle {self.symbol} {self.interval} {self.ts:%Y-%m-%d} c={self.close}>"

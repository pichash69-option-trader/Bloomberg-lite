# -*- coding: utf-8 -*-
"""
config.py — settings (env) + the NIFTY 50 universe (index + 50 stocks).

Universe = NIFTY 50 index + its 50 constituent stocks (51 underlyings). History is
kept for all 51; live is streamed only for the stock the user selects (see CLAUDE.md).
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # DhanHQ
    dhan_client_id: str = ""
    dhan_access_token: str = ""

    # Postgres / TimescaleDB
    postgres_user: str = "bloomberg"
    postgres_password: str = "bloomberg"
    postgres_db: str = "bloomberg_lite"
    postgres_host: str = "localhost"
    postgres_port: int = 5432

    # Redis
    redis_host: str = "localhost"
    redis_port: int = 6379

    # App
    backend_port: int = 8000
    tz: str = "Asia/Kolkata"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore",
                                      case_sensitive=False)

    @property
    def database_url(self) -> str:
        return (f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
                f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}")

    @property
    def redis_url(self) -> str:
        return f"redis://{self.redis_host}:{self.redis_port}/0"


@lru_cache
def get_settings() -> Settings:
    return Settings()


# --------------------------------------------------------------------------- #
# Universe — NIFTY 50 index + 50 constituent stocks (symbols as NSE uses them).
# NSE rebalances ~twice a year; verify from the official factsheet if you need it
# exact for a given date. All 50 are F&O stocks (each has futures + options).
#
# Updated for Aug-2026 composition (documented reconstitutions applied):
#   Sept-2024: LTIM  → out;   BEL       → in
#   Sept-2025: HEROMOTOCO, INDUSINDBK → out;   INDIGO, MAXHEALTH → in
#   Tata Motors demerger: TATAMOTORS → TMPV (F&O-active successor)
# --------------------------------------------------------------------------- #
NIFTY_INDEX = "NIFTY 50"

NIFTY50 = [
    "RELIANCE", "TCS", "HDFCBANK", "ICICIBANK", "INFY",
    "BHARTIARTL", "SBIN", "LT", "ITC", "HINDUNILVR",
    "BAJFINANCE", "KOTAKBANK", "AXISBANK", "HCLTECH", "MARUTI",
    "SUNPHARMA", "M&M", "TITAN", "NTPC", "ULTRACEMCO",
    "ASIANPAINT", "POWERGRID", "TMPV", "ADANIENT", "WIPRO",
    "JSWSTEEL", "NESTLEIND", "BAJAJFINSV", "ONGC", "TATASTEEL",
    "COALINDIA", "ADANIPORTS", "HDFCLIFE", "GRASIM", "SBILIFE",
    "TECHM", "BAJAJ-AUTO", "HINDALCO", "DRREDDY", "CIPLA",
    "BRITANNIA", "EICHERMOT", "APOLLOHOSP", "BEL", "TATACONSUM",
    "BPCL", "SHRIRAMFIN", "INDIGO", "MAXHEALTH", "TRENT",
]

# Full underlying list (index first), used for history backfill + the picker.
UNIVERSE = [NIFTY_INDEX] + NIFTY50

assert len(NIFTY50) == 50, f"Expected 50 stocks, got {len(NIFTY50)}"

"""
SQLite storage for OHLCV candles.

We always store the smallest ("base") timeframe we fetched for a symbol,
and derive every larger timeframe from it on the fly (see aggregator.py).
This keeps storage simple and means we never have duplicate data for the
same symbol at different resolutions.
"""
import os
from sqlalchemy import (
    create_engine, Column, Integer, String, Float, BigInteger,
    UniqueConstraint, Index
)
from sqlalchemy.orm import declarative_base, sessionmaker

DB_PATH = os.environ.get("DB_PATH", "/data/trading.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


class Candle(Base):
    __tablename__ = "candles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    source = Column(String, nullable=False)      # "stock" or "crypto"
    symbol = Column(String, nullable=False)      # e.g. AAPL, BTC/USDT
    base_timeframe = Column(String, nullable=False)  # the timeframe actually stored, e.g. "1h"
    timestamp = Column(BigInteger, nullable=False)  # unix ms, UTC
    open = Column(Float, nullable=False)
    high = Column(Float, nullable=False)
    low = Column(Float, nullable=False)
    close = Column(Float, nullable=False)
    volume = Column(Float, nullable=False, default=0)

    __table_args__ = (
        UniqueConstraint("source", "symbol", "base_timeframe", "timestamp",
                          name="uq_candle"),
        Index("ix_candle_lookup", "source", "symbol", "base_timeframe", "timestamp"),
    )


def init_db():
    Base.metadata.create_all(engine)


def get_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

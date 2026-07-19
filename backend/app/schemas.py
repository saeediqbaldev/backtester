from typing import Optional, List
from pydantic import BaseModel


class CandleOut(BaseModel):
    time: int  # unix seconds (lightweight-charts wants seconds)
    open: float
    high: float
    low: float
    close: float
    volume: float


class OHLCVResponse(BaseModel):
    symbol: str
    source: str
    timeframe: str
    candles: List[CandleOut]


class BacktestRequest(BaseModel):
    symbol: str
    source: str  # "stock" or "crypto"
    timeframe: str = "1d"
    fast_period: int = 10
    slow_period: int = 30
    initial_cash: float = 10000.0
    lookback_bars: int = 500


class TradeOut(BaseModel):
    entry_time: int
    exit_time: Optional[int]
    entry_price: float
    exit_price: Optional[float]
    side: str
    pnl: Optional[float]
    pnl_pct: Optional[float]


class EquityPointOut(BaseModel):
    time: int
    equity: float


class BacktestResponse(BaseModel):
    symbol: str
    trades: List[TradeOut]
    equity_curve: List[EquityPointOut]
    stats: dict

from typing import List
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

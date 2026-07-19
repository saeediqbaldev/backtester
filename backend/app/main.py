import time
import pandas as pd
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import and_

from .database import init_db, get_session, Candle
from .data_sources import fetch_ohlcv, pick_base_timeframe
from .aggregator import resample
from .backtest import sma_crossover_backtest
from .schemas import OHLCVResponse, CandleOut, BacktestRequest, BacktestResponse

app = FastAPI(title="Trading Tool API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this to your domain once deployed
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

# How "fresh" cached data needs to be before we re-fetch from the source, per base timeframe (seconds)
FRESHNESS_SECONDS = {
    "1m": 60, "5m": 300, "15m": 900, "30m": 1800,
    "1h": 3600, "4h": 14400, "1d": 21600, "1w": 86400,
}


@app.get("/api/health")
def health():
    return {"status": "ok"}


def _df_from_db(db: Session, source: str, symbol: str, base_tf: str) -> pd.DataFrame:
    rows = (
        db.query(Candle)
        .filter(and_(Candle.source == source, Candle.symbol == symbol, Candle.base_timeframe == base_tf))
        .order_by(Candle.timestamp.asc())
        .all()
    )
    if not rows:
        return pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])
    return pd.DataFrame([{
        "timestamp": r.timestamp, "open": r.open, "high": r.high,
        "low": r.low, "close": r.close, "volume": r.volume,
    } for r in rows])


def _upsert_candles(db: Session, source: str, symbol: str, base_tf: str, df: pd.DataFrame):
    if df.empty:
        return
    existing_ts = set(
        ts for (ts,) in db.query(Candle.timestamp).filter(
            and_(Candle.source == source, Candle.symbol == symbol, Candle.base_timeframe == base_tf)
        ).all()
    )
    new_rows = []
    for _, row in df.iterrows():
        ts = int(row["timestamp"])
        if ts in existing_ts:
            continue
        new_rows.append(Candle(
            source=source, symbol=symbol, base_timeframe=base_tf, timestamp=ts,
            open=float(row["open"]), high=float(row["high"]),
            low=float(row["low"]), close=float(row["close"]),
            volume=float(row["volume"]),
        ))
    if new_rows:
        db.bulk_save_objects(new_rows)
        db.commit()


def _get_fresh_series(db: Session, source: str, symbol: str, requested_tf: str) -> pd.DataFrame:
    """Fetch (with caching) the base-resolution series needed to build requested_tf."""
    base_tf = pick_base_timeframe(requested_tf)

    cached = _df_from_db(db, source, symbol, base_tf)
    is_stale = True
    if not cached.empty:
        last_ts = cached["timestamp"].max() / 1000  # seconds
        age = time.time() - last_ts
        is_stale = age > FRESHNESS_SECONDS.get(base_tf, 3600)

    if cached.empty or is_stale:
        try:
            fresh = fetch_ohlcv(source, symbol, base_tf)
        except Exception as e:
            if not cached.empty:
                fresh = pd.DataFrame(columns=cached.columns)  # fall back to cache silently
            else:
                raise HTTPException(status_code=502, detail=f"Failed to fetch data: {e}")
        _upsert_candles(db, source, symbol, base_tf, fresh)
        cached = _df_from_db(db, source, symbol, base_tf)

    return cached


@app.get("/api/ohlcv", response_model=OHLCVResponse)
def get_ohlcv(
    symbol: str = Query(..., description="e.g. AAPL or BTC/USDT"),
    source: str = Query(..., pattern="^(stock|crypto)$"),
    timeframe: str = Query("1d"),
    limit: int = Query(500, le=5000),
    db: Session = Depends(get_session),
):
    base_series = _get_fresh_series(db, source, symbol, timeframe)
    if base_series.empty:
        raise HTTPException(status_code=404, detail="No data found for this symbol")

    result = resample(base_series, timeframe)
    result = result.tail(limit)

    candles = [
        CandleOut(
            time=int(row["timestamp"] // 1000),
            open=row["open"], high=row["high"], low=row["low"],
            close=row["close"], volume=row["volume"],
        )
        for _, row in result.iterrows()
    ]
    return OHLCVResponse(symbol=symbol, source=source, timeframe=timeframe, candles=candles)


@app.post("/api/backtest", response_model=BacktestResponse)
def run_backtest(req: BacktestRequest, db: Session = Depends(get_session)):
    base_series = _get_fresh_series(db, req.source, req.symbol, req.timeframe)
    if base_series.empty:
        raise HTTPException(status_code=404, detail="No data found for this symbol")

    df = resample(base_series, req.timeframe).tail(req.lookback_bars)
    result = sma_crossover_backtest(df, req.fast_period, req.slow_period, req.initial_cash)

    return BacktestResponse(
        symbol=req.symbol,
        trades=result["trades"],
        equity_curve=result["equity_curve"],
        stats=result["stats"],
    )


@app.get("/api/symbols/popular")
def popular_symbols(source: str = Query(..., pattern="^(stock|crypto)$")):
    if source == "stock":
        return {"symbols": ["XAUUSD", "AUDCHF", "NASDAQ", "DOWJONES", "SPX500"]}
    else:
        return {"symbols": ["BTCUSD"]}


@app.get("/api/symbols/default_watchlist")
def default_watchlist():
    """
    The default pairs requested for this deployment. Each entry carries the
    source it should be fetched under so the frontend doesn't have to guess.
    """
    return {
        "symbols": [
            {"symbol": "XAUUSD", "source": "stock"},
            {"symbol": "BTCUSD", "source": "crypto"},
            {"symbol": "AUDCHF", "source": "stock"},
            {"symbol": "NASDAQ", "source": "stock"},
            {"symbol": "DOWJONES", "source": "stock"},
            {"symbol": "SPX500", "source": "stock"},
        ]
    }

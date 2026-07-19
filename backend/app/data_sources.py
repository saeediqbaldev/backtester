"""
Fetches raw OHLCV data from free sources:
- "stock"  -> yfinance (Yahoo Finance)
- "crypto" -> ccxt (defaults to Binance, no API key needed for public OHLCV)

Both return a pandas DataFrame with columns:
[timestamp_ms, open, high, low, close, volume]
"""
import time
import pandas as pd
import ccxt

# Map our generic timeframe strings to what each source expects.
YF_INTERVAL_MAP = {
    "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
    "1h": "60m", "4h": "60m",  # yfinance has no native 4h; we fetch 60m and resample
    "1d": "1d", "1w": "1wk",
}

# yfinance limits how far back intraday data goes. Keep periods safe.
YF_PERIOD_MAP = {
    "1m": "7d", "5m": "60d", "15m": "60d", "30m": "60d",
    "60m": "730d", "1d": "5y", "1wk": "10y",
}

CCXT_EXCHANGE = "binance"

# Friendly symbol -> actual Yahoo Finance ticker, for instruments that aren't
# plain stocks (metals, indices, FX). These are all routed through the
# "stock" source since yfinance covers them under these tickers.
YF_SYMBOL_ALIASES = {
    "XAUUSD": "GC=F",       # Gold futures
    "AUDCHF": "AUDCHF=X",   # FX pair
    "NASDAQ": "^IXIC",      # Nasdaq Composite
    "DOWJONES": "^DJI",     # Dow Jones Industrial Average
    "SPX500": "^GSPC",      # S&P 500
}

# Crypto pairs that map to a Binance-style ccxt symbol
CCXT_SYMBOL_ALIASES = {
    "BTCUSD": "BTC/USDT",
}


def resolve_symbol(source: str, symbol: str) -> str:
    """Translate a friendly display symbol into the ticker the underlying source expects."""
    if source == "stock":
        return YF_SYMBOL_ALIASES.get(symbol, symbol)
    if source == "crypto":
        return CCXT_SYMBOL_ALIASES.get(symbol, symbol)
    return symbol


def fetch_stock_ohlcv(symbol: str, base_timeframe: str) -> pd.DataFrame:
    import yfinance as yf

    yf_interval = YF_INTERVAL_MAP.get(base_timeframe, "1d")
    period = YF_PERIOD_MAP.get(yf_interval, "1y")

    real_symbol = YF_SYMBOL_ALIASES.get(symbol, symbol)
    ticker = yf.Ticker(real_symbol)
    df = ticker.history(period=period, interval=yf_interval, auto_adjust=True)

    if df.empty:
        return pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])

    df = df.reset_index()
    time_col = "Datetime" if "Datetime" in df.columns else "Date"
    out = pd.DataFrame({
        "timestamp": (df[time_col].astype("int64") // 10**6),  # ns -> ms
        "open": df["Open"],
        "high": df["High"],
        "low": df["Low"],
        "close": df["Close"],
        "volume": df["Volume"],
    })
    return out.dropna()


def fetch_crypto_ohlcv(symbol: str, base_timeframe: str, limit: int = 1000) -> pd.DataFrame:
    # ccxt timeframe strings already match ours except 1w -> 1w is fine on Binance
    exchange = getattr(ccxt, CCXT_EXCHANGE)({"enableRateLimit": True})
    tf = base_timeframe if base_timeframe != "4h" else "4h"
    real_symbol = CCXT_SYMBOL_ALIASES.get(symbol, symbol)
    ohlcv = exchange.fetch_ohlcv(real_symbol, timeframe=tf, limit=limit)
    if not ohlcv:
        return pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])
    df = pd.DataFrame(ohlcv, columns=["timestamp", "open", "high", "low", "close", "volume"])
    return df


def fetch_ohlcv(source: str, symbol: str, base_timeframe: str) -> pd.DataFrame:
    if source == "stock":
        return fetch_stock_ohlcv(symbol, base_timeframe)
    elif source == "crypto":
        return fetch_crypto_ohlcv(symbol, base_timeframe)
    else:
        raise ValueError(f"Unknown source: {source}")


def pick_base_timeframe(requested_timeframe: str) -> str:
    """
    We don't store every timeframe -- we store one 'base' granularity per
    request and derive coarser ones by resampling. If someone asks for 1d,
    fetch 1d directly (cheap & long history). If they ask for anything
    intraday, fetch the finest we reasonably can and resample up from there.
    """
    intraday_base = {
        "1m": "1m", "5m": "5m", "15m": "5m", "30m": "5m",
        "1h": "5m", "4h": "5m",
    }
    return intraday_base.get(requested_timeframe, requested_timeframe)

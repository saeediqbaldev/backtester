"""
Fetches raw OHLCV data from free sources:
- "stock"  -> yfinance (Yahoo Finance), with a Stooq fallback for daily/weekly
- "crypto" -> ccxt (defaults to Binance, no API key needed for public OHLCV)

Both return a pandas DataFrame with columns:
[timestamp_ms, open, high, low, close, volume]

Notes on reliability:
Yahoo Finance sometimes rate-limits or blocks requests coming from datacenter/VPS
IPs (this is a known yfinance issue, not specific to this app). To reduce that:
  - we reuse a single requests.Session with a normal browser User-Agent
  - we retry a couple of times with a short backoff before giving up
  - for daily/weekly stock-type data we fall back to Stooq (a free, keyless
    data provider) if Yahoo returns nothing
"""
import io
import time
import requests
import pandas as pd
import ccxt

# Map our generic timeframe strings to what each source expects.
YF_INTERVAL_MAP = {
    "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m",
    "1h": "60m", "4h": "60m",  # yfinance has no native 4h; we fetch 60m and resample
    "1d": "1d", "1w": "1wk",
}

# yfinance/Yahoo cap how far back intraday data goes -- these ARE the real
# maximums Yahoo allows, so this already gives the most history possible per
# granularity. Daily/weekly use "max" to get the full available history.
YF_PERIOD_MAP = {
    "1m": "7d", "5m": "60d", "15m": "60d", "30m": "60d",
    "60m": "730d", "1d": "max", "1wk": "max",
}

CCXT_EXCHANGE = "binance"

# Friendly symbol -> actual Yahoo Finance ticker.
# XAUUSD and AUDCHF use Yahoo's "=X" forex-style tickers, which quote SPOT
# price (not futures) -- this matters for gold specifically, since the
# commodity futures ticker (GC=F) is NOT the same as spot.
YF_SYMBOL_ALIASES = {
    "XAUUSD": "XAUUSD=X",   # Spot gold (forex-style quote), not futures
    "AUDCHF": "AUDCHF=X",   # Spot FX pair
    "NASDAQ": "^IXIC",      # Nasdaq Composite
    "DOWJONES": "^DJI",     # Dow Jones Industrial Average
    "SPX500": "^GSPC",      # S&P 500
}

# Stooq uses its own symbol conventions -- used only as a fallback for
# daily/weekly data if Yahoo fails.
STOOQ_SYMBOL_ALIASES = {
    "XAUUSD": "xauusd",
    "AUDCHF": "audchf",
    "NASDAQ": "^ndq",
    "DOWJONES": "^dji",
    "SPX500": "^spx",
}

# Crypto pairs that map to a Binance-style ccxt symbol
CCXT_SYMBOL_ALIASES = {
    "BTCUSD": "BTC/USDT",
}

_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )
}

_session = requests.Session()
_session.headers.update(_BROWSER_HEADERS)


def resolve_symbol(source: str, symbol: str) -> str:
    """Translate a friendly display symbol into the ticker the underlying source expects."""
    if source == "stock":
        return YF_SYMBOL_ALIASES.get(symbol, symbol)
    if source == "crypto":
        return CCXT_SYMBOL_ALIASES.get(symbol, symbol)
    return symbol


def _empty_df():
    return pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])


def _fetch_stooq_daily(symbol: str, weekly: bool = False) -> pd.DataFrame:
    """Fallback source for daily/weekly stock-type data. Free, no key, no auth."""
    stooq_symbol = STOOQ_SYMBOL_ALIASES.get(symbol, symbol.lower())
    interval = "w" if weekly else "d"
    url = f"https://stooq.com/q/d/l/?s={stooq_symbol}&i={interval}"
    try:
        resp = _session.get(url, timeout=15)
        resp.raise_for_status()
        df = pd.read_csv(io.StringIO(resp.text))
    except Exception:
        return _empty_df()

    if df.empty or "Date" not in df.columns:
        return _empty_df()

    df["Date"] = pd.to_datetime(df["Date"], utc=True)
    out = pd.DataFrame({
        "timestamp": (df["Date"].astype("int64") // 10**6),
        "open": df["Open"],
        "high": df["High"],
        "low": df["Low"],
        "close": df["Close"],
        "volume": df.get("Volume", 0),
    })
    return out.dropna(subset=["open", "high", "low", "close"])


def fetch_stock_ohlcv(symbol: str, base_timeframe: str) -> pd.DataFrame:
    import yfinance as yf

    yf_interval = YF_INTERVAL_MAP.get(base_timeframe, "1d")
    period = YF_PERIOD_MAP.get(yf_interval, "max")
    real_symbol = YF_SYMBOL_ALIASES.get(symbol, symbol)

    df = _empty_df()
    last_error = None

    for attempt in range(3):
        try:
            ticker = yf.Ticker(real_symbol, session=_session)
            raw = ticker.history(period=period, interval=yf_interval, auto_adjust=True)
            if not raw.empty:
                raw = raw.reset_index()
                time_col = "Datetime" if "Datetime" in raw.columns else "Date"
                df = pd.DataFrame({
                    "timestamp": (raw[time_col].astype("int64") // 10**6),  # ns -> ms
                    "open": raw["Open"],
                    "high": raw["High"],
                    "low": raw["Low"],
                    "close": raw["Close"],
                    "volume": raw["Volume"],
                }).dropna()
                break
        except Exception as e:
            last_error = e
        time.sleep(1.5 * (attempt + 1))  # short backoff before retrying

    # Yahoo gave us nothing -- fall back to Stooq for daily/weekly only
    # (Stooq doesn't offer free intraday data).
    if df.empty and yf_interval in ("1d", "1wk"):
        df = _fetch_stooq_daily(symbol, weekly=(yf_interval == "1wk"))

    return df


def fetch_crypto_ohlcv(symbol: str, base_timeframe: str, max_candles: int = 20000) -> pd.DataFrame:
    """
    Paginates through ccxt's fetch_ohlcv to build as much history as is
    reasonably available, instead of a single 1000-candle call.
    """
    exchange = getattr(ccxt, CCXT_EXCHANGE)({"enableRateLimit": True})
    real_symbol = CCXT_SYMBOL_ALIASES.get(symbol, symbol)

    # How far back to start pagination from, per base timeframe. Daily/weekly
    # go back years; intraday is capped to keep request counts sane.
    days_map = {
        "1m": 90, "5m": 180, "15m": 365, "30m": 730,
        "1h": 1095, "4h": 1825, "1d": 3650, "1w": 3650,
    }
    now_ms = exchange.milliseconds()
    since = now_ms - days_map.get(base_timeframe, 730) * 24 * 60 * 60 * 1000

    all_candles = []
    per_call_limit = 1000
    max_iterations = max(1, max_candles // per_call_limit) + 2

    for _ in range(max_iterations):
        try:
            batch = exchange.fetch_ohlcv(real_symbol, timeframe=base_timeframe, since=since, limit=per_call_limit)
        except Exception:
            break
        if not batch:
            break
        all_candles.extend(batch)
        last_ts = batch[-1][0]
        if last_ts <= since:
            break  # not making progress, stop to avoid an infinite loop
        since = last_ts + 1
        if last_ts >= now_ms - 1:
            break  # reached present
        if len(all_candles) >= max_candles:
            break

    if not all_candles:
        return _empty_df()

    df = pd.DataFrame(all_candles, columns=["timestamp", "open", "high", "low", "close", "volume"])
    return df.drop_duplicates(subset="timestamp").sort_values("timestamp").reset_index(drop=True)


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

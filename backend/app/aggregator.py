"""
Resamples a base-resolution OHLCV series into any coarser timeframe.
This is how we support 1m/5m/15m/1h/4h/1d/1w from a single stored series
without duplicating data in the database.
"""
import pandas as pd

# pandas resample rule strings
TF_TO_RULE = {
    "1m": "1min", "5m": "5min", "15m": "15min", "30m": "30min",
    "1h": "1h", "4h": "4h", "1d": "1D", "1w": "1W",
}


def resample(df: pd.DataFrame, target_timeframe: str) -> pd.DataFrame:
    """
    df must have columns: timestamp (ms), open, high, low, close, volume
    Returns a new dataframe resampled to target_timeframe, sorted ascending.
    """
    if df.empty:
        return df

    rule = TF_TO_RULE.get(target_timeframe)
    if rule is None:
        raise ValueError(f"Unsupported timeframe: {target_timeframe}")

    work = df.copy()
    work["dt"] = pd.to_datetime(work["timestamp"], unit="ms", utc=True)
    work = work.set_index("dt").sort_index()

    agg = work.resample(rule).agg({
        "open": "first",
        "high": "max",
        "low": "min",
        "close": "last",
        "volume": "sum",
    }).dropna(subset=["open", "high", "low", "close"])

    agg = agg.reset_index()
    agg["timestamp"] = (agg["dt"].astype("int64") // 10**6)
    return agg[["timestamp", "open", "high", "low", "close", "volume"]]

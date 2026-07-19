"""
A small, dependency-light backtesting engine.

Strategy implemented: SMA crossover (long-only)
  - Enter long when fast SMA crosses above slow SMA
  - Exit when fast SMA crosses back below slow SMA

This is intentionally simple and readable so you can swap in your own
strategy logic later (add new functions here and wire them up in main.py).
"""
import pandas as pd
import numpy as np


def sma_crossover_backtest(df: pd.DataFrame, fast_period: int, slow_period: int,
                            initial_cash: float) -> dict:
    """
    df must have columns: timestamp (ms), open, high, low, close, volume
    Returns dict with trades, equity_curve, stats.
    """
    if len(df) < slow_period + 2:
        return {"trades": [], "equity_curve": [], "stats": {"error": "Not enough data for this lookback/period combination"}}

    work = df.copy().reset_index(drop=True)
    work["fast_sma"] = work["close"].rolling(fast_period).mean()
    work["slow_sma"] = work["close"].rolling(slow_period).mean()

    position_open = False
    entry_price = 0.0
    entry_time = None
    cash = initial_cash
    shares = 0.0
    equity_curve = []
    trades = []

    for i in range(len(work)):
        row = work.iloc[i]
        ts = int(row["timestamp"])

        if pd.isna(row["fast_sma"]) or pd.isna(row["slow_sma"]):
            equity_curve.append({"time": ts // 1000, "equity": cash})
            continue

        crossed_up = (
            i > 0
            and work.iloc[i - 1]["fast_sma"] <= work.iloc[i - 1]["slow_sma"]
            and row["fast_sma"] > row["slow_sma"]
        )
        crossed_down = (
            i > 0
            and work.iloc[i - 1]["fast_sma"] >= work.iloc[i - 1]["slow_sma"]
            and row["fast_sma"] < row["slow_sma"]
        )

        if not position_open and crossed_up:
            position_open = True
            entry_price = float(row["close"])
            entry_time = ts
            shares = cash / entry_price
            cash = 0.0

        elif position_open and crossed_down:
            exit_price = float(row["close"])
            cash = shares * exit_price
            pnl = cash - initial_cash if not trades else cash - (trades[-1].get("_equity_before", initial_cash))
            pnl_abs = shares * (exit_price - entry_price)
            pnl_pct = (exit_price - entry_price) / entry_price * 100
            trades.append({
                "entry_time": entry_time // 1000,
                "exit_time": ts // 1000,
                "entry_price": entry_price,
                "exit_price": exit_price,
                "side": "long",
                "pnl": pnl_abs,
                "pnl_pct": pnl_pct,
            })
            shares = 0.0
            position_open = False

        current_equity = cash + shares * float(row["close"])
        equity_curve.append({"time": ts // 1000, "equity": current_equity})

    # close any still-open position at the last bar (mark-to-market)
    if position_open:
        last_price = float(work.iloc[-1]["close"])
        cash = shares * last_price
        pnl_abs = shares * (last_price - entry_price)
        pnl_pct = (last_price - entry_price) / entry_price * 100
        trades.append({
            "entry_time": entry_time // 1000,
            "exit_time": None,
            "entry_price": entry_price,
            "exit_price": None,
            "side": "long (open)",
            "pnl": pnl_abs,
            "pnl_pct": pnl_pct,
        })

    final_equity = equity_curve[-1]["equity"] if equity_curve else initial_cash
    wins = [t for t in trades if (t.get("pnl") or 0) > 0]
    losses = [t for t in trades if (t.get("pnl") or 0) <= 0]

    stats = {
        "initial_cash": initial_cash,
        "final_equity": round(final_equity, 2),
        "total_return_pct": round((final_equity - initial_cash) / initial_cash * 100, 2),
        "num_trades": len(trades),
        "win_rate_pct": round(len(wins) / len(trades) * 100, 2) if trades else 0,
        "avg_win_pct": round(np.mean([t["pnl_pct"] for t in wins]), 2) if wins else 0,
        "avg_loss_pct": round(np.mean([t["pnl_pct"] for t in losses]), 2) if losses else 0,
    }

    return {"trades": trades, "equity_curve": equity_curve, "stats": stats}

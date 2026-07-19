# Trading Tool

A self-hosted charting + bar-replay + backtesting tool, inspired by TradingView.
Built entirely on free/open-source components:

- **Charting**: [lightweight-charts](https://github.com/tradingview/lightweight-charts) (candles + volume)
- **Data**: `yfinance` for stocks, `ccxt` (Binance) for crypto — both free, no API key required
- **Storage**: SQLite (one base-resolution series per symbol, all other timeframes derived on the fly)
- **Backend**: FastAPI (Python)
- **Backtesting**: a small built-in SMA-crossover engine (easy to extend)

## Features

- Candlestick + volume charting (lightweight-charts)
- Multiple timeframes: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w
- Bar-by-bar replay with play/pause/step/speed controls
- Drawing tools: trendline, rectangle, long position, short position
  (long/short draw a take-profit/stop-loss box at ±2%/±1% from entry — adjust
  the math in `DrawingLayer.jsx` if you want different default targets, or make
  them draggable)
- Backtesting: SMA crossover strategy with editable parameters
- Default watchlist: XAUUSD, BTCUSD, AUDCHF, NASDAQ, DOWJONES, SPX500

### Symbol routing

XAUUSD, AUDCHF, NASDAQ, DOWJONES, and SPX500 aren't plain stock tickers, so they're
routed through Yahoo Finance under the hood using these real tickers (see
`backend/app/data_sources.py` → `YF_SYMBOL_ALIASES`):

| Display symbol | Actual ticker | What it is |
|---|---|---|
| XAUUSD | GC=F | Gold futures |
| AUDCHF | AUDCHF=X | FX pair |
| NASDAQ | ^IXIC | Nasdaq Composite |
| DOWJONES | ^DJI | Dow Jones Industrial Average |
| SPX500 | ^GSPC | S&P 500 |
| BTCUSD | BTC/USDT (via Binance/ccxt) | Bitcoin |

You can add more aliases the same way, or just type a raw ticker into the symbol
box (e.g. any yfinance-supported ticker, or `ETH/USDT` for crypto).

## What this is (and isn't)

This gives you real multi-asset charting, multiple timeframes, bar-by-bar replay for
manual backtesting, and an automated backtest for one starter strategy — all running
on your own infrastructure. It is **not** a pixel-for-pixel TradingView clone: no
account system, no full drawing-tools suite, no Pine Script. Think of it as a solid,
extensible foundation you can build on.

## Local development

```bash
# backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Frontend dev server runs on `http://localhost:5173` and proxies `/api` to `http://localhost:8000`.

## Deploying on Coolify

1. **Push this project to a git repo** (GitHub/GitLab/etc.) — Coolify deploys from git.
2. In Coolify, create a **new resource → Docker Compose** and point it at your repo.
   Coolify will detect `docker-compose.yml` at the root.
3. Set the **frontend** service as the one Coolify exposes publicly, and attach your domain
   to it in the Coolify UI (Coolify handles the reverse proxy + Let's Encrypt SSL for you —
   you don't need to touch nginx ports manually).
4. Deploy. Coolify will build both images and start the stack.
5. The `trading_data` volume persists your SQLite database (cached OHLCV history) across
   deployments — don't delete it unless you want to re-fetch everything from scratch.

That's it — no other paid services required.

### Environment / domain notes

- The frontend's nginx config proxies `/api/*` to the `backend` container over the internal
  Docker network (`http://backend:8000`), so your domain only needs to point at the frontend
  service. You don't need a separate subdomain for the API.
- If you later want to lock down CORS, edit `backend/app/main.py` and replace
  `allow_origins=["*"]` with your actual domain.

## Known limitations of the free data sources

- **Stocks (yfinance)**: intraday data (1m/5m/15m/30m/1h) is only available for a limited
  lookback window (Yahoo restricts this, not us — typically the last ~60 days for sub-hourly
  data). Daily and weekly history goes back years.
- **Crypto (ccxt/Binance)**: no API key needed for OHLCV, but there's a rate limit and a
  cap on how many candles you get per request (handled automatically — we cache what we fetch
  so repeated chart loads don't re-hit the API).
- Neither source is real-time tick-by-tick — data refreshes on a short cache window (defined
  in `FRESHNESS_SECONDS` in `backend/app/main.py`) rather than streaming live.

## How bar replay works

The backend always returns the full historical series for the selected symbol/timeframe.
The frontend keeps that full array in memory and reveals it bar-by-bar using a "visible count"
cursor — play/pause/step/speed just move that cursor. This means replay is instant and free
(no re-fetching), and it's also how you'd extend this to let a user manually log hypothetical
trades at any point in the replay.

## Extending it

- **More strategies**: add functions to `backend/app/backtest.py` alongside
  `sma_crossover_backtest`, and add a new `/api/backtest` variant or a `strategy` field to
  the request.
- **More data sources**: add a new function in `backend/app/data_sources.py` and register
  it in `fetch_ohlcv()`.
- **Drawing tools / indicators on the chart**: lightweight-charts supports custom series and
  primitives — a good next step would be adding a simple moving-average overlay using its
  built-in line series.

## Project structure

```
trading-tool/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py          # FastAPI routes
│       ├── database.py      # SQLite models
│       ├── data_sources.py  # yfinance + ccxt fetchers
│       ├── aggregator.py    # timeframe resampling
│       ├── backtest.py      # SMA crossover backtest engine
│       └── schemas.py       # request/response models
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    └── src/
        ├── App.jsx
        ├── api.js
        └── components/
            ├── ChartPanel.jsx      # candles + volume + replay rendering
            ├── ReplayControls.jsx  # play/pause/step/speed
            ├── TimeframeBar.jsx    # 1m..1w selector
            └── BacktestPanel.jsx   # strategy params + results
```
# backtester

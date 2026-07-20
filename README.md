# Trading Tool

A self-hosted charting + bar-replay tool, inspired by TradingView.
Built entirely on free/open-source components:

- **Charting**: [lightweight-charts](https://github.com/tradingview/lightweight-charts) (candles + volume)
- **Data**: `yfinance` (+ Stooq fallback) for stocks/FX/indices, `ccxt` (Binance) for crypto — all free, no API key required
- **Storage**: SQLite (one base-resolution series per symbol, all other timeframes derived on the fly)
- **Backend**: FastAPI (Python)

## Features

- Candlestick + volume charting, full-width, with a customizable appearance
  (up/down colors, background, text color, grid on/off, volume on/off — via
  the ⚙ Chart settings button)
- Multiple timeframes: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w — each pulling the
  maximum history the underlying free source allows
- Drawing tools: trendline, rectangle, long position, short position
  (long/short draw a take-profit/stop-loss box at +2%/-1% from entry by
  default — adjust the math in `DrawingLayer.jsx` if you want different
  targets, or make them draggable)
- Bar-by-bar replay: click "Start bar replay", then click any bar on the
  chart to choose your starting point, then Play/Pause, step forward one bar
  at a time with "Next bar", and control playback speed
- Default watchlist: XAUUSD, BTCUSD, AUDCHF, NASDAQ, DOWJONES, SPX500

## Symbol routing

XAUUSD, AUDCHF, NASDAQ, DOWJONES, and SPX500 aren't plain stock tickers, so
they're routed through Yahoo Finance under the hood using these real tickers
(see `backend/app/data_sources.py` → `YF_SYMBOL_ALIASES`):

| Display symbol | Actual ticker | What it is |
|---|---|---|
| XAUUSD | XAUUSD=X | **Spot** gold (forex-style quote, not futures) |
| AUDCHF | AUDCHF=X | Spot FX pair |
| NASDAQ | ^IXIC | Nasdaq Composite |
| DOWJONES | ^DJI | Dow Jones Industrial Average |
| SPX500 | ^GSPC | S&P 500 |
| BTCUSD | BTC/USDT (via Binance/ccxt) | Bitcoin |

You can add more aliases the same way, or just type a raw ticker into the
symbol box (any yfinance-supported ticker, or e.g. `ETH/USDT` for crypto).

## Data reliability

Yahoo Finance sometimes rate-limits or blocks requests from datacenter/VPS
IPs — this is a known yfinance issue, not something specific to this app. To
reduce that, the backend:
- reuses a single `requests.Session` with a normal browser User-Agent
- retries a couple of times with a short backoff before giving up
- falls back to **Stooq** (a free, keyless data provider) for daily/weekly
  data if Yahoo returns nothing

If a symbol still shows no data after a redeploy, check the backend logs —
the real error (timeout, rate limit, bad ticker, etc.) will be there.

## What this is (and isn't)

This gives you real multi-asset charting, multiple timeframes, and bar-by-bar
replay — all running on your own infrastructure. It is **not** a
pixel-for-pixel TradingView clone: no account system, no Pine Script, no
full indicator suite. Think of it as a solid, extensible foundation.

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
3. In the resource's **Configuration → General** page, set a domain in
   **Domains for frontend** (leave "Domains for backend" empty — the backend
   should only be reachable internally via the frontend's nginx proxy).
4. Click **Save**, then **Deploy**.
5. The `trading_data` volume persists your SQLite database (cached OHLCV
   history) across deployments — don't delete it unless you want to
   re-fetch everything from scratch.

That's it — no other paid services required.

### Environment / domain notes

- The frontend's nginx config proxies `/api/*` to the `backend` container over
  the internal Docker network (`http://backend:8000`), so your domain only
  needs to point at the frontend service.
- If you later want to lock down CORS, edit `backend/app/main.py` and replace
  `allow_origins=["*"]` with your actual domain.

## Known limitations of the free data sources

- **Stocks/FX/indices (yfinance)**: intraday data (1m/5m/15m/30m/1h) is only
  available for a limited lookback window — this is a Yahoo restriction, not
  ours (typically the last ~60 days for sub-hourly data). Daily/weekly history
  uses `period=max`, i.e. the full history Yahoo has for that ticker.
- **Crypto (ccxt/Binance)**: no API key needed for OHLCV. The backend paginates
  through Binance's API to build as much history as is reasonably available
  per timeframe (see `days_map` in `backend/app/data_sources.py` if you want
  to fetch even further back for a given timeframe).
- Neither source is real-time tick-by-tick — data refreshes on a short cache
  window (`FRESHNESS_SECONDS` in `backend/app/main.py`) rather than streaming live.

## How bar replay works

1. Click **Start bar replay** — the full chart history is shown.
2. Click any bar on the chart — that becomes your replay starting point.
3. Use **Play/Pause**, **Next bar**, and the **Speed** dropdown to step
   through history bar by bar from there.
4. **Exit replay** returns to the full live chart.

Since the backend already returns the full historical series, replay itself
never re-fetches data — it just reveals more of the already-loaded array,
so stepping and playback are instant.

## Drawing tools

- **Trendline** / **Rectangle**: click once to set the start point, click
  again to set the end point (Escape cancels a pending drawing).
- **Long** / **Short**: a single click places the tool at that price/time,
  drawing an entry line plus a take-profit/stop-loss box.
- **Clear**: removes all drawings on the current chart.
- Drawings are tied to the current symbol/timeframe's price-time scale and
  are cleared automatically when you switch symbol or timeframe.

## Extending it

- **More data sources**: add a function in `backend/app/data_sources.py` and
  register it in `fetch_ohlcv()`.
- **Editable/draggable drawings**: `DrawingLayer.jsx` currently draws
  fire-and-forget shapes; adding drag handles on the endpoints is the natural
  next step if you want to adjust a drawing after placing it.
- **Indicators**: lightweight-charts supports additional line series — a
  moving-average overlay is a good first addition.

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
│       ├── data_sources.py  # yfinance + Stooq + ccxt fetchers
│       ├── aggregator.py    # timeframe resampling
│       └── schemas.py       # request/response models
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    └── src/
        ├── App.jsx
        ├── api.js
        └── components/
            ├── ChartPanel.jsx          # candles + volume + replay + drawing overlay host
            ├── DrawingLayer.jsx        # trendline/rectangle/long/short rendering + interaction
            ├── DrawingToolbar.jsx      # tool picker
            ├── ChartSettingsPanel.jsx  # colors/grid/volume customization
            ├── ReplayControls.jsx      # play/pause/next-bar/speed
            └── TimeframeBar.jsx        # 1m..1w selector
```

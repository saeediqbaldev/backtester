const BASE = '/api'

export async function fetchOHLCV(source, symbol, timeframe, limit = 1000) {
  const params = new URLSearchParams({ source, symbol, timeframe, limit })
  const res = await fetch(`${BASE}/ohlcv?${params.toString()}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Failed to load data (${res.status})`)
  }
  return res.json()
}

export async function runBacktest(payload) {
  const res = await fetch(`${BASE}/backtest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Backtest failed (${res.status})`)
  }
  return res.json()
}

export async function fetchPopularSymbols(source) {
  const res = await fetch(`${BASE}/symbols/popular?source=${source}`)
  if (!res.ok) return { symbols: [] }
  return res.json()
}

export async function fetchDefaultWatchlist() {
  const res = await fetch(`${BASE}/symbols/default_watchlist`)
  if (!res.ok) return { symbols: [] }
  return res.json()
}

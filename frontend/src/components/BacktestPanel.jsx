import { useState } from 'react'
import { runBacktest } from '../api'

export default function BacktestPanel({ symbol, source, timeframe, onResult }) {
  const [fast, setFast] = useState(10)
  const [slow, setSlow] = useState(30)
  const [cash, setCash] = useState(10000)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState(null)

  async function handleRun() {
    setLoading(true)
    setError(null)
    try {
      const result = await runBacktest({
        symbol,
        source,
        timeframe,
        fast_period: Number(fast),
        slow_period: Number(slow),
        initial_cash: Number(cash),
        lookback_bars: 500,
      })
      setStats(result.stats)
      onResult?.(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="panel">
      <h3>Backtest — SMA crossover</h3>
      <div className="form-row">
        <label>Fast SMA</label>
        <input type="number" value={fast} onChange={(e) => setFast(e.target.value)} min={2} max={200} />
      </div>
      <div className="form-row">
        <label>Slow SMA</label>
        <input type="number" value={slow} onChange={(e) => setSlow(e.target.value)} min={5} max={400} />
      </div>
      <div className="form-row">
        <label>Starting cash</label>
        <input type="number" value={cash} onChange={(e) => setCash(e.target.value)} min={100} />
      </div>
      <button className="btn btn-primary" onClick={handleRun} disabled={loading}>
        {loading ? 'Running…' : 'Run backtest'}
      </button>

      {error && <p className="error">{error}</p>}

      {stats && !stats.error && (
        <div className="stats-grid">
          <Stat label="Final equity" value={`$${stats.final_equity.toLocaleString()}`} />
          <Stat label="Total return" value={`${stats.total_return_pct}%`} />
          <Stat label="Trades" value={stats.num_trades} />
          <Stat label="Win rate" value={`${stats.win_rate_pct}%`} />
          <Stat label="Avg win" value={`${stats.avg_win_pct}%`} />
          <Stat label="Avg loss" value={`${stats.avg_loss_pct}%`} />
        </div>
      )}
      {stats?.error && <p className="error">{stats.error}</p>}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  )
}

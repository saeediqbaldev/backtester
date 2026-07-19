import { useEffect, useRef, useState } from 'react'
import ChartPanel from './components/ChartPanel.jsx'
import ReplayControls from './components/ReplayControls.jsx'
import TimeframeBar from './components/TimeframeBar.jsx'
import BacktestPanel from './components/BacktestPanel.jsx'
import DrawingToolbar from './components/DrawingToolbar.jsx'
import { fetchOHLCV, fetchDefaultWatchlist } from './api'

export default function App() {
  const [watchlist, setWatchlist] = useState([])
  const [source, setSource] = useState('stock')
  const [symbol, setSymbol] = useState('XAUUSD')
  const [symbolInput, setSymbolInput] = useState('XAUUSD')
  const [timeframe, setTimeframe] = useState('1h')

  const [candles, setCandles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [replayMode, setReplayMode] = useState(false)
  const [visibleCount, setVisibleCount] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(500)
  const [markers, setMarkers] = useState([])

  const [activeTool, setActiveTool] = useState('cursor')
  const [drawings, setDrawings] = useState([])

  const intervalRef = useRef(null)

  useEffect(() => {
    fetchDefaultWatchlist().then((d) => setWatchlist(d.symbols || []))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setDrawings([])
    fetchOHLCV(source, symbol, timeframe, 1000)
      .then((data) => {
        if (cancelled) return
        setCandles(data.candles)
        setVisibleCount(data.candles.length) // start fully revealed; replay mode resets this
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [source, symbol, timeframe])

  // replay playback loop
  useEffect(() => {
    if (isPlaying && replayMode) {
      intervalRef.current = setInterval(() => {
        setVisibleCount((v) => {
          if (v >= candles.length) {
            setIsPlaying(false)
            return v
          }
          return v + 1
        })
      }, speed)
    }
    return () => clearInterval(intervalRef.current)
  }, [isPlaying, replayMode, speed, candles.length])

  function handleEnterReplay() {
    setReplayMode(true)
    setVisibleCount(Math.max(20, Math.floor(candles.length * 0.3)))
    setIsPlaying(false)
    setMarkers([])
  }

  function handleExitReplay() {
    setReplayMode(false)
    setIsPlaying(false)
    setVisibleCount(candles.length)
  }

  function handleSymbolSubmit(e) {
    e.preventDefault()
    setSymbol(symbolInput.trim())
  }

  function handleWatchlistSelect(item) {
    setSource(item.source)
    setSymbol(item.symbol)
    setSymbolInput(item.symbol)
  }

  function handleToolSelect(toolId) {
    setActiveTool((current) => (current === toolId ? 'cursor' : toolId))
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>Trading Tool</h1>
        <div className="source-toggle">
          <button className={source === 'crypto' ? 'active' : ''} onClick={() => setSource('crypto')}>
            Crypto
          </button>
          <button className={source === 'stock' ? 'active' : ''} onClick={() => setSource('stock')}>
            Stocks
          </button>
        </div>
        <form onSubmit={handleSymbolSubmit} className="symbol-form">
          <input
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value)}
            placeholder={source === 'crypto' ? 'e.g. BTC/USDT' : 'e.g. AAPL'}
          />
          <button type="submit" className="btn btn-primary">Load</button>
        </form>
        <div className="popular-symbols">
          {watchlist.map((item) => (
            <button
              key={item.symbol}
              className={item.symbol === symbol ? 'active' : ''}
              onClick={() => handleWatchlistSelect(item)}
            >
              {item.symbol}
            </button>
          ))}
        </div>
      </header>

      <TimeframeBar timeframe={timeframe} onChange={setTimeframe} />

      <main className="main-grid">
        <section className="chart-section">
          <div className="chart-toolbar">
            <span className="symbol-label">{symbol} · {timeframe}</span>
            {!replayMode ? (
              <button className="btn" onClick={handleEnterReplay}>Start bar replay</button>
            ) : (
              <button className="btn" onClick={handleExitReplay}>Exit replay</button>
            )}
          </div>

          <DrawingToolbar
            activeTool={activeTool}
            onSelectTool={handleToolSelect}
            onClear={() => setDrawings([])}
          />

          {loading && <p className="hint">Loading data…</p>}
          {error && <p className="error">{error}</p>}

          {!loading && !error && (
            <ChartPanel
              allCandles={candles}
              visibleCount={visibleCount}
              markers={markers}
              activeTool={activeTool}
              drawings={drawings}
              setDrawings={setDrawings}
              onToolDone={() => setActiveTool('cursor')}
            />
          )}

          {replayMode && (
            <ReplayControls
              isPlaying={isPlaying}
              onTogglePlay={() => setIsPlaying((p) => !p)}
              onStepBack={() => setVisibleCount((v) => Math.max(1, v - 1))}
              onStepForward={() => setVisibleCount((v) => Math.min(candles.length, v + 1))}
              onReset={() => setVisibleCount(Math.max(20, Math.floor(candles.length * 0.3)))}
              speed={speed}
              onSpeedChange={setSpeed}
              visibleCount={visibleCount}
              total={candles.length}
            />
          )}
        </section>

        <aside className="sidebar">
          <BacktestPanel symbol={symbol} source={source} timeframe={timeframe} />
        </aside>
      </main>
    </div>
  )
}

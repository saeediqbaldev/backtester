import { useEffect, useRef, useState } from 'react'
import ChartPanel, { DEFAULT_CHART_OPTIONS } from './components/ChartPanel.jsx'
import ReplayControls from './components/ReplayControls.jsx'
import TimeframeBar from './components/TimeframeBar.jsx'
import DrawingToolbar from './components/DrawingToolbar.jsx'
import ChartSettingsPanel from './components/ChartSettingsPanel.jsx'
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

  // Replay: awaitingAnchor = user needs to click a bar to choose the start point.
  const [replayMode, setReplayMode] = useState(false)
  const [awaitingAnchor, setAwaitingAnchor] = useState(false)
  const [visibleCount, setVisibleCount] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(800)
  const [markers] = useState([])

  const [activeTool, setActiveTool] = useState('cursor')
  const [drawings, setDrawings] = useState([])

  const [chartOptions, setChartOptions] = useState(DEFAULT_CHART_OPTIONS)
  const [showSettings, setShowSettings] = useState(false)

  const intervalRef = useRef(null)

  useEffect(() => {
    fetchDefaultWatchlist().then((d) => setWatchlist(d.symbols || []))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setDrawings([])
    setReplayMode(false)
    setAwaitingAnchor(false)
    setIsPlaying(false)

    fetchOHLCV(source, symbol, timeframe, 5000)
      .then((data) => {
        if (cancelled) return
        setCandles(data.candles)
        setVisibleCount(data.candles.length) // fully revealed until replay is started
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [source, symbol, timeframe])

  // replay playback loop
  useEffect(() => {
    if (isPlaying && replayMode && !awaitingAnchor) {
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
  }, [isPlaying, replayMode, awaitingAnchor, speed, candles.length])

  function handleEnterReplay() {
    if (!candles.length) return
    setReplayMode(true)
    setAwaitingAnchor(true)
    setIsPlaying(false)
    setActiveTool('cursor')
    setVisibleCount(candles.length) // show full history so the user can click a starting bar
  }

  function handleAnchorSelected(clickedTime) {
    // find the last candle at or before the clicked time
    let idx = candles.findIndex((c) => c.time > clickedTime)
    if (idx === -1) idx = candles.length
    const startIndex = Math.max(10, idx) // keep at least 10 bars of context
    setVisibleCount(startIndex)
    setAwaitingAnchor(false)
    setIsPlaying(false)
  }

  function handleExitReplay() {
    setReplayMode(false)
    setAwaitingAnchor(false)
    setIsPlaying(false)
    setVisibleCount(candles.length)
  }

  function handleNextBar() {
    setVisibleCount((v) => Math.min(candles.length, v + 1))
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

  const replayReady = replayMode && !awaitingAnchor
  const replayComplete = replayReady && visibleCount >= candles.length

  return (
    <div className="app">
      <header className="topbar">
        <h1>Trading Tool</h1>
        <div className="source-toggle">
          <button className={source === 'crypto' ? 'active' : ''} onClick={() => setSource('crypto')}>
            Crypto
          </button>
          <button className={source === 'stock' ? 'active' : ''} onClick={() => setSource('stock')}>
            Stocks / FX / Indices
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

      <main className="main-full">
        <section className="chart-section">
          <div className="chart-toolbar">
            <span className="symbol-label">{symbol} · {timeframe}</span>
            <div className="chart-toolbar-actions">
              {!replayMode ? (
                <button className="btn" onClick={handleEnterReplay}>Start bar replay</button>
              ) : (
                <button className="btn" onClick={handleExitReplay}>Exit replay</button>
              )}
              <button className="btn" onClick={() => setShowSettings((s) => !s)}>⚙ Chart settings</button>
            </div>
          </div>

          <div className="chart-toolbar-row">
            <DrawingToolbar
              activeTool={activeTool}
              onSelectTool={handleToolSelect}
              onClear={() => setDrawings([])}
            />
            {showSettings && (
              <ChartSettingsPanel
                options={chartOptions}
                onChange={setChartOptions}
                onClose={() => setShowSettings(false)}
              />
            )}
          </div>

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
              chartOptions={chartOptions}
              awaitingAnchor={awaitingAnchor}
              onAnchorSelected={handleAnchorSelected}
            />
          )}

          {replayReady && (
            <ReplayControls
              isPlaying={isPlaying}
              onTogglePlay={() => setIsPlaying((p) => !p)}
              onNextBar={handleNextBar}
              onExit={handleExitReplay}
              speed={speed}
              onSpeedChange={setSpeed}
              visibleCount={visibleCount}
              total={candles.length}
              complete={replayComplete}
            />
          )}
        </section>
      </main>
    </div>
  )
}

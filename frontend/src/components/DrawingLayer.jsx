import { useEffect, useRef, useState } from 'react'

/**
 * Transparent SVG overlay sitting on top of the lightweight-charts canvas.
 * Converts drawings between pixel space (for rendering) and time/price space
 * (for persistence), using the chart + series instances passed in from ChartPanel.
 */
export default function DrawingLayer({ chart, series, tool, onToolDone, drawings, setDrawings, width, height }) {
  const [pending, setPending] = useState(null) // in-progress drawing
  const svgRef = useRef(null)

  function pixelToData(x, y) {
    if (!chart || !series) return null
    const time = chart.timeScale().coordinateToTime(x)
    const price = series.coordinateToPrice(y)
    if (time === null || price === null) return null
    return { time, price }
  }

  function dataToPixel(time, price) {
    if (!chart || !series) return null
    const x = chart.timeScale().timeToCoordinate(time)
    const y = series.priceToCoordinate(price)
    if (x === null || y === null) return null
    return { x, y }
  }

  function handleMouseDown(e) {
    if (!tool || tool === 'cursor') return
    const rect = svgRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const point = pixelToData(x, y)
    if (!point) return

    if (tool === 'long' || tool === 'short') {
      const entryPrice = point.price
      const isLong = tool === 'long'
      const target = isLong ? entryPrice * 1.02 : entryPrice * 0.98
      const stop = isLong ? entryPrice * 0.99 : entryPrice * 1.01
      const newDrawing = {
        id: Date.now(),
        type: tool,
        time: point.time,
        entryPrice,
        target,
        stop,
      }
      setDrawings((d) => [...d, newDrawing])
      onToolDone?.()
      return
    }

    // trendline / rectangle: two-click drawings
    if (!pending) {
      setPending({ type: tool, start: point })
    } else {
      const newDrawing = { id: Date.now(), type: pending.type, start: pending.start, end: point }
      setDrawings((d) => [...d, newDrawing])
      setPending(null)
      onToolDone?.()
    }
  }

  function handleMouseMove(e) {
    if (!pending) return
    const rect = svgRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const point = pixelToData(x, y)
    if (point) setPending((p) => ({ ...p, hover: point }))
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') setPending(null)
  }

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function renderLine(d, key) {
    const p1 = dataToPixel(d.start.time, d.start.price)
    const p2 = dataToPixel(d.end.time, d.end.price)
    if (!p1 || !p2) return null
    return (
      <line key={key} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
        stroke="#3b82f6" strokeWidth="2" />
    )
  }

  function renderRect(d, key) {
    const p1 = dataToPixel(d.start.time, d.start.price)
    const p2 = dataToPixel(d.end.time, d.end.price)
    if (!p1 || !p2) return null
    const x = Math.min(p1.x, p2.x)
    const y = Math.min(p1.y, p2.y)
    const w = Math.abs(p2.x - p1.x)
    const h = Math.abs(p2.y - p1.y)
    return (
      <rect key={key} x={x} y={y} width={w} height={h}
        fill="rgba(59,130,246,0.15)" stroke="#3b82f6" strokeWidth="1.5" />
    )
  }

  function renderPosition(d, key) {
    const isLong = d.type === 'long'
    const entryPx = dataToPixel(d.time, d.entryPrice)
    const targetPx = dataToPixel(d.time, d.target)
    const stopPx = dataToPixel(d.time, d.stop)
    if (!entryPx || !targetPx || !stopPx) return null
    const boxWidth = 120
    const profitColor = 'rgba(38,166,154,0.25)'
    const lossColor = 'rgba(239,83,80,0.25)'
    const topY = Math.min(targetPx.y, stopPx.y)
    const profitTop = isLong ? targetPx.y : entryPx.y
    const profitHeight = Math.abs(entryPx.y - targetPx.y)
    const lossTop = isLong ? entryPx.y : stopPx.y
    const lossHeight = Math.abs(stopPx.y - entryPx.y)

    return (
      <g key={key}>
        <rect x={entryPx.x} y={profitTop} width={boxWidth} height={profitHeight} fill={profitColor} />
        <rect x={entryPx.x} y={lossTop} width={boxWidth} height={lossHeight} fill={lossColor} />
        <line x1={entryPx.x} y1={entryPx.y} x2={entryPx.x + boxWidth} y2={entryPx.y} stroke="#e6e9ef" strokeWidth="1.5" />
        <text x={entryPx.x + 4} y={entryPx.y - 4} fill="#e6e9ef" fontSize="11">
          {isLong ? 'Long' : 'Short'} @ {d.entryPrice.toFixed(2)}
        </text>
        <text x={entryPx.x + 4} y={targetPx.y + 12} fill="#26a69a" fontSize="11">
          TP {d.target.toFixed(2)}
        </text>
        <text x={entryPx.x + 4} y={stopPx.y - 4} fill="#ef5350" fontSize="11">
          SL {d.stop.toFixed(2)}
        </text>
      </g>
    )
  }

  return (
    <svg
      ref={svgRef}
      className="drawing-layer"
      width={width}
      height={height}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      style={{ pointerEvents: tool && tool !== 'cursor' ? 'auto' : 'none', cursor: tool && tool !== 'cursor' ? 'crosshair' : 'default' }}
    >
      {drawings.map((d, i) => {
        if (d.type === 'trendline') return renderLine(d, i)
        if (d.type === 'rectangle') return renderRect(d, i)
        if (d.type === 'long' || d.type === 'short') return renderPosition(d, i)
        return null
      })}
      {pending?.hover && pending.type === 'trendline' && renderLine({ start: pending.start, end: pending.hover }, 'pending')}
      {pending?.hover && pending.type === 'rectangle' && renderRect({ start: pending.start, end: pending.hover }, 'pending')}
    </svg>
  )
}

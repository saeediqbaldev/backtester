import { useEffect, useRef, useState } from 'react'
import { createChart, CrosshairMode } from 'lightweight-charts'
import DrawingLayer from './DrawingLayer.jsx'

/**
 * Renders candles + volume. `visibleCount` controls how many bars from the
 * start of `allCandles` are actually shown -- this is what powers replay:
 * the parent just increments visibleCount instead of re-fetching data.
 */
export default function ChartPanel({
  allCandles, visibleCount, markers = [],
  activeTool = 'cursor', drawings = [], setDrawings = () => {}, onToolDone = () => {},
}) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const candleSeriesRef = useRef(null)
  const volumeSeriesRef = useRef(null)
  const [dims, setDims] = useState({ width: 0, height: 480 })
  const [chartReady, setChartReady] = useState(0) // bump to force overlay re-render on pan/zoom

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#c9cdd3',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.05)' },
        horzLines: { color: 'rgba(255,255,255,0.05)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.1)', timeVisible: true, secondsVisible: false },
      width: containerRef.current.clientWidth,
      height: 480,
    })

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    })

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    })
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    })

    chartRef.current = chart
    candleSeriesRef.current = candleSeries
    volumeSeriesRef.current = volumeSeries
    setDims({ width: containerRef.current.clientWidth, height: 480 })

    const bump = () => setChartReady((n) => n + 1)
    chart.timeScale().subscribeVisibleTimeRangeChange(bump)
    chart.timeScale().subscribeVisibleLogicalRangeChange(bump)

    const handleResize = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth
        chart.applyOptions({ width: w })
        setDims({ width: w, height: 480 })
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.timeScale().unsubscribeVisibleTimeRangeChange(bump)
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(bump)
      chart.remove()
    }
  }, [])

  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return
    const slice = allCandles.slice(0, visibleCount)

    candleSeriesRef.current.setData(
      slice.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }))
    )
    volumeSeriesRef.current.setData(
      slice.map((c) => ({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)',
      }))
    )

    if (markers.length) {
      const visibleMarkers = markers.filter((m) => m.time <= (slice[slice.length - 1]?.time ?? 0))
      candleSeriesRef.current.setMarkers(visibleMarkers)
    } else {
      candleSeriesRef.current.setMarkers([])
    }
  }, [allCandles, visibleCount, markers])

  return (
    <div className="chart-wrapper" style={{ position: 'relative' }}>
      <div ref={containerRef} className="chart-container" />
      <div style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
        <DrawingLayer
          key={chartReady}
          chart={chartRef.current}
          series={candleSeriesRef.current}
          tool={activeTool}
          drawings={drawings}
          setDrawings={setDrawings}
          width={dims.width}
          height={dims.height}
          onToolDone={onToolDone}
        />
      </div>
    </div>
  )
}

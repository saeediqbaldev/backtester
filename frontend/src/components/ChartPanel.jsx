import { useEffect, useRef, useState } from 'react'
import { createChart, CrosshairMode } from 'lightweight-charts'
import DrawingLayer from './DrawingLayer.jsx'

export const DEFAULT_CHART_OPTIONS = {
  background: '#0e1117',
  grid: 'rgba(255,255,255,0.06)',
  text: '#c9cdd3',
  upColor: '#26a69a',
  downColor: '#ef5350',
  showVolume: true,
  showGrid: true,
}

/**
 * Renders candles + volume. `visibleCount` controls how many bars from the
 * start of `allCandles` are actually shown -- this is what powers replay:
 * the parent just increments visibleCount instead of re-fetching data.
 *
 * `awaitingAnchor` + `onAnchorSelected` power "click a bar to start replay
 * from there": while awaitingAnchor is true, clicking the chart reports the
 * clicked time back to the parent instead of doing anything else.
 */
export default function ChartPanel({
  allCandles, visibleCount, markers = [],
  activeTool = 'cursor', drawings = [], setDrawings = () => {}, onToolDone = () => {},
  chartOptions = DEFAULT_CHART_OPTIONS,
  awaitingAnchor = false, onAnchorSelected = () => {},
}) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const candleSeriesRef = useRef(null)
  const volumeSeriesRef = useRef(null)
  const awaitingAnchorRef = useRef(awaitingAnchor)
  const [dims, setDims] = useState({ width: 0, height: 600 })
  const [, setChartTick] = useState(0) // bumped on pan/zoom so the drawing overlay repositions

  useEffect(() => {
    awaitingAnchorRef.current = awaitingAnchor
  }, [awaitingAnchor])

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: chartOptions.background },
        textColor: chartOptions.text,
      },
      grid: {
        vertLines: { color: chartOptions.showGrid ? chartOptions.grid : 'transparent' },
        horzLines: { color: chartOptions.showGrid ? chartOptions.grid : 'transparent' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.1)', timeVisible: true, secondsVisible: false },
      width: containerRef.current.clientWidth,
      height: 600,
    })

    const candleSeries = chart.addCandlestickSeries({
      upColor: chartOptions.upColor,
      downColor: chartOptions.downColor,
      borderVisible: false,
      wickUpColor: chartOptions.upColor,
      wickDownColor: chartOptions.downColor,
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
    setDims({ width: containerRef.current.clientWidth, height: 600 })

    const bump = () => setChartTick((n) => n + 1)
    chart.timeScale().subscribeVisibleTimeRangeChange(bump)
    chart.timeScale().subscribeVisibleLogicalRangeChange(bump)

    const handleClick = (param) => {
      if (!awaitingAnchorRef.current) return
      if (!param.time) return
      onAnchorSelected(param.time)
    }
    chart.subscribeClick(handleClick)

    const handleResize = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth
        chart.applyOptions({ width: w })
        setDims({ width: w, height: 600 })
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.timeScale().unsubscribeVisibleTimeRangeChange(bump)
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(bump)
      chart.unsubscribeClick(handleClick)
      chart.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Apply appearance changes live, without recreating the chart.
  useEffect(() => {
    if (!chartRef.current) return
    chartRef.current.applyOptions({
      layout: { background: { color: chartOptions.background }, textColor: chartOptions.text },
      grid: {
        vertLines: { color: chartOptions.showGrid ? chartOptions.grid : 'transparent' },
        horzLines: { color: chartOptions.showGrid ? chartOptions.grid : 'transparent' },
      },
    })
    candleSeriesRef.current?.applyOptions({
      upColor: chartOptions.upColor,
      downColor: chartOptions.downColor,
      wickUpColor: chartOptions.upColor,
      wickDownColor: chartOptions.downColor,
    })
    volumeSeriesRef.current?.applyOptions({
      visible: chartOptions.showVolume,
    })
  }, [chartOptions])

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
          chart={chartRef.current}
          series={candleSeriesRef.current}
          tool={awaitingAnchor ? 'cursor' : activeTool}
          drawings={drawings}
          setDrawings={setDrawings}
          width={dims.width}
          height={dims.height}
          onToolDone={onToolDone}
        />
      </div>
      {awaitingAnchor && (
        <div className="replay-anchor-hint">Click a bar on the chart to start replay from there</div>
      )}
    </div>
  )
}

const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']

export default function TimeframeBar({ timeframe, onChange }) {
  return (
    <div className="timeframe-bar">
      {TIMEFRAMES.map((tf) => (
        <button
          key={tf}
          className={`tf-btn ${tf === timeframe ? 'active' : ''}`}
          onClick={() => onChange(tf)}
        >
          {tf}
        </button>
      ))}
    </div>
  )
}

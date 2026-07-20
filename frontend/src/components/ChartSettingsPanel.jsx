export default function ChartSettingsPanel({ options, onChange, onClose }) {
  function update(key, value) {
    onChange({ ...options, [key]: value })
  }

  function reset() {
    onChange({
      background: '#0e1117',
      grid: 'rgba(255,255,255,0.06)',
      text: '#c9cdd3',
      upColor: '#26a69a',
      downColor: '#ef5350',
      showVolume: true,
      showGrid: true,
    })
  }

  return (
    <div className="settings-popover">
      <div className="settings-header">
        <span>Chart appearance</span>
        <button className="settings-close" onClick={onClose}>✕</button>
      </div>

      <div className="settings-row">
        <label>Up candle</label>
        <input type="color" value={options.upColor} onChange={(e) => update('upColor', e.target.value)} />
      </div>
      <div className="settings-row">
        <label>Down candle</label>
        <input type="color" value={options.downColor} onChange={(e) => update('downColor', e.target.value)} />
      </div>
      <div className="settings-row">
        <label>Background</label>
        <input type="color" value={options.background} onChange={(e) => update('background', e.target.value)} />
      </div>
      <div className="settings-row">
        <label>Text</label>
        <input type="color" value={options.text} onChange={(e) => update('text', e.target.value)} />
      </div>

      <div className="settings-row">
        <label>Show grid</label>
        <input type="checkbox" checked={options.showGrid} onChange={(e) => update('showGrid', e.target.checked)} />
      </div>
      <div className="settings-row">
        <label>Show volume</label>
        <input type="checkbox" checked={options.showVolume} onChange={(e) => update('showVolume', e.target.checked)} />
      </div>

      <button className="btn" onClick={reset}>Reset to default</button>
    </div>
  )
}

const TOOLS = [
  { id: 'cursor', label: 'Cursor', icon: '⭰' },
  { id: 'trendline', label: 'Trendline', icon: '╱' },
  { id: 'rectangle', label: 'Rectangle', icon: '▭' },
  { id: 'long', label: 'Long', icon: '↑' },
  { id: 'short', label: 'Short', icon: '↓' },
]

export default function DrawingToolbar({ activeTool, onSelectTool, onClear }) {
  return (
    <div className="drawing-toolbar">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          className={`draw-btn ${activeTool === t.id ? 'active' : ''} ${t.id === 'long' ? 'draw-long' : ''} ${t.id === 'short' ? 'draw-short' : ''}`}
          onClick={() => onSelectTool(t.id)}
          title={t.label}
        >
          <span className="draw-icon">{t.icon}</span>
          {t.label}
        </button>
      ))}
      <button className="draw-btn draw-clear" onClick={onClear} title="Clear all drawings">
        Clear
      </button>
    </div>
  )
}

import { useEffect, useRef } from 'react'

export default function ReplayControls({
  isPlaying, onTogglePlay, onStepBack, onStepForward,
  onReset, speed, onSpeedChange, visibleCount, total,
}) {
  return (
    <div className="replay-bar">
      <button className="btn" onClick={onReset} title="Reset to start">
        ⏮
      </button>
      <button className="btn" onClick={onStepBack} title="Step back one bar">
        ◀
      </button>
      <button className="btn btn-primary" onClick={onTogglePlay} title={isPlaying ? 'Pause' : 'Play'}>
        {isPlaying ? '⏸' : '▶'}
      </button>
      <button className="btn" onClick={onStepForward} title="Step forward one bar">
        ▶|
      </button>

      <div className="replay-speed">
        <label>Speed</label>
        <select value={speed} onChange={(e) => onSpeedChange(Number(e.target.value))}>
          <option value={1000}>0.5x</option>
          <option value={500}>1x</option>
          <option value={250}>2x</option>
          <option value={100}>5x</option>
        </select>
      </div>

      <div className="replay-progress">
        Bar {visibleCount} / {total}
      </div>
    </div>
  )
}

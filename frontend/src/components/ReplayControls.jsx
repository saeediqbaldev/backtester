export default function ReplayControls({
  isPlaying, onTogglePlay, onNextBar, onExit,
  speed, onSpeedChange, visibleCount, total, complete,
}) {
  return (
    <div className="replay-bar">
      <button className="btn btn-primary" onClick={onTogglePlay} disabled={complete} title={isPlaying ? 'Pause' : 'Play'}>
        {isPlaying ? '⏸ Pause' : '▶ Play'}
      </button>
      <button className="btn" onClick={onNextBar} disabled={complete} title="Advance one bar">
        Next bar ▶|
      </button>

      <div className="replay-speed">
        <label>Speed</label>
        <select value={speed} onChange={(e) => onSpeedChange(Number(e.target.value))}>
          <option value={1500}>0.5x</option>
          <option value={800}>1x</option>
          <option value={400}>2x</option>
          <option value={150}>5x</option>
          <option value={50}>10x</option>
        </select>
      </div>

      <div className="replay-progress">
        {complete ? 'Replay complete' : `Bar ${visibleCount} / ${total}`}
      </div>

      <button className="btn btn-exit-replay" onClick={onExit}>Exit replay</button>
    </div>
  )
}

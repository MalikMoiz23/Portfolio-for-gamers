import { PROFILE } from '../content'
import { useStore } from '../store'

/* Shown while the building is being baked. The progress is real — each tick is
 * one procedural material finishing. */
export default function Boot() {
  const progress = useStore((s) => s.progress)
  const label = useStore((s) => s.progressLabel)
  const pct = Math.round(progress * 100)

  return (
    <div className="boot">
      <div className="boot-inner">
        <div className="boot-title">PORTFOLIO</div>
        <div className="boot-name">{PROFILE.name}</div>
        <div className="boot-bar">
          <div className="boot-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="boot-status">
          <span>{label || 'Waking up'}</span>
          <span>{String(pct).padStart(3, '0')}%</span>
        </div>
      </div>
    </div>
  )
}

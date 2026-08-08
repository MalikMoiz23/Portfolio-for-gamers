import { useEffect, useRef } from 'react'
import { ROOMS } from '../content'
import { DOORS, MAX_POS, B } from '../layout'
import { nav, set, state, useStore, leaveRoom } from '../store'
import * as audio from '../audio'

/* The overlay. The depth readout and the progress bar are written straight to
 * the DOM on a rAF loop — routing 60fps values through React state would
 * re-render the whole tree every frame. */
export default function Hud() {
  const phase = useStore((s) => s.phase)
  const hover = useStore((s) => s.hoverRoom)
  const near = useStore((s) => s.nearDoor)
  const running = useStore((s) => s.running)
  const audioOn = useStore((s) => s.audioOn)
  const hintSeen = useStore((s) => s.hintSeen)

  const bar = useRef(null)
  const depth = useRef(null)
  const bay = useRef(null)
  const hint = useRef(null)

  useEffect(() => {
    let id = 0
    const loop = () => {
      const p = Math.max(0, Math.min(1, nav.pos / MAX_POS))
      if (bar.current) bar.current.style.transform = `scaleX(${p.toFixed(4)})`
      if (depth.current) depth.current.textContent = `${Math.max(0, nav.pos - B.entry).toFixed(1)} m`
      if (bay.current) {
        let nearest = -1
        let best = 1e9
        const z = B.entry - nav.pos
        DOORS.forEach((d, i) => {
          const dist = Math.abs(d.z - z)
          if (dist < best) {
            best = dist
            nearest = i
          }
        })
        const inRange = best < B.spacing * 0.6 && nav.pos > B.entry
        bay.current.textContent = inRange ? `${String(nearest + 1).padStart(2, '0')} · ${ROOMS[nearest].title}` : '—'
      }
      if (hint.current) {
        hint.current.style.opacity = nav.pos > 1.2 ? '0' : '1'
        if (nav.pos > 1.2 && !state.hintSeen) set({ hintSeen: true })
      }
      id = requestAnimationFrame(loop)
    }
    loop()
    return () => cancelAnimationFrame(id)
  }, [])

  const walking = phase === 'walk'
  const inside = phase === 'inside'
  const visible = walking || phase === 'entering' || inside || phase === 'leaving'

  const toggleSound = () => set({ audioOn: audio.toggle() })

  // the door you have stopped beside takes priority over one you are pointing at
  const flagged = near >= 0 ? near : hover
  const room = flagged >= 0 ? ROOMS[flagged] : null

  return (
    <div className={`hud ${visible ? '' : 'hud-hidden'}`}>
      <div className="hud-tl">
        <div className="hud-row">
          <span className="hud-key">DEPTH</span>
          <span className="hud-val" ref={depth}>
            0.0 m
          </span>
        </div>
        <div className="hud-row">
          <span className="hud-key">SECTION</span>
          <span className="hud-val" ref={bay}>
            —
          </span>
        </div>
        <div className="hud-row">
          <span className="hud-key">PACE</span>
          <span className={`hud-val ${running ? 'hud-run' : ''}`}>{running ? 'RUNNING' : 'WALKING'}</span>
        </div>
        <div className="hud-track">
          <div className="hud-track-fill" ref={bar} />
        </div>
      </div>

      <div className="hud-tr">
        {inside && (
          <button className="chip chip-back" onClick={leaveRoom}>
            ← LEAVE ROOM <kbd>ESC</kbd>
          </button>
        )}
        <button className="chip" onClick={toggleSound}>
          {audioOn ? 'SOUND ON' : 'SOUND OFF'}
        </button>
        <button className="chip" onClick={() => set({ plain: true })}>
          PLAIN RESUME
        </button>
      </div>

      {walking && (
        <div className={`hint ${hintSeen ? 'hint-dim' : ''}`} ref={hint}>
          <span>SCROLL</span> walk · <span>SHIFT</span> run · <span>A D</span> step aside ·{' '}
          <span>STOP AT A DOOR</span> to open it
        </div>
      )}

      {walking && room && (
        <div className="prompt">
          <div className="prompt-plate" style={{ borderColor: room.accent }}>
            <span className="prompt-name" style={{ color: room.accent }}>
              {room.title}
            </span>
            <span className="prompt-sub">{room.subtitle}</span>
          </div>
          <div className="prompt-cta">{near >= 0 ? 'OPENING — HOLD STILL' : 'CLICK, OR WALK UP TO IT'}</div>
        </div>
      )}

      {inside && <div className="room-hint">Look around · everything is on the walls</div>}

      <div className="reticle" />
    </div>
  )
}

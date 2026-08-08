import { useEffect, useRef } from 'react'
import { ROOMS } from '../content'
import { DOORS, MAX_POS, B } from '../layout'
import { nav, set, state, useStore } from '../store'
import * as audio from '../audio'

/* The overlay while you are walking. The depth readout and the progress bar
 * are driven straight from the DOM on a rAF loop — routing 60fps values
 * through React state would re-render the whole tree every frame. */
export default function Hud() {
  const phase = useStore((s) => s.phase)
  const hover = useStore((s) => s.hoverRoom)
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
      if (depth.current) {
        const metres = Math.max(0, nav.pos - B.entry)
        depth.current.textContent = `${metres.toFixed(1)} m`
      }
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
        bay.current.textContent = inRange
          ? `${String(nearest + 1).padStart(2, '0')} · ${ROOMS[nearest].title}`
          : '—'
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
  const visible = phase === 'walk' || phase === 'entering' || phase === 'inside' || phase === 'leaving'

  const toggleSound = () => {
    const on = audio.toggle()
    set({ audioOn: on })
  }

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
        <div className="hud-track">
          <div className="hud-track-fill" ref={bar} />
        </div>
      </div>

      <div className="hud-tr">
        <button className="chip" onClick={toggleSound} title="Toggle sound">
          {audioOn ? 'SOUND ON' : 'SOUND OFF'}
        </button>
        <button className="chip" onClick={() => set({ plain: true })} title="Plain text version">
          PLAIN RESUME
        </button>
      </div>

      {walking && (
        <div className={`hint ${hintSeen ? 'hint-dim' : ''}`} ref={hint}>
          <span>SCROLL</span> to walk · <span>MOVE MOUSE</span> to look · <span>CLICK A DOOR</span> to enter
        </div>
      )}

      {walking && hover >= 0 && (
        <div className="prompt">
          <div className="prompt-plate" style={{ borderColor: ROOMS[hover].accent }}>
            <span className="prompt-name" style={{ color: ROOMS[hover].accent }}>
              {ROOMS[hover].title}
            </span>
            <span className="prompt-sub">{ROOMS[hover].subtitle}</span>
          </div>
          <div className="prompt-cta">CLICK TO OPEN</div>
        </div>
      )}

      <div className="reticle" />
    </div>
  )
}

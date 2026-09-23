import { useEffect, useRef } from 'react'
import { ROOMS } from '../content'
import { DOORS, MAX_POS, B } from '../layout'
import { nav, set, state, useStore, leaveRoom, standUp } from '../store'
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
  const active = useStore((s) => s.activeRoom)
  const lightsOn = useStore((s) => s.lightsOn)
  const seated = useStore((s) => s.seated)

  /* The ABOUT room's pendant also drives the overlay. A dark HUD over a room
   * that has just gone bright reads as a bug, not as chrome. The class goes on
   * <html> rather than on the HUD element so the plain-resume button and
   * anything else outside this tree flips with it. */
  useEffect(() => {
    document.documentElement.classList.toggle('lights-on', lightsOn)
    return () => document.documentElement.classList.remove('lights-on')
  }, [lightsOn])

  const bar = useRef(null)
  const depth = useRef(null)
  const bay = useRef(null)
  const hint = useRef(null)
  const rail = useRef(null)
  // last colour written to :root, so we only touch the DOM when it changes
  const accent = useRef('')

  useEffect(() => {
    let id = 0
    const loop = () => {
      const p = Math.max(0, Math.min(1, nav.pos / MAX_POS))
      if (bar.current) bar.current.style.transform = `scaleX(${p.toFixed(4)})`
      if (depth.current) depth.current.textContent = `${Math.max(0, nav.pos - B.entry).toFixed(1)} m`

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

      if (bay.current) {
        bay.current.textContent = inRange ? `${String(nearest + 1).padStart(2, '0')} · ${ROOMS[nearest].title}` : '—'
      }

      /* The whole interface borrows the colour of whichever room has your
       * attention: the one you are in, then the one you have stopped at, then
       * the one you are pointing at, then simply the nearest. Written straight
       * to :root rather than through React — this can change every frame. */
      const focus =
        state.activeRoom >= 0
          ? state.activeRoom
          : state.nearDoor >= 0
            ? state.nearDoor
            : state.hoverRoom >= 0
              ? state.hoverRoom
              : inRange
                ? nearest
                : -1
      const want = focus >= 0 ? ROOMS[focus].accent : '#00e5ff'
      if (want !== accent.current) {
        accent.current = want
        document.documentElement.style.setProperty('--accent', want)
        if (rail.current) {
          for (let i = 0; i < rail.current.children.length; i++) {
            rail.current.children[i].classList.toggle('rail-on', i === focus)
          }
        }
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

        {/* one pip per room, each in its own colour — the only place you can
            see the whole building at once */}
        <div className="hud-rail" ref={rail}>
          {ROOMS.map((r) => (
            <span key={r.id} className="rail-pip" style={{ '--pip': r.accent }} title={r.title} />
          ))}
        </div>
      </div>

      <div className="hud-tr">
        {/* Seated, ESC gets you out of the chair, not out of the room — so the
            chip has to say that, or the shortcut and the button disagree. */}
        {inside && seated && (
          <button className="chip chip-back" onClick={standUp}>
            ↑ STAND UP <kbd>ESC</kbd>
          </button>
        )}
        {inside && !seated && (
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
          <span>SCROLL</span> walk · <span>SHIFT</span> run · <span>CLICK A DOOR</span> to go in ·{' '}
          <span>CLICK A CEILING LIGHT</span> for {lightsOn ? 'lights out' : 'lights on'}
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
          <div className="prompt-cta">CLICK THE DOOR TO OPEN</div>
        </div>
      )}

      {inside && active >= 0 && ROOMS[active].id === 'about' && (
        <div className="room-hint">
          <span>MOVE THE MOUSE</span> to look around · <span>CLICK THE BULB</span> for{' '}
          {lightsOn ? 'lights out' : 'lights on'} · <span>‹ ›</span> to turn the board
        </div>
      )}

      {inside && active >= 0 && ROOMS[active].id === 'projects' && (
        <div className="room-hint">
          {seated ? (
            <>
              <span>CLICK A PROJECT</span> on screen to open it · <span>ESC</span> to stand up
            </>
          ) : (
            <>
              <span>CLICK THE CHAIR</span> to sit at the desk · <span>CLICK THE BULB</span> for lights
            </>
          )}
        </div>
      )}

      {inside && !(active >= 0 && ['about', 'projects'].includes(ROOMS[active].id)) && (
        <div className="room-hint">
          <span>MOVE THE MOUSE</span> to look around the room · <span>ESC</span> to leave
        </div>
      )}

      <div className="reticle" />
    </div>
  )
}

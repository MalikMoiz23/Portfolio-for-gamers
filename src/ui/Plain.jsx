import { PROFILE, ROOMS } from '../content'
import { set } from '../store'
import Blocks from './Blocks'

/* The escape hatch. Same content, no WebGL, no scrolling corridor, no sound —
 * a plain document for anyone on a weak machine, on a phone in a hurry, using a
 * screen reader, or who simply wants the facts. */
export default function Plain({ webglMissing = false }) {
  return (
    <div className="plain">
      <div className="plain-wrap">
        <header className="plain-head">
          <div>
            <h1>{PROFILE.name}</h1>
            <p className="plain-role">
              {PROFILE.role} · {PROFILE.location}
            </p>
            <p className="plain-mail">
              <a href={`mailto:${PROFILE.email}`}>{PROFILE.email}</a>
            </p>
          </div>
          {!webglMissing && (
            <button className="btn" onClick={() => set({ plain: false })}>
              ← Back to the corridor
            </button>
          )}
        </header>

        {webglMissing && (
          <p className="plain-note">
            This browser has no WebGL 2, so the 3D corridor cannot run here. Everything it
            contains is below.
          </p>
        )}

        {ROOMS.map((room) => (
          <section className="plain-section" key={room.id} style={{ '--accent': room.accent }}>
            <h2>{room.title}</h2>
            <p className="plain-sub">{room.subtitle}</p>
            <Blocks blocks={room.blocks} accent={room.accent} />
          </section>
        ))}

        {!webglMissing && (
          <footer className="plain-foot">
            <button className="btn" onClick={() => set({ plain: false })}>
              Enter the 3D portfolio
            </button>
          </footer>
        )}
      </div>
    </div>
  )
}

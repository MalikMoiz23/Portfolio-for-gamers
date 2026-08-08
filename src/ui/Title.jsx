import { PROFILE } from '../content'
import { set, useStore } from '../store'
import * as audio from '../audio'

/* The card over the lit doorway. Also the click that lets WebAudio start. */
export default function Title() {
  const phase = useStore((s) => s.phase)
  const showing = phase === 'ready'

  const enter = (withSound) => {
    if (withSound) {
      audio.start()
      set({ audioOn: true })
    }
    set({ phase: 'walk' })
  }

  return (
    <div className={`title ${showing ? '' : 'title-gone'}`} aria-hidden={!showing}>
      <div className="title-vignette" />
      {/* The word PORTFOLIO is the lit board over the door in the 3D scene, not
       * DOM text — putting it here as well just gave two of them. */}
      <div className="title-inner">
        <h1 className="title-name">{PROFILE.name}</h1>
        <div className="title-rule" />
        <p className="title-role">{PROFILE.role}</p>
        <p className="title-tag">{PROFILE.tagline}</p>

        <div className="title-actions">
          <button className="btn btn-primary" onClick={() => enter(true)} disabled={!showing}>
            Enter with sound
          </button>
          <button className="btn" onClick={() => enter(false)} disabled={!showing}>
            Enter silent
          </button>
        </div>
        <button className="btn btn-ghost" onClick={() => set({ plain: true })} disabled={!showing}>
          Skip the walk — plain resume
        </button>
      </div>
    </div>
  )
}

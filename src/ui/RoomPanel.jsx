import { useEffect, useRef } from 'react'
import { ROOMS } from '../content'
import { leaveRoom, useStore } from '../store'
import Blocks from './Blocks'

/* The readable half of a room. In-world signage sets the mood; text this small
 * has to be real DOM or nobody can read it — and nobody could select, zoom or
 * screen-read it either. */
export default function RoomPanel() {
  const phase = useStore((s) => s.phase)
  const index = useStore((s) => s.activeRoom)
  const panel = useRef(null)

  const open = phase === 'inside'
  const room = index >= 0 ? ROOMS[index] : null

  useEffect(() => {
    if (open && panel.current) panel.current.scrollTop = 0
  }, [open, index])

  if (!room) return null

  return (
    <div className={`panel ${open ? 'panel-open' : ''}`} aria-hidden={!open}>
      <div className="panel-frame" style={{ '--accent': room.accent }}>
        <header className="panel-head">
          <div>
            <div className="panel-eyebrow">
              ROOM {String(index + 1).padStart(2, '0')} / {String(ROOMS.length).padStart(2, '0')}
            </div>
            <h2 className="panel-title">{room.title}</h2>
            <div className="panel-sub">{room.subtitle}</div>
          </div>
          <button className="btn btn-back" onClick={leaveRoom}>
            ← BACK <kbd>ESC</kbd>
          </button>
        </header>
        <div className="panel-body" ref={panel}>
          <Blocks blocks={room.blocks} accent={room.accent} />
        </div>
      </div>
    </div>
  )
}

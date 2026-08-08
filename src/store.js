import { useSyncExternalStore } from 'react'

/* Reactive state — only things that should re-render React live here.
 * Anything that changes every frame lives in `nav` below (plain mutable
 * object, read inside useFrame) so we never re-render at 60fps. */

const listeners = new Set()

export const state = {
  phase: 'boot', // boot -> ready -> walk -> entering -> inside -> leaving
  progress: 0, // 0..1 while procedural textures bake
  progressLabel: '',
  activeRoom: -1, // index into ROOMS, -1 when in the corridor
  audioOn: false,
  plain: false, // plain-text resume fallback is showing
  hoverRoom: -1, // door the cursor is over
  lowSpec: false, // dropped by the perf monitor on weak GPUs
  hintSeen: false,
}

export function set(patch) {
  let changed = false
  for (const k in patch) {
    if (state[k] !== patch[k]) {
      state[k] = patch[k]
      changed = true
    }
  }
  if (changed) for (const l of listeners) l()
}

function subscribe(l) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useStore(selector) {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  )
}

/* Start backing out of whichever room you are standing in. */
export function leaveRoom() {
  if (state.phase === 'inside') set({ phase: 'leaving' })
}

/* Per-frame values. Never put these in React state. */
export const nav = {
  target: 0, // where the scroll wants the camera (metres down the corridor)
  pos: 0, // where the camera actually is, damped toward target
  speed: 0, // d(pos)/dt, drives head-bob amplitude and footstep cadence
  walked: 0, // total distance walked, drives the bob phase
  roomT: 0, // 0 outside the room, 1 fully inside
  lookX: 0, // mouse-driven head turn, radians
  lookY: 0,
  bob: 0,
  flicker: 1,
}

/* Dev handle. Lets you drive the walk from the console — e.g.
 *   __portfolio.nav.target = 20
 *   __portfolio.set({ phase: 'entering', activeRoom: 2 })
 * Stripped from production builds. */
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__portfolio = { state, set, nav }
}

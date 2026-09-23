import * as THREE from 'three'

/* ============================================================================
 * THE SHARED DOOR GLOW
 * ----------------------------------------------------------------------------
 * Every door spills a little of its room's colour into the corridor. That used
 * to be one point light per door — five of them, permanently, for an effect you
 * can only ever be standing next to one of. Three.js shades every fragment
 * against every light in the scene whether or not it is in range, so the four
 * doors behind you cost four full passes each frame for nothing.
 *
 * Each Door now writes what it wants into this table every frame, and Corridor
 * runs ONE light that goes to whichever door is asking loudest. Five lights
 * become one, and the effect is identical because you were only ever seeing one.
 * ========================================================================== */

/* index -> { want, x, z, color }. Written by Door, read by Corridor. A plain
 * array, not state: it changes every frame and must never re-render anything. */
export const glowWant = []

/* The flood the open door throws back into the corridor. This used to be
 * mounted only for the active door, which quietly made the scene's light count
 * differ between "in a room" and "warming up a room" — so every program the
 * warmup compiled was for a configuration that never occurred, and the freeze
 * it was meant to remove happened anyway. One light, always present, is the
 * only way the count stays predictable. */
export const floodWant = { want: 0, x: 0, z: 0, tx: 0, color: '#ffffff' }

const tmp = new THREE.Color()

/* Whichever door wants the light most. Returns null while nothing does. */
export function brightest() {
  let best = null
  for (let i = 0; i < glowWant.length; i++) {
    const g = glowWant[i]
    if (g && (!best || g.want > best.want)) best = g
  }
  return best
}

export { tmp as glowScratch }

import { ROOMS } from './content'

/* Every dimension in the building, in metres. Change SPACING and the whole
 * corridor stretches; change ROOMS in content.js and doors appear or vanish. */
export const B = {
  width: 3.4, // corridor width
  height: 3.3, // floor to ceiling
  eye: 1.66, // camera height
  entry: 7.0, // how far outside the entrance you start
  spacing: 8.6, // distance between doors
  tail: 7.5, // corridor continues past the final door
  doorW: 1.18,
  doorH: 2.16,
  recess: 0.34, // how deep each doorway is set into the wall
  roomW: 7.4, // room extent along the corridor axis (z)
  roomD: 6.6, // how far the room reaches away from the corridor (x)
  roomH: 3.3,
}

/* Doors alternate left / right down the hall, in the order you listed them. */
export const DOORS = ROOMS.map((room, i) => ({
  room,
  index: i,
  side: i % 2 === 0 ? -1 : 1, // -1 = left wall, +1 = right wall
  z: -(B.spacing * (i + 1)),
  x: (i % 2 === 0 ? -1 : 1) * (B.width / 2),
}))

/* The facade sits at z = 0; the corridor runs from there to z = -END. */
export const END = B.spacing * ROOMS.length + B.tail
export const MOUTH = 0

/* Scroll axis: pos 0 is outside the entrance, pos MAX is at the dead end. */
export const MAX_POS = B.entry + END - 2.2
export const cameraZ = (pos) => B.entry - pos

/* The entrance door swings open across this stretch of the scroll. */
export const OPEN_FROM = 1.6
export const OPEN_TO = 5.4

/* Where the camera ends up once you sit down at the desk in PROJECTS, in room
 * local space: `x` is metres from the doorway wall, `eye` is seated eye height.
 * Close enough to actually read the screen. The monitor is at 6.28m, so this
 * puts the eye 0.88m from it — normal desk distance, and the point at which a
 * 1.3m panel fills roughly three quarters of the view. At the earlier 4.98m the
 * text was technically on screen and practically unreadable.
 *
 * The yaw does not change: you are already facing the far wall, which is where
 * the desk is. */
export const SEAT = { x: 5.4, eye: 1.26 }

/* How far into a room entering stops you, as a fraction of the room's depth.
 *
 * PROJECTS needs its own: its desk is against the FAR wall, so stopping at the
 * usual 0.66 puts the camera 0.6m from the chair and half a metre above it —
 * the chair projects below the bottom of the screen and you cannot see, let
 * alone click, the thing the room is asking you to sit on. At 0.42 the whole
 * desk is in front of you and sitting down is a real 2.2m move.
 */
const STAND_DEPTH = { projects: 0.42 }
const STAND_DEFAULT = 0.66
export const standDepth = (room) => STAND_DEPTH[room?.id] ?? STAND_DEFAULT

/* Ceiling fittings down the hall.
 *
 * `lit` is the important field. Every fitting is drawn, but only every other
 * one carries a real light: three.js evaluates every light in the scene for
 * every fragment it shades, so eight point lights down a corridor cost eight
 * full passes whether or not you can see the far ones. Four brighter lights
 * behind eight glowing diffusers look the same and cost half. */
export const TUBES = []
{
  let i = 0
  for (let z = -3.2; z > -END; z -= B.spacing * 0.72) {
    TUBES.push({ z, seed: Math.round(-z * 137), lit: i % 2 === 0 })
    i++
  }
}

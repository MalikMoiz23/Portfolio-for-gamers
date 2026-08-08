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

/* Ceiling tubes: one every other door bay, offset so you always have a dark
 * stretch between pools of light. */
export const TUBES = []
for (let z = -3.2; z > -END; z -= B.spacing * 0.72) {
  TUBES.push({ z, seed: Math.round(-z * 137) })
}

import * as THREE from 'three'

/* ============================================================================
 * NIGHT / DAY TINTING
 * ----------------------------------------------------------------------------
 * The lobby and the ABOUT room are both built from the same mid-grey plaster,
 * carpet and wood maps, and both cross-fade between a night tint and a day one
 * when the lights go on. This is the single table they share — change a colour
 * here and the whole building changes with it.
 *
 * The maps are baked near mid-grey on purpose: `color` multiplies the map, so a
 * map that is already dark cannot be driven light and one that is already light
 * has no night to go back to.
 * ========================================================================== */

export const TONE = {
  /* The night tint is a lift on what a dark wall "should" be. These surfaces are
   * lit almost entirely by low standby fittings and neon at night, and a
   * realistic night value on top of that put the new plaster and wainscot below
   * the point where you could see they existed at all. */
  wall: ['#38415a', '#ded8cc'],
  ceiling: ['#20252f', '#f0ece2'],
  carpet: ['#222a35', '#8e9aa6'],
  /* The wood's day tint has to be pushed well past what looks right as a swatch.
   * `color` multiplies a map whose albedo already sits near 0.46, so a realistic
   * oak here comes out as near-black panelling under a lit ceiling. */
  wood: ['#2b2620', '#9c7b52'],
  trim: ['#161a22', '#3a3f48'],
  /* The entrance. Night is a cold stone lit only by its own sconces; day is a
   * warm limestone. Both stay darker than the interior plaster — it is outside,
   * and the ceiling lights do not reach it. */
  stone: ['#2f3646', '#b9b2a4'],
  paving: ['#232833', '#8c8779'],
}

const a = new THREE.Color()
const b = new THREE.Color()

/* Lerp a material's tint between its night and day colour. `t` is 0..1. */
export function tone(mat, pair, t) {
  a.set(pair[0])
  b.set(pair[1])
  mat.color.copy(a).lerp(b, t)
}

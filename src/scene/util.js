import * as THREE from 'three'

/* Deterministic RNG so the debris, the rust and the flicker pattern are the
 * same building every time anyone loads the page. */
export function rng(seed) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const lerp = (a, b, t) => a + (b - a) * t
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
export const clamp01 = (v) => clamp(v, 0, 1)
export const smootherstep = (t) => t * t * t * (t * (t * 6 - 15) + 10)
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

/* Frame-rate independent damping. Standard exponential approach — `rate` is
 * roughly "how many e-folds per second". */
export const damp = (current, target, rate, dt) =>
  current + (target - current) * (1 - Math.exp(-rate * dt))

/* A plane whose UVs are scaled to world size, so one material tiles at a
 * constant density no matter how big the piece of wall is. */
export function planeUV(w, h, density) {
  const g = new THREE.PlaneGeometry(w, h)
  const uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * w * density, uv.getY(i) * h * density)
  }
  uv.needsUpdate = true
  return g
}

/* Same idea for boxes, but each of the six faces gets the UV scale that
 * matches its own dimensions instead of one wrong scale for all of them. */
export function boxUV(w, h, d, density) {
  const g = new THREE.BoxGeometry(w, h, d)
  const uv = g.attributes.uv
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z — four vertices each
  const faces = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ]
  for (let f = 0; f < 6; f++) {
    const [fw, fh] = faces[f]
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v
      uv.setXY(i, uv.getX(i) * fw * density, uv.getY(i) * fh * density)
    }
  }
  uv.needsUpdate = true
  return g
}

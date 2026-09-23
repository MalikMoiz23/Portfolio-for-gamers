/* ============================================================================
 * CANVAS HELPERS
 * ----------------------------------------------------------------------------
 * Two things every procedural canvas in this project needs, and both of them
 * were being done the slow way.
 * ========================================================================== */

/* ---- grain ---------------------------------------------------------------
 * Every painted surface here wants a speckle so a flat fill does not read as a
 * flat fill. That was thousands of 1px fillRect calls per canvas — 9000 for the
 * rug alone, 5200 + 2600 per board sheet — and each one is a separate path
 * setup in the 2D context. Room entry spent most of its time here.
 *
 * One 64x64 noise tile, built once, repeated as a pattern: a single fill draws
 * the same thing. The tile is shared by every canvas in the app.
 * ------------------------------------------------------------------------ */

let lightTile = null
let darkTile = null

function makeTile(dark) {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(64, 64)
  const d = img.data
  // a fixed seed: the grain must be identical on every machine and reload
  let s = dark ? 0x9e3779b9 : 0x6d2b79f5
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  for (let i = 0; i < 64 * 64; i++) {
    const v = rnd()
    const j = i * 4
    if (dark) {
      d[j] = d[j + 1] = d[j + 2] = 0
      d[j + 3] = v > 0.72 ? Math.round((v - 0.72) * 3.5 * 255) : 0
    } else {
      d[j] = d[j + 1] = d[j + 2] = 255
      d[j + 3] = v > 0.78 ? Math.round((v - 0.78) * 2.4 * 255) : 0
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/* Speckle a region. `alpha` scales the whole tile, so callers keep the control
 * they had over how dirty a surface looks. */
export function grain(ctx, w, h, alpha = 0.06, dark = false) {
  if (dark) {
    if (!darkTile) darkTile = makeTile(true)
  } else if (!lightTile) {
    lightTile = makeTile(false)
  }
  const tile = dark ? darkTile : lightTile
  const pat = ctx.createPattern(tile, 'repeat')
  if (!pat) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = pat
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

/* ---- cache ---------------------------------------------------------------
 * Rooms mount and unmount every time you walk in and out of one, and each mount
 * was rebuilding every canvas it owns from scratch — board pages, screens,
 * artwork, rugs, keycaps. That is megabytes of synchronous 2D drawing on the
 * frame the door opens, which is exactly where the freeze was.
 *
 * Built once, kept for the life of the page. There are five rooms; the ceiling
 * on this is small and fixed, and nothing here is ever disposed because the
 * next visit wants it back.
 * ------------------------------------------------------------------------ */

const store = new Map()

export function cached(key, make) {
  let v = store.get(key)
  if (v === undefined) {
    v = make()
    store.set(key, v)
  }
  return v
}

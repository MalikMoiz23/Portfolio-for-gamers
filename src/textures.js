import * as THREE from 'three'
import { grain } from './canvasfx'

/* ============================================================================
 * PROCEDURAL MATERIALS
 * ----------------------------------------------------------------------------
 * Nothing here is downloaded. Every surface in the building is baked at load
 * time from seeded value-noise into canvases, then handed to three.js as
 * albedo / normal / roughness maps. Seeded means the building looks identical
 * on every machine and every reload.
 * ========================================================================== */

/* ---- noise -------------------------------------------------------------- */

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function grid(n, seed) {
  const r = mulberry32(seed)
  const g = new Float32Array(n * n)
  for (let i = 0; i < g.length; i++) g[i] = r()
  return g
}

/* Bilinear sample with smoothstep interpolation. Wraps, so every layer tiles. */
function sample(g, n, x, y) {
  const fx = x * n
  const fy = y * n
  let x0 = Math.floor(fx)
  let y0 = Math.floor(fy)
  const tx = fx - x0
  const ty = fy - y0
  const sx = tx * tx * (3 - 2 * tx)
  const sy = ty * ty * (3 - 2 * ty)
  x0 = ((x0 % n) + n) % n
  y0 = ((y0 % n) + n) % n
  const x1 = (x0 + 1) % n
  const y1 = (y0 + 1) % n
  const a = g[y0 * n + x0]
  const b = g[y0 * n + x1]
  const c = g[y1 * n + x0]
  const d = g[y1 * n + x1]
  const top = a + (b - a) * sx
  return top + (c + (d - c) * sx - top) * sy
}

/* Fractal brownian motion. Every octave wraps at uv period 1, so the whole
 * stack is seamlessly tileable. */
function fbm(seed, octaves = 5, base = 4, gain = 0.5) {
  const layers = []
  let n = base
  for (let i = 0; i < octaves; i++) {
    const size = Math.max(2, Math.round(n))
    layers.push({ g: grid(size, seed + i * 9176), n: size })
    n *= 2
  }
  return (x, y) => {
    let amp = 1
    let sum = 0
    let norm = 0
    for (const l of layers) {
      sum += amp * sample(l.g, l.n, x, y)
      norm += amp
      amp *= gain
    }
    return sum / norm
  }
}

/* Ridged noise — the |1-2n| trick. Good for cracks and scratches. */
const ridge = (v) => 1 - Math.abs(v * 2 - 1)

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const mix = (a, b, t) => a + (b - a) * t
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

/* ---- canvas plumbing ---------------------------------------------------- */

function canvas(size) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return c
}

/* Runs `fn` once per texel. fn returns { r,g,b } in 0..1, plus height and
 * roughness. Produces an albedo canvas, a roughness canvas and a height field
 * we turn into a normal map. */
function bake(size, fn) {
  const albedo = canvas(size)
  const rough = canvas(size)
  const actx = albedo.getContext('2d')
  const rctx = rough.getContext('2d')
  const aimg = actx.createImageData(size, size)
  const rimg = rctx.createImageData(size, size)
  const ad = aimg.data
  const rd = rimg.data
  const height = new Float32Array(size * size)
  const inv = 1 / size

  const out = { r: 0, g: 0, b: 0, h: 0.5, rough: 0.8, metal: 0 }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      out.r = out.g = out.b = 0
      out.h = 0.5
      out.rough = 0.8
      out.metal = 0
      fn(x * inv, y * inv, out)
      const i = y * size + x
      const j = i * 4
      ad[j] = clamp01(out.r) * 255
      ad[j + 1] = clamp01(out.g) * 255
      ad[j + 2] = clamp01(out.b) * 255
      ad[j + 3] = 255
      // three reads roughness from G and metalness from B of one map
      rd[j] = 0
      rd[j + 1] = clamp01(out.rough) * 255
      rd[j + 2] = clamp01(out.metal) * 255
      rd[j + 3] = 255
      height[i] = out.h
    }
  }
  actx.putImageData(aimg, 0, 0)
  rctx.putImageData(rimg, 0, 0)
  return { albedo, rough, height, size }
}

function normalMap(height, size, strength) {
  const c = canvas(size)
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size)
  const d = img.data
  const at = (x, y) =>
    height[(((y % size) + size) % size) * size + (((x % size) + size) % size)]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength
      let nx = -dx
      let ny = -dy
      let nz = 1
      const l = Math.hypot(nx, ny, nz)
      nx /= l
      ny /= l
      nz /= l
      const j = (y * size + x) * 4
      d[j] = (nx * 0.5 + 0.5) * 255
      d[j + 1] = (ny * 0.5 + 0.5) * 255
      d[j + 2] = (nz * 0.5 + 0.5) * 255
      d[j + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

function tex(cv, { srgb = false, repeat = [1, 1] } = {}) {
  const t = new THREE.CanvasTexture(cv)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat[0], repeat[1])
  t.anisotropy = 8
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.needsUpdate = true
  return t
}

/* Bundles a bake into the three maps a MeshStandardMaterial wants. */
function pack(baked, { normalStrength = 6, repeat = [1, 1] } = {}) {
  return {
    map: tex(baked.albedo, { srgb: true, repeat }),
    normalMap: tex(normalMap(baked.height, baked.size, normalStrength), { repeat }),
    roughnessMap: tex(baked.rough, { repeat }),
    metalnessMap: tex(baked.rough, { repeat }),
  }
}

/* ---- surface recipes ---------------------------------------------------- */

/* Institutional painted concrete: sickly green-grey paint over grey concrete,
 * peeling in patches, with vertical grime running down from the ceiling. */
function wallSurface(size) {
  const blotch = fbm(101, 5, 3)
  const fine = fbm(202, 4, 24)
  const peel = fbm(303, 4, 5)
  const streakN = fbm(606, 4, 6)
  const speck = fbm(707, 2, 64)
  /* Cracks are the level set where a noise field crosses its own mean, so the
   * band you get from pow(ridge(n), k) is only as thin as that field's gradient
   * is steep. A smooth low-frequency field produces fat organic veins, not
   * hairlines — hence the high base frequency and the very high exponent. A
   * separate coarse mask keeps them from covering the whole wall. */
  const crackN = fbm(404, 2, 20)
  const crackMask = fbm(505, 3, 3)

  return bake(size, (u, v, o) => {
    const b = blotch(u, v)
    const f = fine(u, v)

    // paint colour, unevenly faded
    let r = mix(0.2, 0.3, b) + f * 0.04
    let g = mix(0.21, 0.31, b) + f * 0.04
    let bl = mix(0.185, 0.265, b) + f * 0.035

    let h = 0.5 + (f - 0.5) * 0.1 + (b - 0.5) * 0.04
    let rough = 0.78 + f * 0.16

    // grime running down the wall — noise stretched hard along v
    const streak = streakN(u * 3, v * 0.25)
    const grime = smoothstep(0.55, 0.9, streak) * smoothstep(0.0, 0.55, v)
    r *= 1 - grime * 0.42
    g *= 1 - grime * 0.4
    bl *= 1 - grime * 0.35
    rough += grime * 0.1

    /* Paint has let go in patches, exposing the substrate. Two things matter
     * here: the exposed concrete must be DARKER than the paint over it, and the
     * edge has to be tight. Lighter patches with a soft gradient do not read as
     * missing paint — they read as white mould blooming on the wall. */
    const p = peel(u, v)
    const bare = smoothstep(0.6, 0.632, p)
    if (bare > 0) {
      const cr = 0.205 + f * 0.05
      r = mix(r, cr, bare)
      g = mix(g, cr * 0.98, bare)
      bl = mix(bl, cr * 0.93, bare)
      h -= bare * 0.06
      rough = mix(rough, 0.93, bare)
    }
    // a lip of lifted paint around the edge of each patch
    const lip = smoothstep(0.588, 0.6, p) * (1 - smoothstep(0.6, 0.612, p))
    h += lip * 0.09
    r += lip * 0.03
    g += lip * 0.03
    bl += lip * 0.028

    // hairline cracks, only where the mask allows them
    const mask = smoothstep(0.52, 0.72, crackMask(u, v))
    const crack = Math.pow(clamp01(ridge(crackN(u, v))), 150) * mask
    r *= 1 - crack * 0.55
    g *= 1 - crack * 0.55
    bl *= 1 - crack * 0.52
    h -= crack * 0.1

    // dark pinprick speckle, keeps the surface from reading as plastic
    const sp = smoothstep(0.72, 0.95, speck(u, v))
    r *= 1 - sp * 0.26
    g *= 1 - sp * 0.26
    bl *= 1 - sp * 0.26

    o.r = r
    o.g = g
    o.b = bl
    o.h = h
    o.rough = clamp01(rough)
    o.metal = 0
  })
}

/* Poured concrete floor: expansion joints on a grid, damp patches that go
 * glossy, scuff marks along the walking line. */
function floorSurface(size) {
  const blotch = fbm(811, 5, 3)
  const fine = fbm(822, 4, 30)
  // base 5 rather than 2: at base 2 the lowest octave has four cells in the
  // whole texture, so one damp patch fills a tile and repeats visibly
  const damp = fbm(833, 4, 5)
  const grit = fbm(844, 2, 80)
  const scuff = fbm(855, 4, 9)

  return bake(size, (u, v, o) => {
    const b = blotch(u, v)
    const f = fine(u, v)

    let base = mix(0.15, 0.225, b) + (f - 0.5) * 0.05
    let r = base * 1.02
    let g = base
    let bl = base * 0.96
    let h = 0.55 + (f - 0.5) * 0.1
    let rough = 0.82 + f * 0.12

    // expansion joints — two grooves per tile in each axis
    const gx = Math.min(u % 0.5, 0.5 - (u % 0.5)) * 2
    const gy = Math.min(v % 0.5, 0.5 - (v % 0.5)) * 2
    const joint = Math.max(1 - smoothstep(0, 0.012, gx), 1 - smoothstep(0, 0.012, gy))
    r *= 1 - joint * 0.65
    g *= 1 - joint * 0.65
    bl *= 1 - joint * 0.6
    h -= joint * 0.4
    rough = mix(rough, 0.95, joint)

    // standing damp — darker and much smoother, so the flashlight glares off it
    const d = smoothstep(0.58, 0.76, damp(u, v)) * (1 - joint)
    r = mix(r, r * 0.6, d)
    g = mix(g, g * 0.62, d)
    bl = mix(bl, bl * 0.7, d)
    rough = mix(rough, 0.14, d)

    // dragged scuffs
    const sc = smoothstep(0.6, 0.85, scuff(u * 4, v * 1))
    r = mix(r, r * 1.35, sc * 0.4)
    g = mix(g, g * 1.32, sc * 0.4)
    bl = mix(bl, bl * 1.28, sc * 0.4)

    // grit
    const gr = grit(u, v)
    h += (gr - 0.5) * 0.14
    rough += (gr - 0.5) * 0.08

    o.r = r
    o.g = g
    o.b = bl
    o.h = h
    o.rough = clamp01(rough)
    o.metal = 0
  })
}

/* Suspended ceiling tiles with a metal T-bar grid and old water damage. */
function ceilingSurface(size) {
  const fibre = fbm(911, 4, 40)
  const stain = fbm(922, 4, 5)
  const sag = fbm(933, 3, 5)

  return bake(size, (u, v, o) => {
    const f = fibre(u, v)
    let base = 0.15 + f * 0.07

    // T-bar grid, one tile per half-unit
    const gx = Math.min(u % 0.5, 0.5 - (u % 0.5)) * 2
    const gy = Math.min(v % 0.5, 0.5 - (v % 0.5)) * 2
    const bar = Math.max(1 - smoothstep(0, 0.022, gx), 1 - smoothstep(0, 0.022, gy))

    let r = base
    let g = base
    let bl = base * 0.97
    let h = 0.5 + (f - 0.5) * 0.22 + (sag(u, v) - 0.5) * 0.1
    let rough = 0.94
    let metal = 0

    // old water staining — a dirty tea colour, not the orange that reads as rust
    const st = smoothstep(0.5, 0.74, stain(u, v))
    r = mix(r, 0.165, st)
    g = mix(g, 0.142, st)
    bl = mix(bl, 0.113, st)

    if (bar > 0.5) {
      r = mix(r, 0.13, bar)
      g = mix(g, 0.135, bar)
      bl = mix(bl, 0.14, bar)
      h = mix(h, 0.74, bar)
      rough = mix(rough, 0.55, bar)
      metal = mix(metal, 0.85, bar)
    }

    o.r = r
    o.g = g
    o.b = bl
    o.h = h
    o.rough = rough
    o.metal = metal
  })
}

/* Painted steel with rust blooming through, for doors and frames. */
function steelSurface(size) {
  const brush = fbm(1211, 4, 12)
  const rust = fbm(1222, 4, 4)
  const pit = fbm(1233, 3, 50)
  const dent = fbm(1244, 3, 6)
  const grime = fbm(1255, 4, 7)

  return bake(size, (u, v, o) => {
    /* Brushed grain runs horizontally. Kept low-contrast on purpose: at any
     * higher amplitude the regular banding stops reading as machined metal and
     * starts reading as corrugated plastic. */
    const br = brush(u * 1, v * 7)
    const gm = grime(u, v)
    let base = 0.15 + br * 0.032 + (gm - 0.5) * 0.06
    let r = base
    let g = base * 1.02
    let bl = base * 1.07
    let h = 0.55 + (br - 0.5) * 0.03 + (dent(u, v) - 0.5) * 0.16
    let rough = 0.58 + br * 0.13 + (1 - gm) * 0.16
    /* Fire doors are painted, and paint is a dielectric. At the metalness a
     * bare-steel value implies, a torch beam turns the whole leaf into a white
     * mirror slab instead of a door. */
    let metal = 0.32

    // rust sits in fewer, smaller blooms than paint failure does, and it is a
    // dirty brown rather than the orange that reads as blood spatter
    const rs = smoothstep(0.56, 0.74, rust(u, v))
    if (rs > 0) {
      const p = pit(u, v)
      r = mix(r, 0.23 + p * 0.1, rs)
      g = mix(g, 0.135 + p * 0.06, rs)
      bl = mix(bl, 0.082 + p * 0.03, rs)
      rough = mix(rough, 0.95, rs)
      metal = mix(metal, 0.06, rs)
      h -= rs * 0.07 * p
    }

    o.r = r
    o.g = g
    o.b = bl
    o.h = h
    o.rough = clamp01(rough)
    o.metal = metal
  })
}

/* ---- the finished room -------------------------------------------------- *
 * The three below are the opposite of everything above them: no rot, no peel,
 * no grime. They dress the ABOUT room, which is meant to read as somewhere
 * somebody actually lives, in the middle of a building that does not.
 *
 * Their albedo sits near mid-grey on purpose. The room tints them at runtime by
 * setting `color` on the material — dark slate with the bulb off, warm off-
 * white with it on — and a map that is already dark or already light cannot be
 * driven both ways. Mid-grey in, any tint out.
 * ------------------------------------------------------------------------- */

/* Painted plaster: the stipple a roller leaves, and nothing else. */
function plasterSurface(size) {
  const broad = fbm(1201, 4, 3)
  const roller = fbm(1202, 4, 34)
  const peel = fbm(1203, 3, 96) // orange peel, the fine stipple
  const trowel = fbm(1204, 3, 7)

  return bake(size, (u, v, o) => {
    const b = broad(u, v)
    const rl = roller(u, v)
    const op = peel(u, v)

    const base = 0.56 + (b - 0.5) * 0.045 + (rl - 0.5) * 0.028
    o.r = base * 1.006
    o.g = base
    o.b = base * 0.984
    o.h = 0.5 + (op - 0.5) * 0.5 + (rl - 0.5) * 0.14 + (trowel(u, v) - 0.5) * 0.08
    o.rough = clamp01(0.87 + (op - 0.5) * 0.07)
    o.metal = 0
  })
}

/* Low loop-pile carpet. The rows have to be an integer number of cycles across
 * the tile or the seam shows as a phase jump in the pile. */
function carpetSurface(size) {
  const pile = fbm(1301, 3, 104)
  const tuft = fbm(1302, 4, 26)
  const shade = fbm(1303, 4, 4)
  const ROWS = 64

  return bake(size, (u, v, o) => {
    const p = pile(u, v)
    const t = tuft(u, v)
    const s = shade(u, v)
    const row = 0.5 + 0.5 * Math.sin(v * Math.PI * 2 * ROWS + (t - 0.5) * 2.2)

    const base = 0.44 + (s - 0.5) * 0.095 + (t - 0.5) * 0.085 + (p - 0.5) * 0.11
    o.r = base * 1.03
    o.g = base
    o.b = base * 1.05 // a faint cool cast, so it never reads as beige
    o.h = 0.46 + (p - 0.5) * 0.66 + row * 0.16 + (t - 0.5) * 0.18
    o.rough = clamp01(0.96 + (p - 0.5) * 0.035)
    o.metal = 0
  })
}

/* Oak wainscot. Rings run across v; a low-frequency warp keeps them from
 * looking like a barcode. */
function woodSurface(size) {
  const warpN = fbm(1401, 4, 5)
  const fine = fbm(1402, 3, 58)
  const blotch = fbm(1403, 3, 4)
  const RINGS = 11

  return bake(size, (u, v, o) => {
    const warp = warpN(u, v)
    const f = fine(u, v)
    const bl = blotch(u, v)

    const rings = Math.abs(Math.sin((v * RINGS + (warp - 0.5) * 1.6) * Math.PI))
    const grain = Math.pow(rings, 0.55)

    const base = 0.46 + (bl - 0.5) * 0.09 + (f - 0.5) * 0.05 - grain * 0.14
    o.r = base * 1.16
    o.g = base * 0.94
    o.b = base * 0.72
    o.h = 0.5 - grain * 0.22 + (f - 0.5) * 0.12
    o.rough = clamp01(0.52 + grain * 0.22 + (f - 0.5) * 0.06)
    o.metal = 0
  })
}

/* Cut stone, running bond. Serves double duty: big blocks on the facade and,
 * at a tighter UV density, paving on the apron outside. Like the three above it
 * bakes near mid-grey so the entrance can be tinted from night to day. */
function stoneSurface(size) {
  const grain = fbm(1501, 4, 26)
  const blotch = fbm(1502, 4, 5)
  const speck = fbm(1503, 2, 72)
  const ROWS = 4
  const COLS = 3
  const JOINT = 0.04

  /* Per-block tone. A cheap integer hash rather than another noise field: every
   * block needs ONE value for its whole face, and sampling a noise field would
   * give it a gradient instead. */
  const blockTone = (row, col) => {
    let h = (row * 73856093) ^ (col * 19349663)
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
  }

  return bake(size, (u, v, o) => {
    const row = Math.floor(v * ROWS) % ROWS
    // every other course steps half a block along, which is what stops the
    // joints lining up into continuous vertical seams
    const uu = (u + (row % 2) * 0.5) % 1
    const col = Math.floor(uu * COLS) % COLS

    const fu = uu * COLS - Math.floor(uu * COLS)
    const fv = v * ROWS - Math.floor(v * ROWS)
    // the joint is a fixed width in metres, so it needs different fractions on
    // each axis — the blocks are wider than they are tall
    const ju = JOINT
    const jv = (JOINT * COLS) / ROWS
    const joint = Math.max(
      1 - smoothstep(0, ju, fu),
      1 - smoothstep(0, ju, 1 - fu),
      1 - smoothstep(0, jv, fv),
      1 - smoothstep(0, jv, 1 - fv),
    )

    const g = grain(u, v)
    const b = blotch(u, v)
    const tone = blockTone(row, col)

    let base = 0.5 + (tone - 0.5) * 0.11 + (b - 0.5) * 0.06 + (g - 0.5) * 0.045
    let r = base * 1.01
    let gg = base
    let bl = base * 0.965
    let h = 0.58 + (g - 0.5) * 0.12
    let rough = 0.8 + (g - 0.5) * 0.1

    // the joint is mortar: darker, rougher, and recessed
    r = mix(r, base * 0.6, joint)
    gg = mix(gg, base * 0.6, joint)
    bl = mix(bl, base * 0.58, joint)
    h -= joint * 0.35
    rough = mix(rough, 0.95, joint)

    // pinprick speckle so a cut face is not a flat fill
    const sp = smoothstep(0.74, 0.96, speck(u, v))
    r *= 1 - sp * 0.12
    gg *= 1 - sp * 0.12
    bl *= 1 - sp * 0.12

    o.r = r
    o.g = gg
    o.b = bl
    o.h = h
    o.rough = clamp01(rough)
    o.metal = 0
  })
}

/* ---- text decals -------------------------------------------------------- */

/* Stencilled sign, worn. Used for door plates and wall markings. */
export function makeSign(text, opts = {}) {
  const {
    w = 512,
    h = 256,
    bg = '#141613',
    fg = '#c9c6b4',
    font = 'bold 96px "Courier New", monospace',
    sub = '',
    seed = 7,
  } = opts
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  ctx.fillStyle = fg
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, w / 2, sub ? h / 2 - 22 : h / 2)
  if (sub) {
    ctx.font = '28px "Courier New", monospace'
    ctx.globalAlpha = 0.55
    ctx.fillText(sub, w / 2, h / 2 + 52)
    ctx.globalAlpha = 1
  }

  // wear: scratch through the paint, then dirty the whole plate
  const r = mulberry32(seed)
  ctx.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 90; i++) {
    ctx.globalAlpha = 0.08 + r() * 0.5
    const x = r() * w
    const y = r() * h
    ctx.fillRect(x, y, 1 + r() * 26, 1 + r() * 2)
  }
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  grain(ctx, w, h, 0.7, true)

  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  t.needsUpdate = true
  return t
}

/* ---- the bake queue ----------------------------------------------------- */

export const MAT = {}

const RECIPES = [
  ['wall', 'Pouring concrete', () => pack(wallSurface(512), { normalStrength: 3 })],
  ['floor', 'Laying the floor', () => pack(floorSurface(512), { normalStrength: 4 })],
  ['ceiling', 'Hanging the ceiling', () => pack(ceilingSurface(256), { normalStrength: 2.4 })],
  ['steel', 'Fitting the doors', () => pack(steelSurface(256), { normalStrength: 3 })],
  ['plaster', 'Skimming the walls', () => pack(plasterSurface(256), { normalStrength: 1.8 })],
  ['carpet', 'Laying the carpet', () => pack(carpetSurface(256), { normalStrength: 3.4 })],
  ['wood', 'Fitting the wainscot', () => pack(woodSurface(256), { normalStrength: 2.2 })],
  ['stone', 'Facing the entrance', () => pack(stoneSurface(512), { normalStrength: 3.2 })],
]

/* Bakes one recipe per animation frame so the loading bar can actually move
 * instead of the tab freezing for two seconds. */
export function buildTextures(onProgress) {
  return new Promise((resolve) => {
    let i = 0
    const step = () => {
      if (i >= RECIPES.length) {
        onProgress(1, 'Ready')
        resolve(MAT)
        return
      }
      const [key, label, make] = RECIPES[i]
      onProgress(i / RECIPES.length, label)
      // yield once so the label paints before we block on the bake
      requestAnimationFrame(() => {
        MAT[key] = make()
        i++
        requestAnimationFrame(step)
      })
    }
    step()
  })
}

/* Clones a map set with different tiling. Textures are shared GPU uploads;
 * only the repeat differs, so we clone the THREE.Texture wrappers. */
export function tile(set, rx, ry) {
  const out = {}
  for (const k in set) {
    const t = set[k].clone()
    t.repeat.set(rx, ry)
    t.needsUpdate = true
    out[k] = t
  }
  return out
}

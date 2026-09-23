import * as THREE from 'three'
import { MAT } from '../textures'

let cache = null

/* One material per surface type, shared by every mesh that uses it. The maps
 * drive roughness and metalness, so both scalars sit at 1 and let the texture
 * decide. */
export function materials() {
  if (cache) return cache
  const std = (maps, extra = {}) =>
    new THREE.MeshStandardMaterial({
      ...maps,
      roughness: 1,
      metalness: 1,
      envMapIntensity: 0.6,
      ...extra,
    })

  cache = {
    wall: std(MAT.wall, { normalScale: new THREE.Vector2(1.15, 1.15) }),
    floor: std(MAT.floor, { normalScale: new THREE.Vector2(1.0, 1.0) }),
    ceiling: std(MAT.ceiling, { normalScale: new THREE.Vector2(0.9, 0.9) }),
    steel: std(MAT.steel, { normalScale: new THREE.Vector2(0.8, 0.8) }),
    /* The door leaves, painted near-black. Same maps as the steel, driven dark
     * by `color` and held off pure black by a low roughness — a matte black
     * door in an unlit corridor is a hole, not a door. All the colour on a door
     * comes from the light leaking round it, never from the paint. */
    /* Matte, not satin. At metalness 0.55 / envMap 1.5 these read as dark only
     * in a dark corridor: put one under the entrance canopy light and the
     * specular lobe turned the whole leaf into a grey slab. A painted fire door
     * barely reflects anything, and that is what keeps it black under any
     * light in the building. */
    door: std(MAT.steel, {
      color: new THREE.Color('#0b0d12'),
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 0.74,
      metalness: 0.16,
      envMapIntensity: 0.7,
    }),
    dark: new THREE.MeshStandardMaterial({ color: '#050607', roughness: 1, metalness: 0 }),
    black: new THREE.MeshBasicMaterial({ color: '#000000' }),
  }
  return cache
}

/* ---------------------------------------------------------------------------
 * THE FINISH
 * The plaster, carpet, wood and trim that the lobby, the door reveals and the
 * ABOUT room are all built from. ONE shared set, cached like the set above.
 *
 * Shared deliberately. Every one of these has its `color` animated between a
 * night and a day tint when the lights go on, and giving each space its own
 * instances meant a room could disagree with the hall it opens onto — a lit
 * room behind a dark doorway. One set, tinted once per frame by Corridor,
 * cannot drift. Nothing disposes these; they live as long as the page.
 * ------------------------------------------------------------------------- */
let finishCache = null

export function finish() {
  if (finishCache) return finishCache
  const std = (maps, extra = {}) =>
    new THREE.MeshStandardMaterial({ ...maps, roughness: 1, metalness: 1, envMapIntensity: 0.9, ...extra })

  finishCache = {
    wall: std(MAT.plaster, { normalScale: new THREE.Vector2(0.5, 0.5), metalness: 0 }),
    ceiling: std(MAT.plaster, { normalScale: new THREE.Vector2(0.35, 0.35), metalness: 0 }),
    carpet: std(MAT.carpet, { normalScale: new THREE.Vector2(1.1, 1.1), metalness: 0 }),
    wood: std(MAT.wood, { normalScale: new THREE.Vector2(0.8, 0.8), metalness: 0.08 }),
    trim: new THREE.MeshStandardMaterial({ color: '#1a1e26', roughness: 0.42, metalness: 0.6, envMapIntensity: 1.5 }),
    /* The facade and the paving outside. Same map, two instances, because the
     * apron sits under an open sky and the facade under a canopy — they tint to
     * different values and cannot share one. */
    stone: std(MAT.stone, { normalScale: new THREE.Vector2(1.0, 1.0), metalness: 0 }),
    paving: std(MAT.stone, { normalScale: new THREE.Vector2(0.9, 0.9), metalness: 0 }),
  }
  return finishCache
}

export function disposeMaterials() {
  cache = null
}

/* A hand-rolled environment: 64x32 equirect, near-black at the floor, a cold
 * blue overhead. Without it every metal surface renders pure black.
 * Deliberately dim — this is ambience, not lighting.
 *
 * The gradient is now blue-above / violet-below rather than grey-to-brown. It
 * is the only thing tinting every steel edge in the building at once, so it is
 * the cheapest place to put colour: no extra lights, no extra passes. */
export function buildEnvironment(gl) {
  const w = 64
  const h = 32
  const data = new Float32Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1) // 0 = top of the sphere
    // cold electric blue above, a bruised violet below
    const up = [0.035, 0.072, 0.125]
    const down = [0.030, 0.012, 0.038]
    const k = t * t
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      data[i] = up[0] + (down[0] - up[0]) * k
      data[i + 1] = up[1] + (down[1] - up[1]) * k
      data[i + 2] = up[2] + (down[2] - up[2]) * k
      data[i + 3] = 1
    }
  }
  const src = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType)
  src.mapping = THREE.EquirectangularReflectionMapping
  src.needsUpdate = true

  const pmrem = new THREE.PMREMGenerator(gl)
  pmrem.compileEquirectangularShader()
  const rt = pmrem.fromEquirectangular(src)
  src.dispose()
  pmrem.dispose()
  return rt.texture
}

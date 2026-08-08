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
    dark: new THREE.MeshStandardMaterial({ color: '#050607', roughness: 1, metalness: 0 }),
    black: new THREE.MeshBasicMaterial({ color: '#000000' }),
  }
  return cache
}

export function disposeMaterials() {
  cache = null
}

/* A hand-rolled environment: 64x32 equirect, near-black at the floor, a cold
 * dead grey overhead. Without it every metal surface renders pure black.
 * Deliberately dim — this is ambience, not lighting. */
export function buildEnvironment(gl) {
  const w = 64
  const h = 32
  const data = new Float32Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1) // 0 = top of the sphere
    // cold grey above, warm rot below
    const up = [0.05, 0.058, 0.072]
    const down = [0.014, 0.011, 0.009]
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

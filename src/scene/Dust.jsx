import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { rng } from './util'
import { useStore } from '../store'

const SPAN_Z = 26
const SPAN_X = 7
const SPAN_Y = 3.4

/* Airborne dust. It drifts, and it is the thing the torch beam actually
 * catches, so it does most of the work of making the air feel solid. */
export default function Dust() {
  const lowSpec = useStore((s) => s.lowSpec)
  const count = lowSpec ? 500 : 1500
  const pts = useRef()

  const sprite = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 32
    const ctx = c.getContext('2d')
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.35, 'rgba(255,255,255,0.35)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 32, 32)
    const t = new THREE.CanvasTexture(c)
    t.needsUpdate = true
    return t
  }, [])

  const { geo, seeds } = useMemo(() => {
    const r = rng(1337)
    const pos = new Float32Array(count * 3)
    const sd = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (r() - 0.5) * SPAN_X
      pos[i * 3 + 1] = r() * SPAN_Y
      pos[i * 3 + 2] = (r() - 0.5) * SPAN_Z
      sd[i * 3] = r() * 100 // phase
      sd[i * 3 + 1] = 0.12 + r() * 0.5 // drift speed
      sd[i * 3 + 2] = r() * 6.28 // sway phase
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return { geo: g, seeds: sd }
  }, [count])

  useFrame((s, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20)
    const t = s.clock.elapsedTime
    const camZ = s.camera.position.z
    const attr = geo.attributes.position
    const a = attr.array
    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      // slow fall with a lateral sway, like air-conditioning currents
      a[i3 + 1] -= seeds[i3 + 1] * 0.045 * dt
      a[i3] += Math.sin(t * 0.5 + seeds[i3 + 2]) * 0.012 * dt * 10
      if (a[i3 + 1] < 0) a[i3 + 1] = SPAN_Y
      // recycle motes that fall behind or too far ahead of the camera
      const rel = a[i3 + 2] - camZ
      if (rel > SPAN_Z / 2) a[i3 + 2] -= SPAN_Z
      else if (rel < -SPAN_Z / 2) a[i3 + 2] += SPAN_Z
      if (a[i3] > SPAN_X / 2) a[i3] -= SPAN_X
      else if (a[i3] < -SPAN_X / 2) a[i3] += SPAN_X
    }
    attr.needsUpdate = true
    if (pts.current) pts.current.position.x = s.camera.position.x * 0.15
  })

  return (
    <points ref={pts} geometry={geo} frustumCulled={false}>
      <pointsMaterial
        map={sprite}
        size={0.014}
        sizeAttenuation
        transparent
        opacity={0.32}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        color="#b9c7d6"
        toneMapped={false}
      />
    </points>
  )
}

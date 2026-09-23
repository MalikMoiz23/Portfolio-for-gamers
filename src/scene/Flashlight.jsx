import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { state, useStore } from '../store'
import { damp } from './util'

const REACH = 10 // how far ahead the beam is aimed
/* Only a shallow drop. Aim it hard at the floor and almost nothing comes back:
 * the floor is dark, half of it is damp enough to be a mirror, and at eye
 * height you are hitting it at grazing incidence so the cosine term is tiny.
 * Splitting the beam between floor and far wall is what actually reads. */
const DROP = 0.7
const ANGLE = 0.45

/* Slices of haze along the beam. Each is a camera-facing quad with a soft
 * radial falloff, so unlike a cone mesh there is no silhouette edge to give
 * away that the light shaft is geometry. Distance from the lens, radius, and
 * how much each one contributes. */
const HAZE = [
  [1.6, 0.85, 1.0],
  [3.2, 1.5, 0.62],
  [5.4, 2.3, 0.34],
]

/* A hand-held torch. It is not welded to the camera — the beam lags behind
 * where you are looking, which is most of what sells "someone is carrying
 * this". The battery is also not in great shape. */
export default function Flashlight() {
  const lowSpec = useStore((s) => s.lowSpec)
  const spot = useRef()
  const wide = useRef()
  const target = useRef()
  const fill = useRef()
  const haze = useRef([])

  const aim = useMemo(() => new THREE.Vector3(0, 1, -REACH), [])
  const tmp = useMemo(() => new THREE.Vector3(), [])
  const off = useMemo(() => new THREE.Vector3(), [])
  const fwd = useMemo(() => new THREE.Vector3(), [])
  const beam = useMemo(() => new THREE.Vector3(), [])

  const hazeTex = useMemo(() => {
    const size = 128
    const c = document.createElement('canvas')
    c.width = c.height = size
    const ctx = c.getContext('2d')
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    // gaussian-ish: no hard edge anywhere in the falloff
    for (let i = 0; i <= 10; i++) {
      const t = i / 10
      g.addColorStop(t, `rgba(255,255,255,${Math.exp(-4.2 * t * t).toFixed(4)})`)
    }
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
    const t = new THREE.CanvasTexture(c)
    t.needsUpdate = true
    return t
  }, [])

  const hazeMats = useMemo(
    () =>
      HAZE.map(([, , w]) =>
        new THREE.MeshBasicMaterial({
          map: hazeTex,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          color: new THREE.Color('#b9cdea'),
          opacity: 0.05 * w,
          toneMapped: false,
          fog: false,
        }),
      ),
    [hazeTex],
  )

  // spotlights aim at an Object3D, not a vector, so wire the two together once
  useEffect(() => {
    if (target.current) {
      if (spot.current) spot.current.target = target.current
      if (wide.current) wide.current.target = target.current
    }
  }, [])

  useFrame((s, rawDt) => {
    const dt = Math.min(rawDt, 1 / 12)
    const cam = s.camera
    const t = s.clock.elapsedTime

    // held slightly right of centre and below eye level
    off.set(0.24, -0.16, 0.05).applyQuaternion(cam.quaternion)
    const px = cam.position.x + off.x
    const py = cam.position.y + off.y
    const pz = cam.position.z + off.z

    fwd.set(0, 0, -1).applyQuaternion(cam.quaternion)
    tmp.copy(cam.position).addScaledVector(fwd, REACH)
    tmp.y -= DROP
    aim.lerp(tmp, 1 - Math.exp(-11 * dt))

    // dying battery: mostly steady, with the occasional stutter
    const wob = 0.93 + Math.sin(t * 9.1) * 0.03 + Math.sin(t * 23.7) * 0.02
    const glitching = Math.sin(t * 0.13) > 0.985
    const glitch = glitching ? (Math.sin(t * 61) > 0 ? 0.25 : 1) : 1
    const scale = wob * glitch

    const hot = state.phase === 'inside' ? 42 : 58
    if (spot.current) {
      spot.current.position.set(px, py, pz)
      spot.current.intensity = damp(spot.current.intensity, hot * scale, 14, dt)
    }
    // a wide, weak corona so the pool of light has no hard rim
    if (wide.current) {
      wide.current.position.set(px, py, pz)
      wide.current.intensity = damp(wide.current.intensity, 16 * scale, 14, dt)
    }
    if (target.current) target.current.position.copy(aim)
    if (fill.current) fill.current.position.set(px, py, pz)

    // haze slices ride along the beam, always square to the camera
    beam.set(aim.x - px, aim.y - py, aim.z - pz).normalize()
    for (let i = 0; i < haze.current.length; i++) {
      const q = haze.current[i]
      if (!q) continue
      const [dist] = HAZE[i]
      q.position.set(px + beam.x * dist, py + beam.y * dist, pz + beam.z * dist)
      q.quaternion.copy(cam.quaternion)
      hazeMats[i].opacity = 0.05 * HAZE[i][2] * scale
    }
  })

  return (
    <>
      <object3D ref={target} position={[0, 1, -REACH]} />
      <spotLight
        ref={spot}
        angle={ANGLE}
        penumbra={0.5}
        intensity={58}
        distance={26}
        decay={1.45}
        color="#e8efff"
        castShadow
        shadow-mapSize-width={lowSpec ? 512 : 1024}
        shadow-mapSize-height={lowSpec ? 512 : 1024}
        shadow-camera-near={0.1}
        shadow-camera-far={26}
        shadow-bias={-0.0009}
        shadow-normalBias={0.022}
      />
      {/* The wide spot is gone. Three lights for one torch is three full
          shading passes over everything it touches; the main cone was widened
          and the fill raised to cover what it was doing. */}
      {/* a little spill so the walls beside you are not pitch black */}
      <pointLight ref={fill} intensity={3.1} distance={8} decay={2} color="#9fb4cc" />
      {!lowSpec &&
        HAZE.map(([, radius], i) => (
          <mesh
            key={i}
            ref={(el) => {
              haze.current[i] = el
            }}
            material={hazeMats[i]}
            renderOrder={3}
            frustumCulled={false}
          >
            <planeGeometry args={[radius * 2, radius * 2]} />
          </mesh>
        ))}
    </>
  )
}

import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { B } from '../layout'
import { damp } from './util'
import { nav, toggleLights } from '../store'

/* ============================================================================
 * WHAT EVERY FINISHED ROOM HAS
 * ----------------------------------------------------------------------------
 * The pendant that switches the building's lights, the neon cove that carries
 * the room's colour at night, and the standing light rig.
 *
 * THE LIGHT COUNT IS LOAD-BEARING. Three keys its shader cache on the number of
 * lights in the scene, so the warmup in Scene.jsx only saves anything if every
 * room compiles to the same configuration. `RoomLights` is therefore a fixed
 * five, and with the pendant and the two a room adds itself that is eight
 * everywhere. Add a sixth here and every room pays a recompile on first entry
 * again — which was two to three seconds of frozen page.
 * ========================================================================== */

/* ---- the light switch ---------------------------------------------------- */

export function Pendant({ accent, lightsOn, x, z }) {
  const [hover, setHover] = useState(false)
  const bulbMat = useRef()
  const lamp = useRef()

  useFrame((s, dt) => {
    const t = s.clock.elapsedTime
    // off, it breathes — a dark bulb is a switch nobody finds
    const idle = 0.5 + Math.sin(t * 1.6) * 0.25
    const want = lightsOn ? 9 : (hover ? 1.6 : 0.55) * idle
    if (bulbMat.current) bulbMat.current.emissiveIntensity = damp(bulbMat.current.emissiveIntensity, want, 7, dt)
    if (lamp.current) lamp.current.intensity = damp(lamp.current.intensity, lightsOn ? 24 : 0.9, 5, dt)
  })

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, B.roomH - 0.02, 0]}>
        <cylinderGeometry args={[0.055, 0.065, 0.04, 14]} />
        <meshStandardMaterial color="#171b22" roughness={0.4} metalness={0.8} />
      </mesh>
      <mesh position={[0, B.roomH - 0.36, 0]}>
        <cylinderGeometry args={[0.006, 0.006, 0.66, 6]} />
        <meshStandardMaterial color="#141820" roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.62, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.15, 0.2, 20, 1, true]} />
        <meshStandardMaterial color="#1c212a" roughness={0.5} metalness={0.5} side={THREE.DoubleSide} envMapIntensity={1.5} />
      </mesh>
      <mesh position={[0, 2.56, 0]}>
        <sphereGeometry args={[0.055, 16, 12]} />
        <meshStandardMaterial ref={bulbMat} color="#100d08" emissive="#ffd9a2" emissiveIntensity={0.55} toneMapped={false} />
      </mesh>
      <pointLight ref={lamp} position={[0, 2.5, 0]} color="#ffdcb0" intensity={0.9} distance={13} decay={1.7} />
      <mesh position={[0.11, 2.3, 0]}>
        <cylinderGeometry args={[0.004, 0.004, 0.42, 5]} />
        <meshStandardMaterial color="#5a5f68" roughness={0.4} metalness={0.9} />
      </mesh>
      <mesh position={[0.11, 2.07, 0]}>
        <sphereGeometry args={[0.022, 10, 8]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={hover ? 1.4 : 0.5} toneMapped={false} roughness={0.3} metalness={0.7} />
      </mesh>
      {/* a generous target: nobody should have to aim at a 55mm bulb */}
      <mesh
        position={[0, 2.38, 0]}
        onClick={(e) => {
          e.stopPropagation()
          toggleLights()
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHover(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHover(false)
          document.body.style.cursor = 'auto'
        }}
      >
        <cylinderGeometry args={[0.3, 0.3, 0.85, 10]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </group>
  )
}

/* ---- the cove ------------------------------------------------------------ */

/* Emissive channels where the side walls meet the ceiling. Geometry, not
 * lights: the rig below already illuminates the room, and these only have to
 * be seen. They go out as the ceiling light comes up. */
export function CoveTrim({ accent }) {
  const mat = useRef()
  if (!mat.current) {
    mat.current = new THREE.MeshBasicMaterial({ color: new THREE.Color(accent), toneMapped: false, transparent: true })
  }

  useFrame((s) => {
    const t = nav.lit
    const breath = 0.8 + Math.sin(s.clock.elapsedTime * 0.9) * 0.12
    mat.current.color.set(accent).multiplyScalar(breath * 1.4 * (1 - t))
    mat.current.opacity = 1 - t * 0.92
  })

  const strips = [
    { pos: [B.roomD / 2, B.roomH - 0.12, -B.roomW / 2 + 0.014], rot: [0, 0, 0] },
    { pos: [B.roomD / 2, B.roomH - 0.12, B.roomW / 2 - 0.014], rot: [0, Math.PI, 0] },
  ]

  return (
    <group>
      {strips.map((s, i) => (
        <mesh key={i} position={s.pos} rotation={s.rot} material={mat.current}>
          <planeGeometry args={[B.roomD - 0.4, 0.02]} />
        </mesh>
      ))}
    </group>
  )
}

/* ---- the standing light rig ---------------------------------------------- */

/* Exactly five. See the note at the top of this file before changing that.
 * `feature` aims a light at whatever the room hangs on its far wall; `task` is
 * the lamp on whatever furniture the room has. */
export function RoomLights({ accent, feature = [B.roomD - 2.0, 2.4, 0], task = [B.roomD * 0.5, 1.5, 0] }) {
  const a = useRef()
  const b = useRef()
  const amb = useRef()

  useFrame(() => {
    const t = nav.lit
    // the cove fill has no job once the ceiling light is on
    if (a.current) a.current.intensity = 7.0 * (1 - t)
    if (b.current) b.current.intensity = 5.2 * (1 - t)
    if (amb.current) {
      amb.current.intensity = 0.24 + t * 0.44
      amb.current.color.set(accent)
    }
  })

  return (
    <>
      <pointLight ref={a} position={[B.roomD * 0.5, 2.85, -2.6]} color={accent} intensity={7.0} distance={9} decay={2} />
      <pointLight ref={b} position={[B.roomD * 0.5, 2.85, 2.6]} color={accent} intensity={5.2} distance={9} decay={2} />
      {/* Stood back from the wall AND turned down. Moving it back alone was not
          enough: at intensity 9 it still delivered ~2.3 to a card 2.3m away, and
          anything past 1.0 crosses the bloom threshold and smears across the
          text underneath it. */}
      <pointLight position={feature} color="#f2e8d6" intensity={3.2} distance={7} decay={1.7} />
      <pointLight position={task} color="#ffd7a8" intensity={3.0} distance={4.5} decay={2} />
      <ambientLight ref={amb} intensity={0.24} color={accent} />
    </>
  )
}

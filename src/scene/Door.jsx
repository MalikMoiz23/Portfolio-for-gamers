import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { B } from '../layout'
import { materials } from './materials'
import { planeUV, boxUV, damp } from './util'
import { makeSign } from '../textures'
import { state, nav, set, enterRoom, useStore } from '../store'

/* A steel fire door set into a recess in the corridor wall. Closed until you
 * click it. Light the colour of whatever is in the room leaks under it. */
export default function Door({ door }) {
  const { side, z, index, room } = door
  const m = materials()
  const [hover, setHover] = useState(false)
  const isActive = useStore((s) => s.activeRoom === index)

  const hinge = useRef()
  const plateMat = useRef()
  const bleedMat = useRef()
  const glow = useRef()
  const flood = useRef()
  const voidPanel = useRef()

  const wallX = side * (B.width / 2)
  const backX = side * (B.width / 2 + B.recess)
  const accent = new THREE.Color(room.accent)

  const geo = useMemo(() => {
    const d = 0.42 // texel density
    return {
      jamb: planeUV(B.recess, B.doorH, d),
      head: planeUV(B.doorW, B.recess, d),
      leaf: boxUV(0.055, B.doorH - 0.02, B.doorW - 0.03, 1.1),
      back: planeUV(B.doorW, B.doorH, d),
      plate: new THREE.PlaneGeometry(0.66, 0.17),
      bleed: new THREE.PlaneGeometry(B.doorW - 0.06, 0.05),
      /* Exactly the door leaf, nothing more. It used to overhang the opening by
       * 200mm, so clicks on the surrounding wall counted. The name plate above
       * the door is a separate mesh with no handler and is deliberately not
       * part of this — the only thing that opens a room is the door. */
      hit: new THREE.PlaneGeometry(B.doorW - 0.02, B.doorH - 0.02),
      sill: boxUV(B.recess, 0.03, B.doorW, 2),
    }
  }, [])

  const sign = useMemo(
    () => makeSign(room.plate, { w: 512, h: 132, seed: 31 + index * 17, font: 'bold 62px "Courier New", monospace' }),
    [room.plate, index],
  )

  // the wall face normal points into the corridor
  const faceRot = side === -1 ? Math.PI / 2 : -Math.PI / 2

  useFrame((s, dt) => {
    const active = state.activeRoom === index
    const open = active ? nav.roomT : 0
    // the black panel exists so a swinging door never reveals empty space;
    // once the room is actually mounted it has to get out of the way
    if (voidPanel.current) voidPanel.current.visible = open < 0.001
    if (hinge.current) {
      // swings away from the corridor, into the room
      hinge.current.rotation.y = damp(hinge.current.rotation.y, side * 1.5 * open, 4, dt)
    }
    const walking = state.phase === 'walk'
    // "primed" is the door you have stopped beside, which is about to open on
    // its own — it needs to look different from one you are merely pointing at
    const primed = walking && state.nearDoor === index
    const lit = (hover && walking) || primed
    const pulse = 0.72 + Math.sin(s.clock.elapsedTime * 1.4 + index) * 0.08
    const want = (primed ? 4.2 : lit ? 2.6 : 1.0) * pulse + open * 3.5
    if (glow.current) glow.current.intensity = damp(glow.current.intensity, want, 6, dt)
    if (plateMat.current) {
      plateMat.current.emissiveIntensity = damp(plateMat.current.emissiveIntensity, primed ? 2.2 : lit ? 1.5 : 0.3, 6, dt)
    }
    if (bleedMat.current) {
      bleedMat.current.opacity = damp(bleedMat.current.opacity, 0.55 + (lit ? 0.4 : 0) + open * 0.5, 6, dt)
    }
    // light dumps out of the opening as the leaf swings clear
    if (flood.current) flood.current.intensity = damp(flood.current.intensity, open * 26, 5, dt)
  })

  const enter = (e) => {
    e.stopPropagation()
    if (state.phase !== 'walk') return
    setHover(false)
    document.body.style.cursor = 'auto'
    enterRoom(index)
  }

  const over = (e) => {
    e.stopPropagation()
    if (state.phase !== 'walk') return
    setHover(true)
    document.body.style.cursor = 'pointer'
    set({ hoverRoom: index })
  }

  const out = () => {
    setHover(false)
    document.body.style.cursor = 'auto'
    if (state.hoverRoom === index) set({ hoverRoom: -1 })
  }

  return (
    <group position={[0, 0, z]}>
      {/* recess: two jambs, a head and a threshold */}
      <mesh
        geometry={geo.jamb}
        material={m.wall}
        position={[wallX - side * B.recess * 0.5, B.doorH / 2, B.doorW / 2]}
        rotation={[0, Math.PI, 0]}
      />
      <mesh
        geometry={geo.jamb}
        material={m.wall}
        position={[wallX - side * B.recess * 0.5, B.doorH / 2, -B.doorW / 2]}
      />
      <mesh
        geometry={geo.head}
        material={m.wall}
        position={[wallX - side * B.recess * 0.5, B.doorH, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      />
      <mesh
        geometry={geo.sill}
        material={m.steel}
        position={[wallX - side * B.recess * 0.5, 0.015, 0]}
      />

      {/* the void behind the door, so an open door does not show the skybox */}
      <mesh
        ref={voidPanel}
        geometry={geo.back}
        material={m.black}
        position={[backX - side * 0.02, B.doorH / 2, 0]}
        rotation={[0, faceRot, 0]}
      />

      {/* the leaf itself, hinged on the far edge */}
      <group ref={hinge} position={[backX - side * 0.05, 0, -B.doorW / 2]}>
        <mesh
          geometry={geo.leaf}
          material={m.steel}
          position={[0, B.doorH / 2, B.doorW / 2]}
          castShadow
          receiveShadow
        />
        {/* handle */}
        <mesh position={[side * -0.07, 1.02, B.doorW - 0.16]} castShadow>
          <cylinderGeometry args={[0.018, 0.018, 0.13, 8]} />
          <meshStandardMaterial color="#8a8f94" roughness={0.35} metalness={1} envMapIntensity={1.4} />
        </mesh>
      </group>

      {/* name plate on the corridor wall above the opening */}
      <mesh
        geometry={geo.plate}
        position={[wallX - side * 0.012, B.doorH + 0.31, 0]}
        rotation={[0, faceRot, 0]}
      >
        <meshStandardMaterial
          ref={plateMat}
          map={sign}
          emissiveMap={sign}
          emissive={accent}
          emissiveIntensity={0.3}
          roughness={0.85}
          metalness={0}
        />
      </mesh>

      {/* light bleeding out under the door */}
      <mesh
        geometry={geo.bleed}
        position={[wallX - side * 0.02, 0.028, 0]}
        rotation={[0, faceRot, 0]}
      >
        <meshBasicMaterial ref={bleedMat} color={accent} transparent opacity={0.55} toneMapped={false} />
      </mesh>
      <pointLight
        ref={glow}
        position={[wallX - side * 0.45, 0.28, 0]}
        color={accent}
        intensity={1}
        distance={3.4}
        decay={2}
      />
      {/* What the room throws into the corridor once the door is off its latch.
          Mounted only for the door being opened: a spotlight costs a full pass
          over every fragment it reaches, and five of them standing by all the
          time cost more frame time than this effect is worth. */}
      {isActive && (
        <spotLight
          ref={flood}
          position={[backX, 1.5, 0]}
          target-position={[wallX - side * 2.6, 1.1, 0]}
          angle={0.95}
          penumbra={1}
          intensity={0}
          distance={8}
          decay={1.8}
          color={accent}
        />
      )}

      {/* invisible click target, sitting in the plane of the doorway */}
      <mesh
        geometry={geo.hit}
        position={[wallX - side * 0.02, B.doorH / 2, 0]}
        rotation={[0, faceRot, 0]}
        onPointerOver={over}
        onPointerOut={out}
        onClick={enter}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </group>
  )
}

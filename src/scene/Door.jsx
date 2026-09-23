import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { B } from '../layout'
import { materials, finish } from './materials'
import { planeUV, boxUV, damp } from './util'
import { makeSign } from '../textures'
import { state, nav, set, enterRoom, useStore } from '../store'
import { glowWant, floodWant } from './doorGlow'

/* A steel fire door set into a recess in the corridor wall. Closed until you
 * click it. Light the colour of whatever is in the room leaks under it. */
export default function Door({ door }) {
  const { side, z, index, room } = door
  const m = materials()
  /* The reveal is lined in the same wood as the lobby's wainscot. It used to be
   * the corridor's concrete, which stayed grimy after the hall was finished and
   * made every doorway look like a hole knocked through a wall. */
  const f = finish()
  const [hover, setHover] = useState(false)
  const isActive = useStore((s) => s.activeRoom === index)

  const hinge = useRef()
  const plateMat = useRef()
  const bleedMat = useRef()
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
      frameV: new THREE.PlaneGeometry(0.024, B.doorH + 0.07),
      frameH: new THREE.PlaneGeometry(B.doorW + 0.11, 0.024),
    }
  }, [])

  /* Dark plate, dim lettering. The plate is not meant to be readable off its
   * own albedo — it gets its legibility from the accent emissive below, which
   * comes up as you approach. Light does the work; paint stays black. */
  const sign = useMemo(
    () =>
      makeSign(room.plate, {
        w: 512,
        h: 132,
        seed: 31 + index * 17,
        bg: '#090a0d',
        fg: '#6e737c',
        font: 'bold 62px "Courier New", monospace',
      }),
    [room.plate, index],
  )

  /* The three bars of the doorway channel share one material, so fading the
   * frame in and out is one property write per frame instead of three. */
  const frameMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(room.accent),
        toneMapped: false,
        transparent: true,
        opacity: 0.3,
      }),
    [room.accent],
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
    /* Each door used to own a point light for the spill under it: five lights
     * for a thing you can only ever be beside one of. Three.js shades every
     * fragment against every light in the scene, so those four you were not
     * near still cost a full pass each. The doors now just publish how bright
     * they want to be, and ONE shared light in Corridor goes to whichever is
     * winning. */
    const want = (primed ? 4.2 : lit ? 2.6 : 1.0) * pulse + open * 3.5
    glowWant[index] = { want, x: wallX - side * 0.45, z, color: room.accent }
    if (plateMat.current) {
      plateMat.current.emissiveIntensity = damp(plateMat.current.emissiveIntensity, primed ? 2.2 : lit ? 1.5 : 0.3, 6, dt)
    }
    if (bleedMat.current) {
      bleedMat.current.opacity = damp(bleedMat.current.opacity, 0.55 + (lit ? 0.4 : 0) + open * 0.5, 6, dt)
    }
    // the channel round the opening: idles low, comes up hard once the door is
    // the one you are about to walk through
    const wantFrame = Math.min(1, (primed ? 1 : lit ? 0.7 : 0.3) * pulse + open * 0.4)
    frameMaterial.opacity = damp(frameMaterial.opacity, wantFrame, 6, dt)
    // light dumps out of the opening as the leaf swings clear
    if (active) {
      floodWant.want = open * 26
      floodWant.x = backX
      floodWant.z = z
      floodWant.tx = wallX - side * 2.6
      floodWant.color = room.accent
    } else if (state.activeRoom < 0) {
      floodWant.want = 0
    }
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
        material={f.wood}
        position={[wallX - side * B.recess * 0.5, B.doorH / 2, B.doorW / 2]}
        rotation={[0, Math.PI, 0]}
      />
      <mesh
        geometry={geo.jamb}
        material={f.wood}
        position={[wallX - side * B.recess * 0.5, B.doorH / 2, -B.doorW / 2]}
      />
      <mesh
        geometry={geo.head}
        material={f.wood}
        position={[wallX - side * B.recess * 0.5, B.doorH, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      />
      <mesh
        geometry={geo.sill}
        material={f.trim}
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
          material={m.door}
          position={[0, B.doorH / 2, B.doorW / 2]}
          castShadow
          receiveShadow
        />
        {/* handle — the one bright part, and only because bare metal is what
            tells you a black rectangle is a door */}
        <mesh position={[side * -0.07, 1.02, B.doorW - 0.16]} castShadow>
          <cylinderGeometry args={[0.018, 0.018, 0.13, 8]} />
          <meshStandardMaterial color="#8a8f94" roughness={0.35} metalness={1} envMapIntensity={1.4} />
        </mesh>
      </group>

      {/* Neon channel round the opening, set into the corridor face of the
          wall. One material shared by all three bars, so the fade is a single
          property write per frame rather than three. */}
      <group position={[wallX - side * 0.014, 0, 0]} rotation={[0, faceRot, 0]}>
        {[-1, 1].map((s) => (
          <mesh
            key={s}
            geometry={geo.frameV}
            material={frameMaterial}
            position={[s * (B.doorW / 2 + 0.036), B.doorH / 2, 0]}
          />
        ))}
        <mesh geometry={geo.frameH} material={frameMaterial} position={[0, B.doorH + 0.036, 0]} />
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
      {/* The flood this door throws back into the corridor lives in Corridor
          now — see doorGlow.js. Mounting it here only while the door was active
          changed the scene's light count on entry, which is exactly what makes
          three recompile every shader. */}

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

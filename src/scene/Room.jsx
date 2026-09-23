import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { B } from '../layout'
import { ROOMS } from '../content'
import { materials } from './materials'
import { planeUV, boxUV, rng, damp } from './util'
import { makeSign } from '../textures'
import { makeRoomBoards } from '../board'
import { nav } from '../store'
import AboutRoom from './AboutRoom'
import ProjectsRoom from './ProjectsRoom'
import SkillsRoom from './SkillsRoom'
import HistoryRoom from './HistoryRoom'
import ContactRoom from './ContactRoom'

const D = 0.42

/* Boards are a fixed height and take their width from the canvas aspect the
 * layout engine chose, so type is never stretched. */
const BOARD_H = 2.15
const BOARD_GAP = 0.16
const BOARD_Y = 1.68

/* ---------------------------------------------------------------------------
 * One room, built in local space:
 *   +x runs away from the corridor, 0 = the doorway wall, roomD = the far wall
 *   z runs along the corridor, centred on the door
 * The whole group is flipped for doors on the left, which is a rotation rather
 * than a scale — so nothing on the boards ends up mirrored.
 * ------------------------------------------------------------------------- */

function Shell() {
  const m = materials()
  const g = useMemo(
    () => ({
      floor: planeUV(B.roomD, B.roomW, D),
      ceil: planeUV(B.roomD, B.roomW, D),
      far: planeUV(B.roomW, B.roomH, D),
      side: planeUV(B.roomD, B.roomH, D),
      nearA: planeUV((B.roomW - B.doorW) / 2, B.roomH, D),
      lintel: planeUV(B.doorW, B.roomH - B.doorH, D),
      skirt: boxUV(B.roomD, 0.11, 0.03, 2),
    }),
    [],
  )

  const off = B.doorW / 2 + (B.roomW - B.doorW) / 4

  return (
    <group>
      <mesh geometry={g.floor} material={m.floor} rotation={[-Math.PI / 2, 0, 0]} position={[B.roomD / 2, 0, 0]} receiveShadow />
      <mesh geometry={g.ceil} material={m.ceiling} rotation={[Math.PI / 2, 0, 0]} position={[B.roomD / 2, B.roomH, 0]} receiveShadow />
      <mesh geometry={g.far} material={m.wall} position={[B.roomD, B.roomH / 2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow />
      <mesh geometry={g.side} material={m.wall} position={[B.roomD / 2, B.roomH / 2, -B.roomW / 2]} receiveShadow />
      <mesh geometry={g.side} material={m.wall} position={[B.roomD / 2, B.roomH / 2, B.roomW / 2]} rotation={[0, Math.PI, 0]} receiveShadow />
      <mesh geometry={g.nearA} material={m.wall} position={[0, B.roomH / 2, off]} rotation={[0, Math.PI / 2, 0]} receiveShadow />
      <mesh geometry={g.nearA} material={m.wall} position={[0, B.roomH / 2, -off]} rotation={[0, Math.PI / 2, 0]} receiveShadow />
      <mesh geometry={g.lintel} material={m.wall} position={[0, (B.roomH + B.doorH) / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow />
      <mesh geometry={g.skirt} material={m.steel} position={[B.roomD / 2, 0.055, -B.roomW / 2 + 0.02]} />
      <mesh geometry={g.skirt} material={m.steel} position={[B.roomD / 2, 0.055, B.roomW / 2 - 0.02]} />
    </group>
  )
}

/* ---- the content, hung on the far wall ----------------------------------- */

function Boards({ room, index }) {
  const boards = useMemo(() => makeRoomBoards(room, index, ROOMS.length), [room, index])

  const bw = BOARD_H * (boards[0].w / boards[0].h)
  const n = boards.length
  const step = bw + BOARD_GAP
  const start = -((n - 1) * step) / 2

  const open = (href) => (e) => {
    e.stopPropagation()
    window.open(href, '_blank', 'noopener,noreferrer')
  }
  const cursor = (v) => () => {
    document.body.style.cursor = v
  }

  return (
    <group>
      {boards.map((b, i) => (
        // local +x of the plane maps to world +z, so board 0 sits screen-left
        <group key={i} position={[B.roomD - 0.05, BOARD_Y, start + i * step]} rotation={[0, -Math.PI / 2, 0]}>
          {/* frame */}
          <mesh position={[0, 0, -0.025]}>
            <planeGeometry args={[bw + 0.1, BOARD_H + 0.1]} />
            <meshStandardMaterial color="#1b1e1b" roughness={0.5} metalness={0.75} envMapIntensity={1.3} />
          </mesh>
          {/* the printed face — lightly self-lit so it stays legible in the dark */}
          <mesh>
            <planeGeometry args={[bw, BOARD_H]} />
            <meshStandardMaterial
              map={b.texture}
              emissiveMap={b.texture}
              /* low: the picture light does most of the work. Push this up and
                 the text crosses the bloom threshold and smears. */
              emissive="#ffffff"
              emissiveIntensity={0.2}
              roughness={0.82}
              metalness={0}
            />
          </mesh>
          {/* clickable regions sitting exactly over any link or project card */}
          {b.hotspots.map((h, k) => (
            <mesh
              key={k}
              position={[(h.u + h.uw / 2 - 0.5) * bw, (0.5 - (h.v + h.vh / 2)) * BOARD_H, 0.014]}
              onClick={open(h.href)}
              onPointerOver={cursor('pointer')}
              onPointerOut={cursor('auto')}
            >
              <planeGeometry args={[h.uw * bw, h.vh * BOARD_H]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
            </mesh>
          ))}
        </group>
      ))}
      {/* one picture light for the whole wall, not one per board — every extra
          light is another full pass over every fragment it touches */}
      <pointLight
        position={[B.roomD - 0.6, BOARD_Y + BOARD_H / 2 + 0.25, 0]}
        color="#dfe7f2"
        intensity={4.5}
        distance={6.5}
        decay={1.8}
      />
    </group>
  )
}

/* A caged bulb on a flex, swinging very slightly. */
function Bulb({ accent, x, z, power = 12 }) {
  const swing = useRef()
  const light = useRef()
  const mat = useRef()
  const seed = useMemo(() => Math.abs(x * 31 + z * 17), [x, z])

  useFrame((s, dt) => {
    const t = s.clock.elapsedTime
    if (swing.current) {
      swing.current.rotation.z = Math.sin(t * 0.7 + seed) * 0.035
      swing.current.rotation.x = Math.cos(t * 0.53 + seed) * 0.025
    }
    const wob = 0.86 + Math.sin(t * 13.7 + seed) * 0.06 + Math.sin(t * 2.3 + seed) * 0.08
    if (light.current) light.current.intensity = damp(light.current.intensity, power * wob, 9, dt)
    if (mat.current) mat.current.emissiveIntensity = damp(mat.current.emissiveIntensity, 3.4 * wob, 9, dt)
  })

  return (
    <group position={[x, B.roomH, z]}>
      <group ref={swing}>
        <mesh position={[0, -0.22, 0]}>
          <cylinderGeometry args={[0.006, 0.006, 0.44, 5]} />
          <meshStandardMaterial color="#14161a" roughness={1} />
        </mesh>
        <mesh position={[0, -0.47, 0]}>
          <sphereGeometry args={[0.045, 12, 10]} />
          <meshStandardMaterial ref={mat} color="#100e0a" emissive={accent} emissiveIntensity={3.4} toneMapped={false} />
        </mesh>
        <pointLight ref={light} position={[0, -0.47, 0]} color={accent} intensity={power} distance={9} decay={2} />
      </group>
    </group>
  )
}

/* Stencilled room name, high on a side wall — the boards carry the real title,
 * this is just so the space is labelled when you look around. */
function SideStencil({ room }) {
  const tex = useMemo(
    () => makeSign(room.title, { w: 512, h: 160, bg: '#191b18', fg: '#b6b3a2', font: 'bold 74px "Courier New", monospace', seed: 61 }),
    [room],
  )
  return (
    <mesh position={[B.roomD * 0.42, 2.62, -B.roomW / 2 + 0.012]}>
      <planeGeometry args={[1.5, 0.47]} />
      <meshStandardMaterial map={tex} emissiveMap={tex} emissive={room.accent} emissiveIntensity={0.3} roughness={0.9} />
    </mesh>
  )
}

/* ---- dressing, kept along the side walls so it never blocks the boards ---- */

function Desk() {
  const m = materials()
  const g = useMemo(
    () => ({
      top: boxUV(1.7, 0.05, 0.78, 1.6),
      leg: boxUV(0.06, 0.72, 0.06, 3),
      seat: boxUV(0.46, 0.05, 0.44, 2),
      back: boxUV(0.44, 0.5, 0.05, 2),
      monitor: boxUV(0.58, 0.36, 0.04, 2),
      mug: new THREE.CylinderGeometry(0.04, 0.035, 0.09, 12),
    }),
    [],
  )
  return (
    <group position={[B.roomD * 0.55, 0, -B.roomW / 2 + 0.5]}>
      <mesh geometry={g.top} material={m.steel} position={[0, 0.74, 0]} castShadow receiveShadow />
      {[-0.78, 0.78].map((x) =>
        [-0.33, 0.33].map((z) => <mesh key={`${x}${z}`} geometry={g.leg} material={m.steel} position={[x, 0.36, z]} castShadow />),
      )}
      <mesh geometry={g.monitor} material={m.steel} position={[0.1, 0.98, -0.2]} rotation={[0, 0.2, 0]} castShadow />
      <mesh geometry={g.mug} material={m.wall} position={[-0.5, 0.81, 0.1]} castShadow />
      <group position={[0.05, 0, 0.72]} rotation={[0, 0.35, 0]}>
        <mesh geometry={g.seat} material={m.steel} position={[0, 0.46, 0]} castShadow />
        <mesh geometry={g.back} material={m.steel} position={[0, 0.72, -0.2]} castShadow />
      </group>
    </group>
  )
}

function Shelves() {
  const m = materials()
  const g = useMemo(
    () => ({
      shelf: boxUV(0.5, 0.04, 2.6, 1.6),
      post: boxUV(0.05, 2.1, 0.05, 3),
      crate: boxUV(0.42, 0.3, 0.5, 2),
    }),
    [],
  )
  const crates = useMemo(() => {
    const r = rng(4242)
    const out = []
    for (let lvl = 0; lvl < 4; lvl++) {
      for (let i = 0; i < 4; i++) {
        if (r() < 0.42) continue
        out.push({ y: 0.42 + lvl * 0.52 + 0.17, z: -1.05 + i * 0.7 + (r() - 0.5) * 0.1, rot: (r() - 0.5) * 0.25 })
      }
    }
    return out
  }, [])

  return (
    <group position={[B.roomD * 0.55, 0, B.roomW / 2 - 0.36]} rotation={[0, Math.PI / 2, 0]}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} geometry={g.shelf} material={m.steel} position={[0, 0.42 + i * 0.52, 0]} castShadow receiveShadow />
      ))}
      {[-1.28, 1.28].map((z) =>
        [-0.2, 0.2].map((x) => <mesh key={`${z}${x}`} geometry={g.post} material={m.steel} position={[x, 1.05, z]} castShadow />),
      )}
      {crates.map((c, i) => (
        <mesh key={i} geometry={g.crate} material={m.wall} position={[0, c.y, c.z]} rotation={[0, c.rot, 0]} castShadow receiveShadow />
      ))}
    </group>
  )
}

function Cabinets() {
  const m = materials()
  const g = useMemo(() => ({ body: boxUV(0.62, 1.32, 0.46, 1.6), drawer: boxUV(0.05, 0.28, 0.42, 2) }), [])
  const r = useMemo(() => rng(707), [])
  const units = useMemo(() => [0, 1, 2, 3].map((i) => ({ z: -1.1 + i * 0.72, open: r() < 0.3 ? 0.24 : 0, lvl: Math.floor(r() * 4) })), [r])

  return (
    <group position={[B.roomD * 0.5, 0, -B.roomW / 2 + 0.32]} rotation={[0, Math.PI / 2, 0]}>
      {units.map((u, i) => (
        <group key={i} position={[0, 0, u.z]}>
          <mesh geometry={g.body} material={m.steel} position={[0, 0.66, 0]} castShadow receiveShadow />
          {[0, 1, 2, 3].map((k) => (
            <mesh
              key={k}
              geometry={g.drawer}
              material={m.steel}
              position={[-0.32 - (k === u.lvl ? u.open : 0), 0.2 + k * 0.31, 0]}
              castShadow
            />
          ))}
        </group>
      ))}
    </group>
  )
}

function ExitFittings({ accent }) {
  const m = materials()
  const tex = useMemo(
    () => makeSign('EXIT', { w: 512, h: 200, bg: '#0d0f0c', fg: '#e8fff0', font: 'bold 104px "Courier New", monospace', seed: 12 }),
    [],
  )
  const g = useMemo(
    () => ({ phone: boxUV(0.18, 0.42, 0.26, 2), handset: boxUV(0.07, 0.06, 0.24, 3), table: boxUV(0.5, 0.04, 1.0, 2), leg: boxUV(0.05, 0.72, 0.05, 3) }),
    [],
  )
  return (
    <group>
      {/* over the way you came in, where an exit sign actually belongs */}
      <mesh position={[0.03, B.doorH + 0.42, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.9, 0.35]} />
        <meshBasicMaterial map={tex} color={accent} toneMapped={false} />
      </mesh>
      <pointLight position={[0.55, B.doorH + 0.36, 0]} color={accent} intensity={3} distance={4} decay={2} />

      <group position={[B.roomD * 0.5, 0, -B.roomW / 2 + 0.2]} rotation={[0, Math.PI / 2, 0]}>
        <mesh geometry={g.phone} material={m.steel} position={[0, 1.35, 0]} castShadow />
        <mesh geometry={g.handset} material={m.steel} position={[-0.13, 1.05, 0.02]} rotation={[0.2, 0, 0.5]} castShadow />
      </group>
      <group position={[B.roomD * 0.55, 0, B.roomW / 2 - 0.4]} rotation={[0, Math.PI / 2, 0]}>
        <mesh geometry={g.table} material={m.steel} position={[0, 0.74, 0]} castShadow receiveShadow />
        {[-0.2, 0.2].map((x) => [-0.43, 0.43].map((z) => <mesh key={`${x}${z}`} geometry={g.leg} material={m.steel} position={[x, 0.36, z]} />))}
      </group>
    </group>
  )
}

/* ---- neon trim, fitted to every room ------------------------------------- *
 * Thin emissive channels where the walls meet the ceiling and a line along the
 * floor. They are unlit geometry, not lights — four extra point lights per room
 * would cost a full shading pass each, and the bulb and the picture light are
 * already doing the actual illuminating. Two low-distance points at the corners
 * are enough to sell the bounce. */
function NeonTrim({ accent }) {
  const strips = useMemo(
    () => [
      // along both side walls, just under the ceiling
      { pos: [B.roomD / 2, B.roomH - 0.09, -B.roomW / 2 + 0.012], rot: [0, 0, 0], size: [B.roomD - 0.3, 0.022] },
      { pos: [B.roomD / 2, B.roomH - 0.09, B.roomW / 2 - 0.012], rot: [0, Math.PI, 0], size: [B.roomD - 0.3, 0.022] },
      // across the far wall, above the boards
      { pos: [B.roomD - 0.012, B.roomH - 0.09, 0], rot: [0, -Math.PI / 2, 0], size: [B.roomW - 0.3, 0.022] },
      // and a line at the skirting, which is what puts colour on the floor
      { pos: [B.roomD / 2, 0.035, -B.roomW / 2 + 0.014], rot: [0, 0, 0], size: [B.roomD - 0.5, 0.014] },
      { pos: [B.roomD / 2, 0.035, B.roomW / 2 - 0.014], rot: [0, Math.PI, 0], size: [B.roomD - 0.5, 0.014] },
    ],
    [],
  )

  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: accent, toneMapped: false }), [accent])
  const pulse = useRef()

  useFrame((s) => {
    // a slow breath, so the trim is not a dead decal
    const k = 0.78 + Math.sin(s.clock.elapsedTime * 0.9) * 0.12
    mat.color.set(accent).multiplyScalar(k * 1.35)
    if (pulse.current) pulse.current.intensity = 2.1 * k
  })

  return (
    <group>
      {strips.map((s, i) => (
        <mesh key={i} position={s.pos} rotation={s.rot} material={mat}>
          <planeGeometry args={s.size} />
        </mesh>
      ))}
      <pointLight ref={pulse} position={[B.roomD - 0.5, B.roomH - 0.3, 0]} color={accent} intensity={2.1} distance={6} decay={2} />
    </group>
  )
}

/* ABOUT and PROJECTS are not in here — they build their own rooms in
 * AboutRoom.jsx and ProjectsRoom.jsx and never reach this switch. */
function Dressing({ room }) {
  switch (room.id) {
    case 'skills':
      return <Shelves />
    case 'experience':
      return <Cabinets />
    case 'contact':
      return <ExitFittings accent={room.accent} />
    default:
      return <Desk />
  }
}

/* ---- the room, mounted only while you are in it -------------------------- */

/* Every finished room, by id. Anything not listed falls through to the plain
 * concrete shell at the bottom of this file. */
const FINISHED = {
  about: AboutRoom,
  projects: ProjectsRoom,
  skills: SkillsRoom,
  experience: HistoryRoom,
  contact: ContactRoom,
}

/* `warm` marks the warmup pass: the room is mounted only so its materials get
 * rendered once and their shaders compiled while the loading screen is still
 * up. It has to be VISIBLE for that — three skips invisible objects — so it
 * overrides the roomT gate below. */
export default function Room({ door, warm = false }) {
  const { side, z, room, index } = door
  const grp = useRef()

  const rot = side === -1 ? Math.PI : 0
  const originX = side * (B.width / 2 + B.recess)

  useFrame(() => {
    if (grp.current) grp.current.visible = warm || nav.roomT > 0.001
  })

  /* Every room in content.js is now finished: its own shell, its own lighting,
   * its own way of carrying content. The concrete-cell code further down is
   * what they all used to be, and survives only as the fallback for a room id
   * this table does not know — add a room and you get a plain box rather than
   * an empty doorway. */
  const Finished = FINISHED[room.id]
  if (Finished) {
    return (
      <group ref={grp} position={[originX, 0, z]} rotation={[0, rot, 0]}>
        <Finished room={room} />
      </group>
    )
  }

  return (
    <group ref={grp} position={[originX, 0, z]} rotation={[0, rot, 0]}>
      <Shell />
      <Boards room={room} index={index} />
      <SideStencil room={room} />
      <NeonTrim accent={room.accent} />
      <Dressing room={room} />
      <Bulb accent={room.accent} x={B.roomD * 0.34} z={0} power={13} />
      {/* wash across the board wall, from above and behind you */}
      <spotLight
        position={[B.roomD * 0.45, B.roomH - 0.15, 0]}
        target-position={[B.roomD, 1.6, 0]}
        angle={0.85}
        penumbra={1}
        intensity={15}
        distance={11}
        decay={1.7}
        color="#cfd9e6"
      />
      {/* Accent fill from the corners. Pushed well past the old values because
          the room now has neon trim to justify it — under-lit accent light just
          reads as a colour cast rather than as anything glowing. */}
      <pointLight position={[1.2, 2.1, 1.8]} color={room.accent} intensity={4.4} distance={8} decay={2} />
      <pointLight position={[1.2, 2.1, -1.8]} color={room.accent} intensity={3.2} distance={8} decay={2} />
      {/* A cold counter-light opposite the accent, so the shadows are not just
          a darker version of the key. Complementary lighting is most of why a
          coloured room reads as lit rather than as tinted. */}
      <pointLight position={[B.roomD - 1.0, 0.9, B.roomW * 0.32]} color="#2b6bff" intensity={2.6} distance={7} decay={2} />
      <ambientLight intensity={0.16} color={room.accent} />
    </group>
  )
}

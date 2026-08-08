import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { B } from '../layout'
import { materials } from './materials'
import { planeUV, boxUV, rng, damp } from './util'
import { makeSign } from '../textures'
import { nav } from '../store'

const D = 0.42

/* ---------------------------------------------------------------------------
 * One room, built in local space:
 *   +x runs away from the corridor, 0 = the doorway wall, roomD = the far wall
 *   z runs along the corridor, centred on the door
 * The whole group is then flipped for doors on the left-hand side.
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
      {/* far wall */}
      <mesh geometry={g.far} material={m.wall} position={[B.roomD, B.roomH / 2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow />
      {/* the two long walls */}
      <mesh geometry={g.side} material={m.wall} position={[B.roomD / 2, B.roomH / 2, -B.roomW / 2]} receiveShadow />
      <mesh geometry={g.side} material={m.wall} position={[B.roomD / 2, B.roomH / 2, B.roomW / 2]} rotation={[0, Math.PI, 0]} receiveShadow />
      {/* the doorway wall, in two pieces with a lintel over the opening */}
      <mesh geometry={g.nearA} material={m.wall} position={[0, B.roomH / 2, off]} rotation={[0, Math.PI / 2, 0]} receiveShadow />
      <mesh geometry={g.nearA} material={m.wall} position={[0, B.roomH / 2, -off]} rotation={[0, Math.PI / 2, 0]} receiveShadow />
      <mesh geometry={g.lintel} material={m.wall} position={[0, (B.roomH + B.doorH) / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow />
      <mesh geometry={g.skirt} material={m.steel} position={[B.roomD / 2, 0.055, -B.roomW / 2 + 0.02]} />
      <mesh geometry={g.skirt} material={m.steel} position={[B.roomD / 2, 0.055, B.roomW / 2 - 0.02]} />
    </group>
  )
}

/* A caged bulb on a flex, swinging very slightly. */
function Bulb({ accent, x = B.roomD * 0.5, z = 0, power = 9 }) {
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
        <pointLight ref={light} position={[0, -0.47, 0]} color={accent} intensity={power} distance={9} decay={2} castShadow={false} />
      </group>
    </group>
  )
}

/* Big stencilled section name on the far wall — the thing you read first. */
function WallTitle({ room }) {
  const tex = useMemo(
    () =>
      makeSign(room.title, {
        w: 1024,
        h: 320,
        bg: '#191b18',
        fg: '#cfcbb8',
        font: 'bold 150px "Courier New", monospace',
        sub: room.subtitle,
        seed: 61,
      }),
    [room],
  )
  return (
    <group position={[B.roomD - 0.012, 2.18, 0]} rotation={[0, -Math.PI / 2, 0]}>
      {/* a frame, so the plate reads as a fitted sign rather than a rectangle
          that someone pasted onto the wall */}
      <mesh position={[0, 0, -0.03]}>
        <planeGeometry args={[3.16, 1.1]} />
        <meshStandardMaterial color="#1c1f1c" roughness={0.55} metalness={0.7} envMapIntensity={1.2} />
      </mesh>
      <mesh>
        <planeGeometry args={[3.0, 0.94]} />
        <meshStandardMaterial map={tex} emissiveMap={tex} emissive={room.accent} emissiveIntensity={0.7} roughness={0.9} />
      </mesh>
      <pointLight position={[0, 0.72, 0.85]} color={room.accent} intensity={2.6} distance={4.2} decay={2} />
    </group>
  )
}

/* ---- per-section furniture ---------------------------------------------- */

function Desk() {
  const m = materials()
  const g = useMemo(
    () => ({
      top: boxUV(1.7, 0.05, 0.78, 1.6),
      leg: boxUV(0.06, 0.72, 0.06, 3),
      chairSeat: boxUV(0.46, 0.05, 0.44, 2),
      chairBack: boxUV(0.44, 0.5, 0.05, 2),
      monitor: boxUV(0.58, 0.36, 0.04, 2),
      mug: new THREE.CylinderGeometry(0.04, 0.035, 0.09, 12),
    }),
    [],
  )
  return (
    <group position={[B.roomD - 0.75, 0, -1.3]} rotation={[0, -Math.PI / 2, 0]}>
      <mesh geometry={g.top} material={m.steel} position={[0, 0.74, 0]} castShadow receiveShadow />
      {[-0.78, 0.78].map((x) =>
        [-0.33, 0.33].map((z) => (
          <mesh key={`${x}${z}`} geometry={g.leg} material={m.steel} position={[x, 0.36, z]} castShadow />
        )),
      )}
      <mesh geometry={g.monitor} material={m.steel} position={[0.1, 0.98, -0.2]} rotation={[0, 0.2, 0]} castShadow />
      <mesh geometry={g.mug} material={m.wall} position={[-0.5, 0.81, 0.1]} castShadow />
      <group position={[0.05, 0, 0.72]} rotation={[0, 0.35, 0]}>
        <mesh geometry={g.chairSeat} material={m.steel} position={[0, 0.46, 0]} castShadow />
        <mesh geometry={g.chairBack} material={m.steel} position={[0, 0.72, -0.2]} castShadow />
        {[-0.19, 0.19].map((x) =>
          [-0.18, 0.18].map((z) => (
            <mesh key={`c${x}${z}`} geometry={g.leg} material={m.steel} position={[x, 0.23, z]} scale={[1, 0.64, 1]} />
          )),
        )}
      </group>
    </group>
  )
}

/* Backlit boards, one per project — the room reads as a gallery. */
function ProjectBoards({ room }) {
  const items = (room.blocks.find((b) => b.kind === 'cards')?.items ?? []).slice(0, 4)
  const boards = useMemo(
    () =>
      items.map((it, i) =>
        makeSign(it.title, {
          w: 512,
          h: 320,
          bg: '#101210',
          fg: '#e2ded0',
          font: 'bold 58px "Courier New", monospace',
          sub: it.meta || '',
          seed: 800 + i * 13,
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room],
  )
  const span = B.roomW - 2.4
  return (
    <group>
      {boards.map((tex, i) => {
        const z = boards.length > 1 ? -span / 2 + (span / (boards.length - 1)) * i : 0
        return (
          <group key={i} position={[B.roomD - 0.16, 1.5, z]}>
            <mesh rotation={[0, -Math.PI / 2, 0]}>
              <planeGeometry args={[1.05, 0.66]} />
              <meshStandardMaterial map={tex} emissiveMap={tex} emissive={room.accent} emissiveIntensity={1.5} roughness={0.7} toneMapped={false} />
            </mesh>
            <mesh position={[0.06, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
              <planeGeometry args={[1.18, 0.79]} />
              <meshStandardMaterial color="#1a1c1a" roughness={0.6} metalness={0.8} envMapIntensity={1.2} />
            </mesh>
            <pointLight position={[-0.5, 0, 0]} color={room.accent} intensity={1.6} distance={3.2} decay={2} />
          </group>
        )
      })}
    </group>
  )
}

/* Industrial racking, loaded unevenly. */
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
    <group position={[B.roomD - 0.34, 0, 1.6]}>
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

/* A row of filing cabinets, one drawer left hanging open. */
function Cabinets() {
  const m = materials()
  const g = useMemo(
    () => ({
      body: boxUV(0.62, 1.32, 0.46, 1.6),
      drawer: boxUV(0.05, 0.28, 0.42, 2),
    }),
    [],
  )
  const r = useMemo(() => rng(707), [])
  const units = useMemo(() => [0, 1, 2, 3].map((i) => ({ z: -1.9 + i * 0.72, open: r() < 0.3 ? 0.24 : 0, lvl: Math.floor(r() * 4) })), [r])

  return (
    <group position={[B.roomD - 0.34, 0, 0]} rotation={[0, 0, 0]}>
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

/* A payphone bolted to the far wall, and the way out. */
function ExitFittings({ accent }) {
  const m = materials()
  const tex = useMemo(() => makeSign('EXIT', { w: 512, h: 200, bg: '#0d0f0c', fg: '#e8fff0', font: 'bold 104px "Courier New", monospace', seed: 12 }), [])
  const g = useMemo(
    () => ({
      phone: boxUV(0.18, 0.42, 0.26, 2),
      handset: boxUV(0.07, 0.06, 0.24, 3),
      table: boxUV(0.5, 0.04, 1.0, 2),
      leg: boxUV(0.05, 0.72, 0.05, 3),
    }),
    [],
  )
  return (
    <group>
      {/* off to one side: dead centre puts it straight through the room's own
          name plate, which sits at the same height */}
      <mesh position={[B.roomD - 0.02, 2.42, -2.0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[0.9, 0.35]} />
        <meshBasicMaterial map={tex} color={accent} toneMapped={false} />
      </mesh>
      <pointLight position={[B.roomD - 0.5, 2.36, -2.0]} color={accent} intensity={2.4} distance={4} decay={2} />

      <group position={[B.roomD - 0.2, 0, -2.2]}>
        <mesh geometry={g.phone} material={m.steel} position={[0, 1.35, 0]} castShadow />
        <mesh geometry={g.handset} material={m.steel} position={[-0.13, 1.05, 0.02]} rotation={[0.2, 0, 0.5]} castShadow />
      </group>

      <group position={[B.roomD - 0.35, 0, 2.1]}>
        <mesh geometry={g.table} material={m.steel} position={[0, 0.74, 0]} castShadow receiveShadow />
        {[-0.2, 0.2].map((x) =>
          [-0.43, 0.43].map((z) => <mesh key={`${x}${z}`} geometry={g.leg} material={m.steel} position={[x, 0.36, z]} />),
        )}
      </group>
    </group>
  )
}

function Furniture({ room }) {
  switch (room.id) {
    case 'about':
      return <Desk />
    case 'projects':
      return <ProjectBoards room={room} />
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

export default function Room({ door }) {
  const { side, z, room } = door
  const grp = useRef()

  // local +x must point away from the corridor
  const rot = side === -1 ? Math.PI : 0
  const originX = side * (B.width / 2 + B.recess)

  useFrame(() => {
    // rooms stay hidden until the door actually starts to swing, which keeps
    // the corridor cheap and stops the interior popping through the leaf
    if (grp.current) grp.current.visible = nav.roomT > 0.001
  })

  return (
    <group ref={grp} position={[originX, 0, z]} rotation={[0, rot, 0]}>
      <Shell />
      <WallTitle room={room} />
      <Furniture room={room} />
      <Bulb accent={room.accent} x={B.roomD * 0.42} z={-0.4} power={15} />
      {/* fill from behind the camera's shoulder, so the fittings are silhouettes
          against a lit wall rather than black shapes in a black room */}
      <pointLight position={[1.0, 2.2, 1.6]} color={room.accent} intensity={2.0} distance={7} decay={2} />
      <pointLight position={[B.roomD - 1.2, 1.1, -2.4]} color="#8fa2b8" intensity={1.5} distance={5.5} decay={2} />
      <ambientLight intensity={0.075} color={room.accent} />
    </group>
  )
}

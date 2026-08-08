import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { B, DOORS, END, MOUTH, TUBES, OPEN_FROM, OPEN_TO } from '../layout'
import { PROFILE } from '../content'
import { materials } from './materials'
import { planeUV, boxUV, rng, clamp01, damp, smootherstep } from './util'
import { makeSign } from '../textures'
import { nav } from '../store'
import * as audio from '../audio'
import Door from './Door'

const DENSITY = 0.42 // texture tiles per metre

/* Split each side wall into the solid runs between doorways. */
function wallRuns(side) {
  const gaps = DOORS.filter((d) => d.side === side)
    .map((d) => [d.z + B.doorW / 2, d.z - B.doorW / 2])
    .sort((a, b) => b[0] - a[0])
  const runs = []
  let cursor = MOUTH
  for (const [near, far] of gaps) {
    if (cursor > near + 0.01) runs.push([cursor, near])
    cursor = far
  }
  if (cursor > -END + 0.01) runs.push([cursor, -END])
  return runs
}

/* ---- a failing fluorescent tube ----------------------------------------- */

function Tube({ z, seed }) {
  const r = useMemo(() => rng(seed), [seed])
  const cfg = useMemo(() => {
    const roll = r()
    return {
      mode: roll < 0.32 ? 'dead' : roll < 0.66 ? 'flicker' : 'steady',
      phase: r() * 100,
      rate: 4 + r() * 9,
      base: 9 + r() * 6,
    }
  }, [r])

  const light = useRef()
  const mat = useRef()
  const wasOn = useRef(true)

  const geo = useMemo(
    () => ({
      housing: boxUV(0.34, 0.1, 1.24, 1.4),
      tube: new THREE.CylinderGeometry(0.026, 0.026, 1.16, 8),
      stem: new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6),
    }),
    [],
  )

  useFrame((s, dt) => {
    const t = s.clock.elapsedTime + cfg.phase
    let on = 1
    if (cfg.mode === 'dead') {
      on = 0
    } else if (cfg.mode === 'steady') {
      on = 0.9 + Math.sin(t * 37) * 0.05 + Math.sin(t * 11.3) * 0.03
    } else {
      // stochastic dropouts: a cheap hash on a coarse time step
      const step = Math.floor(t * cfg.rate)
      const h = Math.abs(Math.sin(step * 12.9898 + seed) * 43758.5453) % 1
      const strike = Math.abs(Math.sin(step * 78.233 + seed * 3) * 12345.678) % 1
      on = h > 0.42 ? 0.75 + strike * 0.45 : strike > 0.86 ? 0.4 : 0.02
    }
    const target = on
    const cur = light.current ? light.current.intensity / cfg.base : 0
    const nextOn = damp(cur, target, cfg.mode === 'flicker' ? 40 : 8, dt)
    if (light.current) light.current.intensity = nextOn * cfg.base
    if (mat.current) mat.current.emissiveIntensity = 0.02 + nextOn * 3.0
    // one dry electrical tick each time a failing tube re-strikes
    const isOn = nextOn > 0.5
    if (cfg.mode === 'flicker' && isOn && !wasOn.current && Math.abs(z - (B.entry - nav.pos)) < 14) {
      audio.tick()
    }
    wasOn.current = isOn
  })

  return (
    <group position={[0, B.height - 0.02, z]}>
      <mesh geometry={geo.stem} material={materials().steel} position={[0, 0.05, 0]} />
      <mesh geometry={geo.housing} material={materials().steel} position={[0, -0.06, 0]} castShadow />
      <mesh geometry={geo.tube} position={[0, -0.115, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial
          ref={mat}
          color="#0b0d0e"
          emissive="#cfe4ff"
          emissiveIntensity={0.02}
          toneMapped={false}
          roughness={0.4}
        />
      </mesh>
      {cfg.mode !== 'dead' && (
        <pointLight
          ref={light}
          position={[0, -0.2, 0]}
          color="#bcd4f0"
          intensity={0}
          distance={9.5}
          decay={2}
        />
      )}
    </group>
  )
}

/* ---- the way in --------------------------------------------------------- */

function Entrance() {
  const m = materials()
  const hinge = useRef()
  const signMat = useRef()

  const geo = useMemo(
    () => ({
      side: planeUV(6.2, 4.6, DENSITY),
      head: planeUV(B.doorW + 0.5, 4.6 - B.doorH - 0.2, DENSITY),
      leaf: boxUV(B.doorW + 0.44, B.doorH + 0.18, 0.07, 1.0),
      sign: new THREE.PlaneGeometry(3.4, 0.82),
      apron: planeUV(16, B.entry + 6, DENSITY),
    }),
    [],
  )

  const sign = useMemo(
    () =>
      makeSign('PORTFOLIO', {
        w: 1024,
        h: 256,
        bg: '#0e100e',
        fg: '#d8d4c2',
        font: 'bold 132px "Courier New", monospace',
        sub: PROFILE.name,
        seed: 5,
      }),
    [],
  )

  useFrame((s, dt) => {
    const open = smootherstep(clamp01((nav.pos - OPEN_FROM) / (OPEN_TO - OPEN_FROM)))
    // swings inward so you push through it rather than walking into it
    if (hinge.current) hinge.current.rotation.y = open * 1.62
    if (signMat.current) {
      const flick = 0.9 + Math.sin(s.clock.elapsedTime * 21) * 0.06 + Math.sin(s.clock.elapsedTime * 3.1) * 0.05
      signMat.current.emissiveIntensity = damp(signMat.current.emissiveIntensity, 0.85 * flick, 8, dt)
    }
  })

  const halfGap = (B.doorW + 0.5) / 2

  return (
    <group>
      {/* apron of concrete outside the building */}
      <mesh
        geometry={geo.apron}
        material={m.floor}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, (B.entry + 6) / 2]}
        receiveShadow
      />

      {/* facade with the opening cut out of it */}
      <mesh geometry={geo.side} material={m.wall} position={[-halfGap - 3.1, 2.3, 0]} />
      <mesh geometry={geo.side} material={m.wall} position={[halfGap + 3.1, 2.3, 0]} />
      <mesh
        geometry={geo.head}
        material={m.wall}
        position={[0, B.doorH + 0.2 + (4.6 - B.doorH - 0.2) / 2, 0]}
      />

      {/* lit board above the door */}
      <mesh geometry={geo.sign} position={[0, 3.15, 0.04]}>
        <meshStandardMaterial
          ref={signMat}
          map={sign}
          emissiveMap={sign}
          emissive="#e8dcc0"
          emissiveIntensity={0.85}
          roughness={0.9}
          metalness={0}
        />
      </mesh>
      <spotLight
        position={[-1.5, 4.3, 2.0]}
        target-position={[0, 3.1, 0]}
        angle={0.6}
        penumbra={0.9}
        intensity={14}
        distance={9}
        decay={2}
        color="#ffd9a8"
      />
      <spotLight
        position={[1.5, 4.3, 2.0]}
        target-position={[0, 3.1, 0]}
        angle={0.6}
        penumbra={0.9}
        intensity={10}
        distance={9}
        decay={2}
        color="#ffd9a8"
      />

      {/* the door you push through */}
      <group ref={hinge} position={[-halfGap + 0.04, 0, 0]}>
        <mesh
          geometry={geo.leaf}
          material={m.steel}
          position={[(B.doorW + 0.44) / 2, (B.doorH + 0.18) / 2, 0]}
          castShadow
        />
      </group>
    </group>
  )
}

/* ---- everything else ---------------------------------------------------- */

function Shell() {
  const m = materials()
  const runsL = useMemo(() => wallRuns(-1), [])
  const runsR = useMemo(() => wallRuns(1), [])

  const floorLen = END
  const geo = useMemo(
    () => ({
      floor: planeUV(B.width, floorLen, DENSITY),
      ceil: planeUV(B.width, floorLen, DENSITY),
      end: planeUV(B.width, B.height, DENSITY),
      pipe: new THREE.CylinderGeometry(0.055, 0.055, END + 1, 10, 1, true),
      pipe2: new THREE.CylinderGeometry(0.032, 0.032, END + 1, 8, 1, true),
    }),
    [floorLen],
  )

  const wallGeos = useMemo(() => {
    const make = (runs) =>
      runs.map(([a, b]) => ({
        g: planeUV(a - b, B.height, DENSITY),
        z: (a + b) / 2,
      }))
    return { l: make(runsL), r: make(runsR) }
  }, [runsL, runsR])

  const lintels = useMemo(
    () =>
      DOORS.map((d) => ({
        g: planeUV(B.doorW, B.height - B.doorH, DENSITY),
        d,
      })),
    [],
  )

  const endSign = useMemo(
    () => makeSign('NO EXIT', { w: 512, h: 200, bg: '#101008', fg: '#9ea08a', seed: 77, font: 'bold 76px "Courier New", monospace' }),
    [],
  )

  return (
    <group>
      <mesh
        geometry={geo.floor}
        material={m.floor}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, -END / 2]}
        receiveShadow
      />
      <mesh
        geometry={geo.ceil}
        material={m.ceiling}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, B.height, -END / 2]}
        receiveShadow
      />

      {wallGeos.l.map((s, i) => (
        <mesh
          key={`l${i}`}
          geometry={s.g}
          material={m.wall}
          position={[-B.width / 2, B.height / 2, s.z]}
          rotation={[0, Math.PI / 2, 0]}
          receiveShadow
        />
      ))}
      {wallGeos.r.map((s, i) => (
        <mesh
          key={`r${i}`}
          geometry={s.g}
          material={m.wall}
          position={[B.width / 2, B.height / 2, s.z]}
          rotation={[0, -Math.PI / 2, 0]}
          receiveShadow
        />
      ))}
      {lintels.map(({ g, d }, i) => (
        <mesh
          key={`t${i}`}
          geometry={g}
          material={m.wall}
          position={[d.x, (B.height + B.doorH) / 2, d.z]}
          rotation={[0, d.side === -1 ? Math.PI / 2 : -Math.PI / 2, 0]}
          receiveShadow
        />
      ))}

      {/* dead end */}
      <mesh geometry={geo.end} material={m.wall} position={[0, B.height / 2, -END]} receiveShadow />
      <mesh position={[0, 2.05, -END + 0.02]}>
        <planeGeometry args={[1.3, 0.5]} />
        <meshStandardMaterial
          map={endSign}
          emissiveMap={endSign}
          emissive="#3d5c3a"
          emissiveIntensity={0.25}
          roughness={0.9}
        />
      </mesh>

      {/* service pipes running the length of the ceiling */}
      <mesh
        geometry={geo.pipe}
        material={m.steel}
        position={[-1.32, B.height - 0.16, -END / 2]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
      />
      <mesh
        geometry={geo.pipe2}
        material={m.steel}
        position={[-1.14, B.height - 0.24, -END / 2]}
        rotation={[Math.PI / 2, 0, 0]}
      />
      <mesh
        geometry={geo.pipe2}
        material={m.steel}
        position={[1.28, B.height - 0.19, -END / 2]}
        rotation={[Math.PI / 2, 0, 0]}
      />
    </group>
  )
}

/* Rubbish, dropped paper and abandoned crates, scattered with a fixed seed. */
function Debris() {
  const m = materials()
  const items = useMemo(() => {
    const r = rng(20240808)
    const out = []
    for (let i = 0; i < 46; i++) {
      const z = -1 - r() * (END - 2)
      const side = r() < 0.5 ? -1 : 1
      const x = side * (B.width / 2 - 0.12 - r() * 0.55)
      const kind = r()
      if (kind < 0.42) {
        out.push({ t: 'paper', x, z, rot: r() * Math.PI, s: 0.14 + r() * 0.16 })
      } else if (kind < 0.72) {
        out.push({ t: 'chunk', x, z, rot: r() * Math.PI, s: 0.04 + r() * 0.07 })
      } else if (kind < 0.9) {
        out.push({ t: 'crate', x: side * (B.width / 2 - 0.3), z, rot: (r() - 0.5) * 0.7, s: 0.3 + r() * 0.22 })
      } else {
        out.push({ t: 'can', x, z, rot: r() * Math.PI, s: 0.05 })
      }
    }
    return out
  }, [])

  const geo = useMemo(
    () => ({
      paper: new THREE.PlaneGeometry(1, 1.3),
      chunk: boxUV(1, 0.6, 1, 3),
      crate: boxUV(1, 0.8, 1.1, 1.6),
      can: new THREE.CylinderGeometry(0.5, 0.5, 1.6, 8),
    }),
    [],
  )

  const paperMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#8d8a7c', roughness: 0.95, side: THREE.DoubleSide }),
    [],
  )

  return (
    <group>
      {items.map((it, i) => {
        if (it.t === 'paper')
          return (
            <mesh
              key={i}
              geometry={geo.paper}
              material={paperMat}
              position={[it.x, 0.004, it.z]}
              rotation={[-Math.PI / 2, 0, it.rot]}
              scale={[it.s, it.s, it.s]}
              receiveShadow
            />
          )
        if (it.t === 'can')
          return (
            <mesh
              key={i}
              geometry={geo.can}
              material={m.steel}
              position={[it.x, it.s * 0.5, it.z]}
              rotation={[Math.PI / 2, 0, it.rot]}
              scale={[it.s, it.s, it.s]}
              castShadow
            />
          )
        const g = it.t === 'crate' ? geo.crate : geo.chunk
        const mat = it.t === 'crate' ? m.steel : m.wall
        return (
          <mesh
            key={i}
            geometry={g}
            material={mat}
            position={[it.x, it.s * (it.t === 'crate' ? 0.4 : 0.3), it.z]}
            rotation={[0, it.rot, 0]}
            scale={[it.s, it.s, it.s]}
            castShadow
            receiveShadow
          />
        )
      })}
    </group>
  )
}

/* Wayfinding paint that stopped being maintained a long time ago. */
function Signage() {
  const signs = useMemo(() => {
    const r = rng(991)
    const out = []
    for (let i = 0; i < DOORS.length + 2; i++) {
      const z = -3.4 - i * B.spacing * 0.98
      if (z < -END + 1) break
      const side = i % 2 === 0 ? 1 : -1
      out.push({
        z,
        side,
        y: 1.55 + (r() - 0.5) * 0.3,
        tex: makeSign(String(100 + i * 7), {
          w: 256,
          h: 256,
          bg: '#26281f',
          fg: '#7d7f6b',
          font: 'bold 118px "Courier New", monospace',
          seed: 400 + i,
        }),
      })
    }
    return out
  }, [])

  return (
    <group>
      {signs.map((s, i) => (
        <mesh
          key={i}
          position={[s.side * (B.width / 2 - 0.011), s.y, s.z]}
          rotation={[0, s.side === -1 ? Math.PI / 2 : -Math.PI / 2, 0]}
        >
          <planeGeometry args={[0.32, 0.32]} />
          <meshStandardMaterial map={s.tex} roughness={0.95} metalness={0} />
        </mesh>
      ))}
    </group>
  )
}

export default function Corridor() {
  return (
    <group>
      <Entrance />
      <Shell />
      <Debris />
      <Signage />
      {TUBES.map((t, i) => (
        <Tube key={i} z={t.z} seed={t.seed} />
      ))}
      {DOORS.map((d) => (
        <Door key={d.index} door={d} />
      ))}
    </group>
  )
}

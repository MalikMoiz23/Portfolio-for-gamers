import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { B } from '../layout'
import { finish } from './materials'
import { damp } from './util'
import { cached, grain } from '../canvasfx'
import { useStore } from '../store'
import RoomShell from './RoomShell'
import { Pendant, CoveTrim, RoomLights } from './RoomCommon'

/* ============================================================================
 * THE CONTACT ROOM — a reception
 * ----------------------------------------------------------------------------
 * A front desk facing the door and a row of engraved plates behind it, one per
 * way of getting hold of me. Click a plate and it opens.
 *
 * Plates rather than a printed board because a plate is obviously a thing you
 * press. The room is the last one in the building and its whole job is to make
 * the next step unmissable.
 * ========================================================================== */

const PLATE_W = 1.34
const PLATE_H = 0.44
const PLATE_GAP = 0.13

/* ---- the plates ---------------------------------------------------------- */

const PW = 620
const PH = 204

function makePlate(link, accent) {
  const c = document.createElement('canvas')
  c.width = PW
  c.height = PH
  const ctx = c.getContext('2d')

  // brushed brass: a vertical gradient plus fine horizontal grain
  const g = ctx.createLinearGradient(0, 0, 0, PH)
  g.addColorStop(0, '#2a2b33')
  g.addColorStop(0.45, '#3b3d47')
  g.addColorStop(1, '#23242b')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, PW, PH)
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  ctx.lineWidth = 1
  for (let y = 0; y < PH; y += 3) {
    ctx.beginPath()
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(PW, y + 0.5)
    ctx.stroke()
  }

  ctx.strokeStyle = `${accent}66`
  ctx.lineWidth = 3
  ctx.strokeRect(10, 10, PW - 20, PH - 20)

  ctx.fillStyle = accent
  ctx.font = '20px Consolas, "Cascadia Mono", monospace'
  ctx.fillText(String(link.label ?? '').toUpperCase(), 40, 68)

  ctx.fillStyle = '#eef2f8'
  ctx.font = 'bold 33px "Segoe UI", system-ui, sans-serif'
  ctx.fillText(link.value ?? '', 40, 122)

  if (link.href) {
    ctx.fillStyle = accent
    ctx.font = 'bold 19px Consolas, monospace'
    ctx.textAlign = 'right'
    ctx.fillText('OPEN  →', PW - 40, 160)
    ctx.textAlign = 'left'
  }

  grain(ctx, PW, PH, 0.4, true)

  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

function Plates({ links, accent }) {
  const texes = cached(`contact:plates:${accent}`, () => links.map((l) => makePlate(l, accent)))
  const [hover, setHover] = useState(-1)
  const refs = useRef([])
  const mats = useRef([])

  const n = links.length
  const total = n * PLATE_H + (n - 1) * PLATE_GAP
  const top = 1.92 + total / 2 - PLATE_H / 2

  useFrame((s, dt) => {
    for (let i = 0; i < n; i++) {
      const g = refs.current[i]
      const m = mats.current[i]
      const on = i === hover
      /* The INNER group, whose position is an offset. Animating the outer one's
       * position.x damped it toward 0 — the doorway wall, not "no offset" — and
       * the whole rack drifted off the back wall. The outer group is rotated
       * -90° about y, so inner +z is out toward the viewer. */
      if (g) g.position.z = damp(g.position.z, on ? 0.035 : 0, 9, dt)
      if (m) m.emissiveIntensity = damp(m.emissiveIntensity, on ? 0.55 : 0.16, 8, dt)
    }
  })

  const cursor = (v) => () => {
    document.body.style.cursor = v
  }

  return (
    <group>
      {links.map((l, i) => (
        // outer group: where the plate is bolted up, never animated
        <group key={i} position={[B.roomD - 0.06, top - i * (PLATE_H + PLATE_GAP), 0]} rotation={[0, -Math.PI / 2, 0]}>
          {/* inner group: the press offset, which is what moves */}
          <group ref={(el) => (refs.current[i] = el)}>
          <mesh position={[0, 0, -0.016]} castShadow>
            <boxGeometry args={[PLATE_W + 0.04, PLATE_H + 0.04, 0.03]} />
            <meshStandardMaterial color="#171b22" roughness={0.4} metalness={0.8} envMapIntensity={1.5} />
          </mesh>
          <mesh
            onClick={(e) => {
              e.stopPropagation()
              if (l.href) window.open(l.href, '_blank', 'noopener,noreferrer')
            }}
            onPointerOver={(e) => {
              e.stopPropagation()
              setHover(i)
              if (l.href) document.body.style.cursor = 'pointer'
            }}
            onPointerOut={() => {
              setHover(-1)
              document.body.style.cursor = 'auto'
            }}
          >
            <planeGeometry args={[PLATE_W, PLATE_H]} />
            <meshStandardMaterial
              ref={(m) => (mats.current[i] = m)}
              map={texes[i]}
              emissiveMap={texes[i]}
              emissive="#ffffff"
              emissiveIntensity={0.16}
              roughness={0.5}
              metalness={0.35}
              envMapIntensity={1.4}
            />
          </mesh>
          {/* four fixings, so it reads as bolted up rather than printed on */}
          {[-1, 1].map((sx) =>
            [-1, 1].map((sy) => (
              <mesh key={`${sx}${sy}`} position={[sx * (PLATE_W / 2 - 0.05), sy * (PLATE_H / 2 - 0.06), 0.012]}>
                <sphereGeometry args={[0.011, 8, 6]} />
                <meshStandardMaterial color="#9aa2ac" roughness={0.3} metalness={1} envMapIntensity={1.7} />
              </mesh>
            )),
          )}
          </group>
        </group>
      ))}
      <mesh position={[B.roomD - 0.05, top + PLATE_H / 2 + 0.16, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[PLATE_W + 0.04, 0.016]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
    </group>
  )
}

/* ---- the desk ------------------------------------------------------------ */

function Desk({ mats, accent }) {
  return (
    <group position={[B.roomD * 0.58, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
      {/* a counter with a raised front, the way a reception desk is built */}
      <mesh material={mats.wood} position={[0, 0.54, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.5, 1.08, 0.64]} />
      </mesh>
      <mesh material={mats.trim} position={[0, 1.11, 0.02]} castShadow>
        <boxGeometry args={[2.62, 0.06, 0.76]} />
      </mesh>
      <mesh position={[0, 0.98, 0.33]}>
        <planeGeometry args={[2.4, 0.012]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>

      {/* a phone, a card holder and a guest book */}
      <group position={[-0.72, 1.14, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.3, 0.07, 0.22]} />
          <meshStandardMaterial color="#14181f" roughness={0.5} metalness={0.4} />
        </mesh>
        <mesh position={[0, 0.07, -0.02]} rotation={[0, 0, 0.06]} castShadow>
          <boxGeometry args={[0.26, 0.06, 0.07]} />
          <meshStandardMaterial color="#1b2029" roughness={0.6} metalness={0.2} />
        </mesh>
      </group>

      <group position={[0.62, 1.15, 0.04]}>
        <mesh castShadow>
          <boxGeometry args={[0.26, 0.02, 0.19]} />
          <meshStandardMaterial color="#20252e" roughness={0.6} />
        </mesh>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} position={[0, 0.021 + i * 0.004, 0]} rotation={[0, i * 0.03, 0]}>
            <boxGeometry args={[0.2, 0.003, 0.12]} />
            <meshStandardMaterial color="#d8d2c4" roughness={0.85} />
          </mesh>
        ))}
      </group>

      <mesh position={[0.02, 1.15, 0.06]} rotation={[0, 0.12, 0]} castShadow>
        <boxGeometry args={[0.4, 0.035, 0.3]} />
        <meshStandardMaterial color="#3a2f26" roughness={0.75} />
      </mesh>
      <mesh position={[0.02, 1.169, 0.06]} rotation={[0, 0.12, 0]}>
        <boxGeometry args={[0.36, 0.004, 0.26]} />
        <meshStandardMaterial color="#ded8c8" roughness={0.9} />
      </mesh>
    </group>
  )
}

/* A pair of chairs for whoever is waiting, and a plant. */
function Waiting({ mats, accent }) {
  return (
    <group>
      {[-1.35, -0.35].map((z, i) => (
        <group key={z} position={[B.roomD * 0.26, 0, z]} rotation={[0, -Math.PI / 2 + (i ? 0.12 : -0.1), 0]}>
          <mesh position={[0, 0.44, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.5, 0.07, 0.48]} />
            <meshStandardMaterial color="#232a34" roughness={0.82} metalness={0.1} />
          </mesh>
          <mesh position={[0, 0.72, -0.21]} rotation={[-0.14, 0, 0]} castShadow>
            <boxGeometry args={[0.48, 0.5, 0.06]} />
            <meshStandardMaterial color="#232a34" roughness={0.82} metalness={0.1} />
          </mesh>
          {[-0.2, 0.2].map((x) =>
            [-0.19, 0.19].map((zz) => (
              <mesh key={`${x}${zz}`} material={mats.trim} position={[x, 0.2, zz]} castShadow>
                <cylinderGeometry args={[0.016, 0.016, 0.42, 8]} />
              </mesh>
            )),
          )}
        </group>
      ))}

      {/* side table with a lamp-lit plant */}
      <group position={[B.roomD * 0.26, 0, -0.85]}>
        <mesh material={mats.wood} position={[0, 0.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.4, 0.04, 0.4]} />
        </mesh>
        <mesh material={mats.trim} position={[0, 0.25, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.04, 0.48, 10]} />
        </mesh>
        <mesh position={[0, 0.63, 0]} castShadow>
          <cylinderGeometry args={[0.11, 0.08, 0.22, 14]} />
          <meshStandardMaterial color="#2a3038" roughness={0.7} metalness={0.2} />
        </mesh>
        {Array.from({ length: 6 }, (_, i) => (
          <mesh
            key={i}
            position={[Math.cos((i / 6) * Math.PI * 2) * 0.1, 0.92, Math.sin((i / 6) * Math.PI * 2) * 0.1]}
            rotation={[0, (i / 6) * Math.PI * 2, 0.25]}
            castShadow
          >
            <planeGeometry args={[0.1, 0.44]} />
            <meshStandardMaterial color="#2c4535" roughness={0.8} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/* The room's closing line, stencilled over the way out. */
function Sendoff({ text, accent }) {
  const tex = cached(`contact:sendoff:${accent}`, () => {
    const c = document.createElement('canvas')
    c.width = 900
    c.height = 200
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.font = '25px "Segoe UI", system-ui, sans-serif'
    ctx.fillStyle = '#c9d3e2'
    ctx.textAlign = 'center'
    const words = String(text ?? '').split(/\s+/)
    let line = ''
    let y = 60
    for (const w of words) {
      const next = line ? `${line} ${w}` : w
      if (ctx.measureText(next).width > 820 && line) {
        ctx.fillText(line, c.width / 2, y)
        y += 40
        line = w
      } else line = next
    }
    if (line) ctx.fillText(line, c.width / 2, y)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  })

  return (
    <mesh position={[0.06, 2.62, 0]} rotation={[0, Math.PI / 2, 0]}>
      <planeGeometry args={[2.7, 0.6]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} opacity={0.85} />
    </mesh>
  )
}

/* ---- the room ------------------------------------------------------------ */

export default function ContactRoom({ room }) {
  const accent = room.accent
  const lightsOn = useStore((s) => s.lightsOn)
  const mats = finish()

  const links = useMemo(() => {
    for (const b of room.blocks ?? []) if (b.kind === 'links') return b.items ?? []
    return []
  }, [room])

  const sendoff = useMemo(() => {
    for (const b of room.blocks ?? []) if (b.kind === 'text') return b.body
    return ''
  }, [room])

  return (
    <group>
      <RoomShell mats={mats} />
      <Plates links={links} accent={accent} />
      <Desk mats={mats} accent={accent} />
      <Waiting mats={mats} accent={accent} />
      <Sendoff text={sendoff} accent={accent} />
      <Pendant accent={accent} lightsOn={lightsOn} x={B.roomD * 0.32} z={1.8} />
      <CoveTrim accent={accent} />
      <RoomLights
        accent={accent}
        feature={[B.roomD - 2.0, 2.3, 0]}
        task={[B.roomD * 0.55, 1.5, -0.6]}
      />
    </group>
  )
}

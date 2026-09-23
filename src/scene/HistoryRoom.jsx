import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { B } from '../layout'
import { finish } from './materials'
import { damp } from './util'
import { cached, grain } from '../canvasfx'
import { state, useStore, openDrawer } from '../store'
import RoomShell from './RoomShell'
import { Pendant, CoveTrim, RoomLights } from './RoomCommon'

/* ============================================================================
 * THE HISTORY ROOM — an archive
 * ----------------------------------------------------------------------------
 * A bank of oak filing drawers, one per entry, and the same entries as cards on
 * a rail along the far wall. Pull a drawer and its card comes forward and lights
 * up; pull another and the first slides back.
 *
 * The drawers are the point. A timeline printed on a wall is a list; a drawer
 * you open is a record you went and found, which is what a work history is.
 * ========================================================================== */

const CARD_W = 1.22
const CARD_H = 1.5
const CARD_Y = 1.62

/* ---- the cards ----------------------------------------------------------- */

const CW = 460
const CH = 566

function makeCard(entry, accent, index) {
  const c = document.createElement('canvas')
  c.width = CW
  c.height = CH
  const ctx = c.getContext('2d')

  ctx.fillStyle = '#b3ad9d'
  ctx.fillRect(0, 0, CW, CH)

  // a printed index card: ruled lines, a punch hole, a coloured tab
  ctx.strokeStyle = '#9d9585'
  ctx.lineWidth = 1
  for (let y = 150; y < CH - 40; y += 30) {
    ctx.beginPath()
    ctx.moveTo(40, y + 0.5)
    ctx.lineTo(CW - 34, y + 0.5)
    ctx.stroke()
  }
  ctx.strokeStyle = '#d9a0a0'
  ctx.beginPath()
  ctx.moveTo(72, 40)
  ctx.lineTo(72, CH - 30)
  ctx.stroke()

  ctx.fillStyle = accent
  ctx.fillRect(0, 0, CW, 14)
  ctx.fillRect(CW - 120, 0, 110, 40)

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 18px Consolas, monospace'
  ctx.textAlign = 'center'
  ctx.fillText(String(index + 1).padStart(2, '0'), CW - 65, 28)
  ctx.textAlign = 'left'

  ctx.fillStyle = '#4a4538'
  ctx.font = '17px Consolas, "Cascadia Mono", monospace'
  ctx.fillText(entry.when ?? '', 90, 66)

  ctx.fillStyle = '#16140f'
  ctx.font = 'bold 27px "Segoe UI", system-ui, sans-serif'
  ctx.fillText(entry.what ?? '', 90, 104)

  ctx.fillStyle = '#332f26'
  ctx.font = '20px "Segoe UI", system-ui, sans-serif'
  ctx.fillText(entry.where ?? '', 90, 136)

  ctx.fillStyle = '#3d392e'
  ctx.font = '17px "Segoe UI", system-ui, sans-serif'
  const words = String(entry.body ?? '').split(/\s+/)
  let line = ''
  let y = 182
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (ctx.measureText(next).width > CW - 130 && line) {
      ctx.fillText(line, 90, y)
      y += 30
      line = w
    } else line = next
  }
  if (line) ctx.fillText(line, 90, y)

  // punch hole at the foot, like a card that lives on a rod
  ctx.fillStyle = '#9a9384'
  ctx.beginPath()
  ctx.arc(CW / 2, CH - 36, 13, 0, Math.PI * 2)
  ctx.fill()

  grain(ctx, CW, CH, 0.7, true)

  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

function CardRail({ entries, accent }) {
  const open = useStore((s) => s.openDrawer)
  const texes = cached(`hist:cards:${accent}`, () => entries.map((e, i) => makeCard(e, accent, i)))
  const refs = useRef([])
  const mats = useRef([])

  const n = entries.length
  const step = CARD_W + 0.16
  const start = -((n - 1) * step) / 2

  useFrame((s, dt) => {
    for (let i = 0; i < n; i++) {
      const g = refs.current[i]
      const m = mats.current[i]
      if (!g) continue
      const sel = i === open
      /* This animates the INNER group, whose position is an offset from the
       * card's place on the rail. Driving the outer group's position.x instead
       * damped it toward 0 — which is not "no offset", it is the doorway wall,
       * so every card slid off the back wall and out of the room.
       *
       * The outer group is rotated -90° about y, so the inner +z points at the
       * viewer: that is the direction a card comes forward. */
      g.position.z = damp(g.position.z, sel ? 0.18 : 0, 7, dt)
      g.position.y = damp(g.position.y, sel ? 0.1 : 0, 7, dt)
      // low: the card is paper, and the wall light does the work. Higher and
      // the selected one blows out before it looks selected.
      if (m) m.emissiveIntensity = damp(m.emissiveIntensity, sel ? 0.3 : open < 0 ? 0.13 : 0.04, 6, dt)
    }
  })

  return (
    <group>
      {/* the rail itself */}
      <mesh position={[B.roomD - 0.09, CARD_Y + CARD_H / 2 + 0.07, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <boxGeometry args={[n * step + 0.2, 0.035, 0.05]} />
        <meshStandardMaterial color="#6d747f" roughness={0.35} metalness={0.95} envMapIntensity={1.6} />
      </mesh>
      {entries.map((e, i) => (
        // outer group: where the card lives on the rail, never animated
        <group key={i} position={[B.roomD - 0.07, CARD_Y, start + i * step]} rotation={[0, -Math.PI / 2, 0]}>
          {/* inner group: the offset, which is what moves */}
          <group ref={(el) => (refs.current[i] = el)}>
            <mesh position={[0, 0, -0.012]}>
              <planeGeometry args={[CARD_W + 0.05, CARD_H + 0.05]} />
              <meshStandardMaterial color="#20242c" roughness={0.6} metalness={0.4} />
            </mesh>
            <mesh>
              <planeGeometry args={[CARD_W, CARD_H]} />
              <meshStandardMaterial
                ref={(m) => (mats.current[i] = m)}
                map={texes[i]}
                emissiveMap={texes[i]}
                emissive="#ffffff"
                emissiveIntensity={0.2}
                roughness={0.88}
                metalness={0}
              />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  )
}

/* ---- the drawers --------------------------------------------------------- */

/* One drawer per entry. Clicking pulls it out; clicking again pushes it back,
 * and opening another closes whatever was open — a bank where every drawer is
 * hanging out reads as a burglary, not an archive. */
function Cabinet({ entries, mats, accent }) {
  const open = useStore((s) => s.openDrawer)
  const [hover, setHover] = useState(-1)
  const refs = useRef([])

  const labels = cached(`hist:labels:${accent}`, () =>
    entries.map((e) => {
      const c = document.createElement('canvas')
      c.width = 256
      c.height = 64
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#ddd6c6'
      ctx.fillRect(0, 0, 256, 64)
      ctx.fillStyle = accent
      ctx.fillRect(0, 0, 6, 64)
      ctx.fillStyle = '#332f26'
      ctx.font = 'bold 22px Consolas, monospace'
      ctx.fillText(String(e.when ?? '').slice(0, 14), 18, 40)
      const t = new THREE.CanvasTexture(c)
      t.colorSpace = THREE.SRGBColorSpace
      return t
    }),
  )

  useFrame((s, dt) => {
    entries.forEach((_, i) => {
      const g = refs.current[i]
      if (!g) return
      const want = i === open ? 0.46 : i === hover ? 0.06 : 0
      g.position.z = damp(g.position.z, want, 8, dt)
    })
  })

  const H = 0.34

  return (
    <group position={[B.roomD * 0.55, 0, -B.roomW / 2 + 0.36]} rotation={[0, Math.PI / 2, 0]}>
      {/* carcass */}
      <mesh material={mats.wood} position={[0, 0.78, -0.2]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 1.56, 0.68]} />
      </mesh>
      <mesh material={mats.trim} position={[0, 1.58, -0.2]}>
        <boxGeometry args={[1.56, 0.05, 0.72]} />
      </mesh>

      {entries.map((e, i) => (
        <group key={i} ref={(el) => (refs.current[i] = el)} position={[0, 0.28 + i * H, 0]}>
          <mesh material={mats.wood} castShadow>
            <boxGeometry args={[1.4, H - 0.03, 0.6]} />
          </mesh>
          {/* label holder and handle on the drawer face */}
          <mesh position={[0, 0.02, 0.305]}>
            <planeGeometry args={[0.6, 0.15]} />
            <meshStandardMaterial map={labels[i]} roughness={0.9} />
          </mesh>
          <mesh position={[0, -0.08, 0.32]} castShadow>
            <boxGeometry args={[0.3, 0.035, 0.045]} />
            <meshStandardMaterial color="#8b939d" roughness={0.32} metalness={0.95} envMapIntensity={1.6} />
          </mesh>
          <mesh
            position={[0, 0, 0.36]}
            onClick={(ev) => {
              ev.stopPropagation()
              openDrawer(i)
            }}
            onPointerOver={(ev) => {
              ev.stopPropagation()
              setHover(i)
              document.body.style.cursor = 'pointer'
            }}
            onPointerOut={() => {
              setHover(-1)
              document.body.style.cursor = 'auto'
            }}
          >
            <boxGeometry args={[1.4, H - 0.02, 0.12]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/* A reading table with a lamp and a stack of folders. */
function ReadingTable({ mats, accent }) {
  return (
    <group position={[B.roomD * 0.46, 0, B.roomW / 2 - 0.85]}>
      <mesh material={mats.wood} position={[0, 0.74, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 0.06, 0.8]} />
      </mesh>
      {[-0.68, 0.68].map((x) =>
        [-0.32, 0.32].map((z) => (
          <mesh key={`${x}${z}`} material={mats.wood} position={[x, 0.37, z]} castShadow>
            <boxGeometry args={[0.07, 0.72, 0.07]} />
          </mesh>
        )),
      )}
      {/* folders, slightly askew */}
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          position={[-0.3 + i * 0.05, 0.79 + i * 0.016, 0.05 - i * 0.03]}
          rotation={[0, 0.1 - i * 0.09, 0]}
          castShadow
        >
          <boxGeometry args={[0.44, 0.014, 0.32]} />
          <meshStandardMaterial color={['#8a7a54', '#7d6f52', '#8e8060'][i]} roughness={0.85} />
        </mesh>
      ))}
      {/* a banker's lamp, the archive cliché, and none the worse for it */}
      <group position={[0.5, 0.77, -0.16]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.09, 0.1, 0.03, 16]} />
          <meshStandardMaterial color="#2b2f38" roughness={0.4} metalness={0.85} />
        </mesh>
        <mesh position={[0, 0.16, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.3, 8]} />
          <meshStandardMaterial color="#2b2f38" roughness={0.4} metalness={0.9} />
        </mesh>
        <mesh position={[0, 0.31, 0]} rotation={[Math.PI, 0, 0]} castShadow>
          <cylinderGeometry args={[0.15, 0.15, 0.1, 18, 1, true]} />
          <meshStandardMaterial color="#1c4030" emissive={accent} emissiveIntensity={0.18} roughness={0.5} metalness={0.4} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  )
}

/* ---- the room ------------------------------------------------------------ */

export default function HistoryRoom({ room }) {
  const accent = room.accent
  const lightsOn = useStore((s) => s.lightsOn)
  const mats = finish()

  const entries = useMemo(() => {
    for (const b of room.blocks ?? []) if (b.kind === 'timeline') return b.items ?? []
    return []
  }, [room])

  return (
    <group>
      <RoomShell mats={mats} />
      <CardRail entries={entries} accent={accent} />
      <Cabinet entries={entries} mats={mats} accent={accent} />
      <ReadingTable mats={mats} accent={accent} />
      <Pendant accent={accent} lightsOn={lightsOn} x={B.roomD * 0.38} z={1.6} />
      <CoveTrim accent={accent} />
      <RoomLights
        accent={accent}
        feature={[B.roomD - 2.2, 2.4, 0]}
        task={[B.roomD * 0.46 + 0.5, 1.15, B.roomW / 2 - 1.0]}
      />
    </group>
  )
}

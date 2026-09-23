import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { B } from '../layout'
import { finish } from './materials'
import { damp } from './util'
import { cached, grain } from '../canvasfx'
import { nav, state, useStore, toggleGauges } from '../store'
import RoomShell from './RoomShell'
import { Pendant, CoveTrim, RoomLights } from './RoomCommon'

/* ============================================================================
 * THE SKILLS ROOM — a workshop
 * ----------------------------------------------------------------------------
 * Pegboard over a workbench, tools hung on it, and the skill levels as a rack
 * of backlit gauges on the far wall. Click the bench lamp and the gauges sweep
 * up from zero, one after another.
 *
 * The sweep is not decoration. A bar chart that is simply THERE reads as a
 * graphic; one you switch on and watch fill reads as a measurement, which is
 * what a skill level is pretending to be.
 * ========================================================================== */

const GAUGE_W = 2.9
const GAUGE_H = 1.5
const GAUGE_Y = 1.72

/* ---- the gauge board ----------------------------------------------------- */

const GW = 1000
const GH = 520

/* Draws the rack at a given sweep. `fill` is 0..1 across the whole board and
 * each row lags the one above it, so the rack powers up top-down rather than
 * every needle moving at once. */
function paintGauges(ctx, bars, accent, fill, t) {
  ctx.fillStyle = '#0a0d14'
  ctx.fillRect(0, 0, GW, GH)

  // brushed panel
  ctx.strokeStyle = 'rgba(255,255,255,0.018)'
  ctx.lineWidth = 1
  for (let y = 0; y < GH; y += 3) {
    ctx.beginPath()
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(GW, y + 0.5)
    ctx.stroke()
  }

  ctx.fillStyle = accent
  ctx.fillRect(0, 0, GW, 4)
  ctx.font = 'bold 26px Consolas, "Cascadia Mono", monospace'
  ctx.fillStyle = accent
  ctx.fillText('SKILL LEVELS', 34, 56)
  ctx.font = '16px Consolas, monospace'
  ctx.fillStyle = fill > 0.02 ? '#7dffa4' : '#556070'
  ctx.textAlign = 'right'
  ctx.fillText(fill > 0.02 ? '● POWERED' : '○ STANDBY', GW - 34, 56)
  ctx.textAlign = 'left'

  const top = 96
  const rowH = (GH - top - 40) / Math.max(1, bars.length)

  bars.forEach((b, i) => {
    const y = top + i * rowH
    // each row starts a little after the one above it
    const lag = Math.max(0, Math.min(1, (fill - i * 0.07) / 0.55))
    const v = Math.max(0, Math.min(100, b.value ?? 0)) / 100
    const shown = v * lag

    ctx.font = '19px "Segoe UI", system-ui, sans-serif'
    ctx.fillStyle = '#c6d2e2'
    ctx.fillText(b.label ?? '', 34, y + 22)

    const tx = 34
    const tw = GW - 68
    const ty = y + 34
    const th = 15

    ctx.fillStyle = '#121824'
    ctx.beginPath()
    ctx.roundRect(tx, ty, tw, th, th / 2)
    ctx.fill()

    // tick marks every ten per cent, so the bar reads as a scale
    ctx.fillStyle = 'rgba(255,255,255,0.07)'
    for (let k = 1; k < 10; k++) ctx.fillRect(tx + (tw * k) / 10, ty + 3, 1, th - 6)

    if (shown > 0.001) {
      const g = ctx.createLinearGradient(tx, 0, tx + tw * shown, 0)
      g.addColorStop(0, `${accent}55`)
      g.addColorStop(1, accent)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.roundRect(tx, ty, Math.max(th, tw * shown), th, th / 2)
      ctx.fill()

      // the needle: a bright cap that flickers while it is still climbing
      const nx = tx + Math.max(th, tw * shown)
      ctx.fillStyle = '#ffffff'
      ctx.globalAlpha = lag < 0.999 ? 0.5 + Math.sin(t * 22 + i) * 0.35 : 0.65
      ctx.fillRect(nx - 3, ty - 4, 3, th + 8)
      ctx.globalAlpha = 1
    }

    ctx.font = '15px Consolas, monospace'
    ctx.fillStyle = shown > 0.001 ? accent : '#49566a'
    ctx.textAlign = 'right'
    ctx.fillText(String(Math.round(shown * 100)).padStart(3, '0'), GW - 34, y + 22)
    ctx.textAlign = 'left'
  })

  grain(ctx, GW, GH, 0.35, true)
}

function GaugeBoard({ bars, accent }) {
  const on = useStore((s) => s.gaugesOn)

  const gear = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = GW
    canvas.height = GH
    const ctx = canvas.getContext('2d')
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    texture.generateMipmaps = false
    texture.minFilter = THREE.LinearFilter
    return { canvas, ctx, texture }
  }, [])

  const fill = useRef(0)
  const lastPaint = useRef(-1)

  useFrame((s, dt) => {
    const want = on ? 1 : 0
    fill.current = damp(fill.current, want, 2.6, dt)
    // repaint only while the sweep is moving, then leave it alone
    const settled = Math.abs(fill.current - want) < 0.002
    if (settled && lastPaint.current === want) return
    if (settled) {
      fill.current = want
      lastPaint.current = want
    } else {
      lastPaint.current = -1
    }
    paintGauges(gear.ctx, bars, accent, fill.current, s.clock.elapsedTime)
    gear.texture.needsUpdate = true
  })

  return (
    <group position={[B.roomD - 0.05, GAUGE_Y, 0]} rotation={[0, -Math.PI / 2, 0]}>
      <mesh position={[0, 0, -0.03]}>
        <planeGeometry args={[GAUGE_W + 0.12, GAUGE_H + 0.12]} />
        <meshStandardMaterial color="#14181f" roughness={0.42} metalness={0.7} envMapIntensity={1.5} />
      </mesh>
      <mesh>
        <planeGeometry args={[GAUGE_W, GAUGE_H]} />
        <meshBasicMaterial map={gear.texture} toneMapped={false} />
      </mesh>
    </group>
  )
}

/* ---- the bench and its lamp ---------------------------------------------- */

/* The switch. A lamp on the bench rather than a button on a wall: the thing you
 * click should be a thing, and a workshop lamp is the obvious thing to reach
 * for when you want to see what you are doing. */
function BenchLamp({ accent }) {
  const on = useStore((s) => s.gaugesOn)
  const [hover, setHover] = useState(false)
  const shade = useRef()
  const glow = useRef()

  useFrame((s, dt) => {
    const want = on ? 2.6 : hover ? 0.9 : 0.35
    if (shade.current) shade.current.emissiveIntensity = damp(shade.current.emissiveIntensity, want, 7, dt)
    if (glow.current) glow.current.material.opacity = damp(glow.current.material.opacity, on ? 0.3 : 0.1, 7, dt)
  })

  return (
    <group position={[B.roomD - 0.95, 0.92, -1.55]}>
      <mesh position={[0, 0.02, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.11, 0.035, 16]} />
        <meshStandardMaterial color="#141820" roughness={0.45} metalness={0.8} />
      </mesh>
      <mesh position={[0.05, 0.24, 0]} rotation={[0, 0, -0.35]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, 0.44, 8]} />
        <meshStandardMaterial color="#141820" roughness={0.4} metalness={0.9} />
      </mesh>
      <group position={[0.22, 0.44, 0]} rotation={[0, 0, -1.15]}>
        <mesh castShadow>
          <coneGeometry args={[0.1, 0.15, 16, 1, true]} />
          <meshStandardMaterial color="#1a1f27" roughness={0.5} metalness={0.7} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -0.06, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.085, 16]} />
          <meshStandardMaterial ref={shade} color="#0d0b07" emissive="#ffd9a2" emissiveIntensity={0.35} toneMapped={false} />
        </mesh>
      </group>
      <mesh ref={glow} position={[0.22, 0.38, 0]}>
        <sphereGeometry args={[0.2, 12, 10]} />
        <meshBasicMaterial color="#ffd9a2" transparent opacity={0.1} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      {/* a switch you can actually hit */}
      <mesh
        position={[0.12, 0.3, 0]}
        onClick={(e) => {
          e.stopPropagation()
          toggleGauges()
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
        <boxGeometry args={[0.6, 0.7, 0.5]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </group>
  )
}

/* Pegboard with tools hung on it, over the bench. */
function Pegboard({ mats, accent }) {
  const holes = useMemo(() => {
    const t = document.createElement('canvas')
    t.width = t.height = 128
    const c = t.getContext('2d')
    c.fillStyle = '#2a2118'
    c.fillRect(0, 0, 128, 128)
    c.fillStyle = '#100c08'
    for (let y = 8; y < 128; y += 16) {
      for (let x = 8; x < 128; x += 16) {
        c.beginPath()
        c.arc(x, y, 3, 0, Math.PI * 2)
        c.fill()
      }
    }
    grain(c, 128, 128, 0.5, true)
    const tex = new THREE.CanvasTexture(t)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(7, 3)
    tex.anisotropy = 8
    return tex
  }, [])

  const steel = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#6c7480', roughness: 0.38, metalness: 0.9, envMapIntensity: 1.5 }),
    [],
  )
  const grip = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#7a2f22', roughness: 0.8, metalness: 0.05 }),
    [],
  )

  // a spanner, a hammer, pliers, a screwdriver, a square — read as silhouettes
  const tools = [-1.05, -0.6, -0.15, 0.32, 0.8]

  return (
    <group position={[B.roomD * 0.5, 0, -B.roomW / 2 + 0.02]}>
      <mesh position={[0, 1.72, 0]}>
        <planeGeometry args={[3.2, 1.35]} />
        <meshStandardMaterial map={holes} roughness={0.92} metalness={0} />
      </mesh>
      {tools.map((x, i) => (
        <group key={x} position={[x, 1.95 - (i % 2) * 0.28, 0.04]}>
          <mesh material={steel} castShadow>
            <boxGeometry args={[0.035, 0.34 + (i % 3) * 0.08, 0.02]} />
          </mesh>
          <mesh material={grip} position={[0, -0.22 - (i % 3) * 0.04, 0]} castShadow>
            <boxGeometry args={[0.05, 0.14, 0.03]} />
          </mesh>
        </group>
      ))}
      {/* jars of bits on a shelf under the board */}
      <mesh material={mats.wood} position={[0, 1.02, 0.09]} castShadow receiveShadow>
        <boxGeometry args={[3.2, 0.04, 0.2]} />
      </mesh>
      {[-1.2, -0.85, -0.5, 0.75, 1.1].map((x, i) => (
        <mesh key={x} position={[x, 1.1, 0.09]} castShadow>
          <cylinderGeometry args={[0.055, 0.055, 0.12, 12]} />
          <meshStandardMaterial
            color={['#2b3a2c', '#3a3226', '#26313a', '#33262f', '#2f3340'][i]}
            roughness={0.5}
            metalness={0.1}
          />
        </mesh>
      ))}
    </group>
  )
}

function Bench({ mats }) {
  return (
    <group position={[B.roomD * 0.5, 0, -B.roomW / 2 + 0.42]}>
      <mesh material={mats.wood} position={[0, 0.88, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.2, 0.07, 0.72]} />
      </mesh>
      {[-1.5, 1.5].map((x) => (
        <mesh key={x} material={mats.wood} position={[x, 0.44, 0]} castShadow>
          <boxGeometry args={[0.09, 0.85, 0.62]} />
        </mesh>
      ))}
      <mesh material={mats.trim} position={[0, 0.4, -0.3]}>
        <boxGeometry args={[2.9, 0.05, 0.06]} />
      </mesh>
      {/* a vice bolted to the end, because every bench has one */}
      <group position={[-1.22, 0.98, 0.04]}>
        <mesh castShadow>
          <boxGeometry args={[0.2, 0.12, 0.16]} />
          <meshStandardMaterial color="#3d4450" roughness={0.45} metalness={0.85} />
        </mesh>
        <mesh position={[0.16, 0, 0]} castShadow>
          <cylinderGeometry args={[0.016, 0.016, 0.22, 8]} rotation={[0, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#7b848f" roughness={0.35} metalness={1} />
        </mesh>
      </group>
    </group>
  )
}

/* The `list` block, on a clipboard by the door. */
function Clipboard({ items, accent }) {
  const tex = cached(`skills:clip:${accent}`, () => {
    const c = document.createElement('canvas')
    c.width = 360
    c.height = 480
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#aca698'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.fillStyle = '#3b3a34'
    ctx.font = 'bold 22px Consolas, monospace'
    ctx.fillText('ALSO IN THE BOX', 26, 56)
    ctx.fillStyle = accent
    ctx.fillRect(26, 68, 120, 3)
    ctx.font = '16px "Segoe UI", system-ui, sans-serif'
    let y = 108
    for (const it of items) {
      ctx.fillStyle = '#5a5850'
      ctx.fillText('•', 26, y)
      ctx.fillStyle = '#3b3a34'
      // wrap by hand: the clipboard is narrow
      const words = String(it).split(/\s+/)
      let line = ''
      for (const w of words) {
        const next = line ? `${line} ${w}` : w
        if (ctx.measureText(next).width > 280 && line) {
          ctx.fillText(line, 46, y)
          y += 22
          line = w
        } else line = next
      }
      if (line) ctx.fillText(line, 46, y)
      y += 42
    }
    grain(ctx, c.width, c.height, 0.6, true)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 8
    return t
  })

  return (
    <group position={[B.roomD * 0.34, 1.5, B.roomW / 2 - 0.03]} rotation={[0, Math.PI, 0]}>
      <mesh position={[0, 0, -0.012]} castShadow>
        <boxGeometry args={[0.44, 0.58, 0.02]} />
        <meshStandardMaterial color="#4a3a28" roughness={0.7} metalness={0.1} />
      </mesh>
      <mesh position={[0, -0.01, 0.002]}>
        <planeGeometry args={[0.39, 0.52]} />
        <meshStandardMaterial map={tex} roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.28, 0.01]} castShadow>
        <boxGeometry args={[0.16, 0.05, 0.03]} />
        <meshStandardMaterial color="#8b939d" roughness={0.35} metalness={0.95} />
      </mesh>
    </group>
  )
}

/* ---- the room ------------------------------------------------------------ */

export default function SkillsRoom({ room }) {
  const accent = room.accent
  const lightsOn = useStore((s) => s.lightsOn)
  const mats = finish()

  const bars = useMemo(() => {
    for (const b of room.blocks ?? []) if (b.kind === 'bars') return b.items ?? []
    return []
  }, [room])

  const listItems = useMemo(() => {
    for (const b of room.blocks ?? []) if (b.kind === 'list') return b.items ?? []
    return []
  }, [room])

  return (
    <group>
      <RoomShell mats={mats} />
      <GaugeBoard bars={bars} accent={accent} />
      <Pegboard mats={mats} accent={accent} />
      <Bench mats={mats} />
      <BenchLamp accent={accent} />
      <Clipboard items={listItems} accent={accent} />
      <Pendant accent={accent} lightsOn={lightsOn} x={B.roomD * 0.4} z={1.7} />
      <CoveTrim accent={accent} />
      <RoomLights
        accent={accent}
        feature={[B.roomD - 2.0, 2.4, 0]}
        task={[B.roomD - 0.8, 1.35, -1.5]}
      />
    </group>
  )
}

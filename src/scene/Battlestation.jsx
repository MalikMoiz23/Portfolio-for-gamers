import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { B } from '../layout'
import { materials } from './materials'
import { boxUV, damp } from './util'
import { makeEditorScreen, makeTerminalScreen, makeStatsScreen, makeLaptopScreen } from '../screens'
import { cached } from '../canvasfx'

/* ============================================================================
 * THE BATTLESTATION
 * ----------------------------------------------------------------------------
 * The development setup in the ABOUT room. Three live monitors on an arc, a
 * laptop off to the side, a tower with RGB fans, a keyboard on an underglow,
 * headphones, a lamp and the cable mess that comes with all of it.
 *
 * Local space: +x is along the desk (right as you face it), +z is out toward
 * the room, y is up. The desk top surface sits at y = TOP.
 *
 * The four screens repaint on a canvas and re-upload as textures. Only ONE
 * screen is allowed to repaint per frame — whichever is furthest past its own
 * interval — so the upload cost is bounded no matter how many panels there are.
 * ========================================================================== */

const TOP = 0.8 // desk surface height
const DESK_W = 2.62
const DESK_D = 0.88

/* Sits just off the wall behind the desk so the neon has something to wash. */
const hsl = new THREE.Color()

function rgb(t, offset) {
  return hsl.setHSL(((t * 0.055 + offset) % 1 + 1) % 1, 0.92, 0.56)
}

/* ---- textures ------------------------------------------------------------ */

/* A keycap grid, drawn once. Cheaper and sharper than 80 boxes, and at the
 * angle anyone actually sees this from, indistinguishable. */
function makeKeycaps() {
  const c = document.createElement('canvas')
  c.width = 640
  c.height = 224
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#0a0d12'
  ctx.fillRect(0, 0, c.width, c.height)

  // per-row key widths in units; the last row is mostly spacebar
  const rows = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
    [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
    [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25],
    [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.75],
    [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.25, 1.25],
  ]
  const pad = 8
  const gap = 3
  const rowH = (c.height - pad * 2 - gap * 4) / 5

  rows.forEach((row, r) => {
    const units = row.reduce((a, b) => a + b, 0)
    const unitW = (c.width - pad * 2 - gap * (row.length - 1)) / units
    let x = pad
    const y = pad + r * (rowH + gap)
    row.forEach((u, k) => {
      const w = u * unitW
      // keycap: dark top, a lighter bevel, then a slice of the RGB wash
      ctx.fillStyle = '#171c25'
      ctx.beginPath()
      ctx.roundRect(x, y, w, rowH, 3)
      ctx.fill()
      ctx.fillStyle = '#202734'
      ctx.beginPath()
      ctx.roundRect(x + 1.5, y + 1.5, w - 3, rowH - 5, 2.5)
      ctx.fill()

      const hue = ((x / c.width) * 0.75 + r * 0.03) % 1
      ctx.fillStyle = `hsl(${hue * 360}deg 95% 60% / 0.5)`
      ctx.fillRect(x + 3, y + rowH - 3.5, w - 6, 2)

      // a legend mark, not a letter — real letters at this size turn to mush
      ctx.fillStyle = `hsl(${hue * 360}deg 90% 72% / 0.55)`
      ctx.fillRect(x + 5, y + 5, Math.min(7, w - 10), 2)
      x += w + gap
    })
  })

  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

function makeDeskmat(accent) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 320
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#080a0d'
  ctx.fillRect(0, 0, c.width, c.height)

  ctx.strokeStyle = 'rgba(255,255,255,0.035)'
  ctx.lineWidth = 1
  for (let x = 0; x < c.width; x += 26) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, c.height)
    ctx.stroke()
  }
  for (let y = 0; y < c.height; y += 26) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(c.width, y)
    ctx.stroke()
  }

  ctx.strokeStyle = accent
  ctx.lineWidth = 6
  ctx.strokeRect(6, 6, c.width - 12, c.height - 12)

  ctx.font = 'bold 34px Consolas, monospace'
  ctx.fillStyle = 'rgba(255,255,255,0.07)'
  ctx.textAlign = 'center'
  ctx.fillText('</>', c.width / 2, c.height / 2 + 12)

  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

function makeWallSign(accent) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, c.width, c.height)
  ctx.font = 'bold 150px Consolas, "Cascadia Mono", monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = accent
  ctx.shadowBlur = 42
  ctx.fillStyle = '#ffffff'
  ctx.fillText('</>', c.width / 2, c.height / 2 - 14)
  ctx.shadowBlur = 18
  ctx.font = '26px Consolas, monospace'
  ctx.fillStyle = accent
  ctx.fillText('SHIP  IT', c.width / 2, c.height / 2 + 82)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/* ---- pieces -------------------------------------------------------------- */

function Monitor({ screen, w, h, x, y, z, ry, tilt = -0.05, onScreenClick = null }) {
  const neckH = y - h / 2 - TOP

  /* The panel's UV, flipped to top-down, is how an interactive screen turns a
   * click in the world into a pixel on its own canvas. Three's V runs from the
   * bottom; every 2D canvas counts from the top. */
  const tap = onScreenClick
    ? (e) => {
        e.stopPropagation()
        if (e.uv) onScreenClick(e.uv.x, 1 - e.uv.y)
      }
    : undefined
  const cursor = (v) => () => {
    document.body.style.cursor = v
  }

  return (
    <group position={[x, 0, z]} rotation={[0, ry, 0]}>
      {/* foot and neck */}
      <mesh position={[0, TOP + 0.008, -0.02]} castShadow>
        <boxGeometry args={[w * 0.42, 0.016, 0.17]} />
        <meshStandardMaterial color="#14171c" roughness={0.45} metalness={0.8} envMapIntensity={1.2} />
      </mesh>
      <mesh position={[0, TOP + neckH / 2, 0]} castShadow>
        <boxGeometry args={[0.05, neckH, 0.045]} />
        <meshStandardMaterial color="#14171c" roughness={0.4} metalness={0.9} envMapIntensity={1.3} />
      </mesh>

      <group position={[0, y, 0]} rotation={[tilt, 0, 0]}>
        {/* chassis: a shallow box, so the panel has a back when seen from the side */}
        <mesh position={[0, 0, -0.026]} castShadow receiveShadow>
          <boxGeometry args={[w + 0.026, h + 0.026, 0.05]} />
          <meshStandardMaterial color="#0c0e12" roughness={0.42} metalness={0.85} envMapIntensity={1.3} />
        </mesh>
        {/* the live panel, and the click surface when the screen is interactive.
            Named so the panel can be found in the scene graph — a UV on this
            mesh is the only honest way to aim at something drawn on it. */}
        <mesh
          name={onScreenClick ? 'interactive-panel' : ''}
          position={[0, 0, 0.002]}
          onClick={tap}
          onPointerOver={onScreenClick ? cursor('pointer') : undefined}
          onPointerOut={onScreenClick ? cursor('auto') : undefined}
        >
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial map={screen.texture} toneMapped={false} />
        </mesh>
        {/* a hairline of bleed around the bezel */}
        <mesh position={[0, 0, -0.001]}>
          <planeGeometry args={[w + 0.016, h + 0.016]} />
          <meshBasicMaterial color={screen.glow} toneMapped={false} transparent opacity={0.5} />
        </mesh>
      </group>
    </group>
  )
}

function Tower({ accent }) {
  const fans = [useRef(), useRef(), useRef()]
  const strip = useRef()
  const inner = useRef()

  useFrame((s) => {
    const t = s.clock.elapsedTime
    fans.forEach((f, i) => {
      if (!f.current) return
      f.current.rotation.x = t * (2.2 + i * 0.35)
      const c = rgb(t, i * 0.13)
      f.current.children[0].material.color.copy(c)
    })
    if (strip.current) strip.current.material.color.copy(rgb(t, 0.5))
    if (inner.current) inner.current.material.color.copy(rgb(t, 0.25))
  })

  return (
    <group position={[1.62, 0, -0.1]} rotation={[0, -0.34, 0]}>
      {/* case */}
      <mesh position={[0, 0.26, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.25, 0.52, 0.5]} />
        <meshStandardMaterial color="#0a0c10" roughness={0.38} metalness={0.9} envMapIntensity={1.4} />
      </mesh>
      {/* interior wash, seen through the glass */}
      <mesh ref={inner} position={[0.11, 0.26, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.44, 0.44]} />
        <meshBasicMaterial color={accent} toneMapped={false} transparent opacity={0.16} />
      </mesh>
      {/* three fans, spinning, each on its own hue */}
      {[0.1, 0.26, 0.42].map((y, i) => (
        <group key={y} ref={fans[i]} position={[0.1, y, -0.13]} rotation={[0, Math.PI / 2, 0]}>
          <mesh>
            <torusGeometry args={[0.052, 0.008, 6, 20]} />
            <meshBasicMaterial color={accent} toneMapped={false} />
          </mesh>
          <mesh>
            <boxGeometry args={[0.085, 0.012, 0.004]} />
            <meshStandardMaterial color="#1a1e24" roughness={0.6} />
          </mesh>
        </group>
      ))}
      {/* tinted glass over the lot */}
      <mesh position={[0.126, 0.26, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.46, 0.46]} />
        <meshStandardMaterial color="#05070a" roughness={0.08} metalness={0.2} transparent opacity={0.4} envMapIntensity={2.4} />
      </mesh>
      {/* front power strip */}
      <mesh ref={strip} position={[0, 0.26, 0.252]}>
        <planeGeometry args={[0.02, 0.4]} />
        <meshBasicMaterial color={accent} toneMapped={false} />
      </mesh>
      {/* the tower's own point light is gone: the RGB strip and fans are
          emissive and the desk underglow already lights this corner */}
    </group>
  )
}

function Chair({ accent }) {
  const m = materials()
  const g = useMemo(
    () => ({
      seat: boxUV(0.54, 0.09, 0.5, 2),
      back: boxUV(0.46, 0.74, 0.09, 2),
      bolster: boxUV(0.08, 0.66, 0.15, 3),
      head: boxUV(0.3, 0.15, 0.1, 3),
      arm: boxUV(0.07, 0.03, 0.26, 3),
      spoke: boxUV(0.3, 0.035, 0.05, 3),
    }),
    [],
  )
  /* Lifted well off black. At #111419 the chair was a silhouette in front of
   * the monitors — in a room lit almost entirely by neon, a matte dark surface
   * has nothing to reflect, so it has to start lighter to read as an object. */
  const seatMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#1e242e', roughness: 0.84, metalness: 0.12, envMapIntensity: 1.1 }),
    [],
  )
  const pipeMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: accent, toneMapped: false }),
    [accent],
  )

  return (
    <group position={[0.05, 0, 1.02]} rotation={[0, Math.PI, 0]}>
      <mesh geometry={g.seat} material={seatMat} position={[0, 0.47, 0]} castShadow receiveShadow />
      <group position={[0, 0, -0.22]} rotation={[-0.16, 0, 0]}>
        <mesh geometry={g.back} material={seatMat} position={[0, 0.86, 0]} castShadow />
        {[-0.25, 0.25].map((x) => (
          <mesh key={x} geometry={g.bolster} material={seatMat} position={[x, 0.86, 0.03]} castShadow />
        ))}
        <mesh geometry={g.head} material={seatMat} position={[0, 1.27, 0.01]} castShadow />
        {/* accent piping, which is the only reason anyone buys these chairs */}
        {[-0.19, 0.19].map((x) => (
          <mesh key={x} position={[x, 0.86, 0.048]} material={pipeMat}>
            <planeGeometry args={[0.014, 0.62]} />
          </mesh>
        ))}
        <mesh position={[0, 1.2, 0.048]} material={pipeMat}>
          <planeGeometry args={[0.36, 0.014]} />
        </mesh>
      </group>
      <mesh position={[0, 0.515, 0.252]} material={pipeMat}>
        <planeGeometry args={[0.46, 0.012]} />
      </mesh>
      {[-0.31, 0.31].map((x) => (
        <mesh key={x} geometry={g.arm} material={seatMat} position={[x, 0.63, -0.02]} castShadow />
      ))}
      <mesh position={[0, 0.27, 0]} material={m.steel} castShadow>
        <cylinderGeometry args={[0.035, 0.035, 0.4, 10]} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <group key={i} rotation={[0, (i / 5) * Math.PI * 2, 0]}>
          <mesh geometry={g.spoke} material={m.steel} position={[0.14, 0.07, 0]} castShadow />
          <mesh position={[0.28, 0.035, 0]} material={m.steel} castShadow>
            <sphereGeometry args={[0.035, 8, 6]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Lamp({ accent }) {
  const light = useRef()
  useFrame((s) => {
    if (light.current) light.current.intensity = 5.4 + Math.sin(s.clock.elapsedTime * 9.3) * 0.16
  })
  return (
    <group position={[-1.14, TOP, -0.3]}>
      <mesh position={[0, 0.01, 0]} castShadow>
        <cylinderGeometry args={[0.085, 0.095, 0.02, 16]} />
        <meshStandardMaterial color="#12151a" roughness={0.4} metalness={0.85} envMapIntensity={1.3} />
      </mesh>
      <mesh position={[0, 0.19, 0]} rotation={[0, 0, 0.12]} castShadow>
        <cylinderGeometry args={[0.011, 0.011, 0.36, 8]} />
        <meshStandardMaterial color="#12151a" roughness={0.4} metalness={0.9} />
      </mesh>
      <group position={[0.14, 0.38, 0.06]} rotation={[0, 0, -0.9]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.009, 0.009, 0.3, 8]} />
          <meshStandardMaterial color="#12151a" roughness={0.4} metalness={0.9} />
        </mesh>
        <group position={[0, -0.16, 0]} rotation={[0.5, 0, 0]}>
          <mesh castShadow>
            <coneGeometry args={[0.07, 0.11, 14, 1, true]} />
            <meshStandardMaterial color="#171b21" roughness={0.5} metalness={0.7} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, -0.045, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.058, 14]} />
            <meshBasicMaterial color="#ffd9a0" toneMapped={false} />
          </mesh>
        </group>
      </group>
      {/* A point light rather than a spot: a spot's target lives in world space,
          and this lamp is three groups deep, so aiming one here is guesswork. */}
      <pointLight ref={light} position={[0.3, 0.32, 0.18]} color="#ffcf9a" intensity={5.4} distance={2.9} decay={2.1} />
    </group>
  )
}

function Headphones({ accent }) {
  return (
    <group position={[-1.12, TOP, 0.12]}>
      <mesh position={[0, 0.01, 0]}>
        <cylinderGeometry args={[0.055, 0.06, 0.018, 14]} />
        <meshStandardMaterial color="#12151a" roughness={0.45} metalness={0.8} />
      </mesh>
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.009, 0.009, 0.26, 8]} />
        <meshStandardMaterial color="#12151a" roughness={0.45} metalness={0.9} />
      </mesh>
      <group position={[0, 0.3, 0]}>
        <mesh rotation={[0, 0.5, 0]}>
          <torusGeometry args={[0.085, 0.012, 8, 22, Math.PI]} />
          <meshStandardMaterial color="#14181e" roughness={0.6} metalness={0.4} />
        </mesh>
        {[-1, 1].map((s) => (
          <group key={s} position={[Math.cos(0.5) * 0.085 * s, 0, -Math.sin(0.5) * 0.085 * s]}>
            <mesh rotation={[0, 0.5, Math.PI / 2]}>
              <cylinderGeometry args={[0.048, 0.048, 0.034, 16]} />
              <meshStandardMaterial color="#12161c" roughness={0.7} metalness={0.3} />
            </mesh>
            <mesh rotation={[0, 0.5 + (s > 0 ? 0 : Math.PI), Math.PI / 2]} position={[0.018 * s, 0, 0.01 * s]}>
              <torusGeometry args={[0.036, 0.004, 6, 18]} />
              <meshBasicMaterial color={accent} toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}

function Cables() {
  const geos = useMemo(() => {
    const paths = [
      [
        [0, 1.0, -0.3],
        [0.05, 0.86, -0.42],
        [0.02, 0.5, -0.46],
        [0.3, 0.1, -0.45],
        [1.4, 0.03, -0.3],
      ],
      [
        [-0.82, 0.96, -0.16],
        [-0.86, 0.84, -0.4],
        [-0.7, 0.42, -0.46],
        [-0.2, 0.06, -0.46],
      ],
      [
        [0.84, 0.96, -0.16],
        [0.92, 0.82, -0.4],
        [1.1, 0.44, -0.44],
        [1.5, 0.12, -0.38],
      ],
    ]
    return paths.map((p) => {
      const curve = new THREE.CatmullRomCurve3(p.map(([x, y, z]) => new THREE.Vector3(x, y, z)))
      return new THREE.TubeGeometry(curve, 26, 0.0075, 5, false)
    })
  }, [])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0b0d10', roughness: 0.92 }), [])
  return (
    <group>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} material={mat} />
      ))}
    </group>
  )
}

/* ---- the whole desk ------------------------------------------------------ */

/* `centre` replaces the editor on the big monitor — PROJECTS hands in a live
 * desktop there. `onSit` adds a click target over the chair. `position` and
 * `rotation` place the whole desk, so ABOUT can stand it against a side wall
 * and PROJECTS can face it back down the room. */
export default function Battlestation({
  accent = '#00e5ff',
  lightsOn = false,
  position = [B.roomD * 0.68, 0, -B.roomW / 2 + 0.62],
  rotation = [0, 0, 0],
  centre = null,
  onCentreClick = null,
  onSit = null,
}) {
  const m = materials()

  /* Built once for the life of the page, not once per visit. These are four
   * canvases plus their textures, and rebuilding them on the frame a door opens
   * was a visible freeze. Only one desk is ever mounted at a time, so sharing
   * them between ABOUT and PROJECTS costs nothing. */
  const screens = cached('bs:screens', () => {
    const list = [makeEditorScreen(), makeStatsScreen(), makeTerminalScreen(), makeLaptopScreen()]
    // paint frame zero now, so nothing is ever a black rectangle
    list.forEach((s) => s.draw(0))
    return list
  })

  // the centre panel is either this desk's own editor or whatever was handed in
  const big = centre ?? screens[0]

  const keycaps = cached('bs:keycaps', makeKeycaps)
  const deskmat = cached(`bs:deskmat:${accent}`, () => makeDeskmat(accent))
  const wallSign = cached(`bs:sign:${accent}`, () => makeWallSign(accent))
  // nothing is disposed: it is all cached, and the next visit wants it back

  /* When a caller supplies the centre panel it also owns repainting it — the
   * desktop's draw takes the open window as well as the clock, so it cannot go
   * through this loop. The editor is then not on screen at all, so skip it. */
  const paint = useMemo(() => (centre ? screens.slice(1) : screens), [centre, screens])

  // one repaint per frame at most: whichever screen is furthest past its period
  const due = useRef(paint.map((s, i) => -i / (s.fps * paint.length)))
  const underglow = useRef()
  const matEdge = useRef()
  const signMat = useRef()
  const channelMat = useRef()
  const screenLight = useRef()

  /* How much of the decorative neon is showing. Room lights on and it goes to
   * zero — RGB trim reads as a lit object in the dark and as a stuck LED under
   * a ceiling light. The monitors are exempt: those are supposed to be on. */
  const neon = useRef(1)

  useFrame((s, dt) => {
    const t = s.clock.elapsedTime
    neon.current = damp(neon.current, lightsOn ? 0 : 1, 3.4, dt)
    const k = neon.current
    let pick = -1
    let worst = 0
    for (let i = 0; i < paint.length; i++) {
      due.current[i] += dt
      const over = due.current[i] - 1 / paint[i].fps
      if (over > worst) {
        worst = over
        pick = i
      }
    }
    if (pick >= 0) {
      due.current[pick] = 0
      paint[pick].draw(t)
    }

    if (underglow.current) underglow.current.color.copy(rgb(t, 0)).multiplyScalar(k)
    if (matEdge.current) matEdge.current.opacity = 0.1 * k
    if (matEdge.current) matEdge.current.color.copy(rgb(t, 0.33))
    if (signMat.current) signMat.current.opacity = k
    if (channelMat.current) channelMat.current.color.set(accent).multiplyScalar(k)
    // the panels are the brightest thing in the room; let them wash the desk
    if (screenLight.current) screenLight.current.intensity = 3.4 + Math.sin(t * 2.7) * 0.35
  })

  const deskTopGeo = useMemo(() => boxUV(DESK_W, 0.055, DESK_D, 1.8), [])
  const legGeo = useMemo(() => boxUV(0.05, TOP - 0.055, DESK_D - 0.12, 2.4), [])

  const deskWood = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#272c35', roughness: 0.48, metalness: 0.4, envMapIntensity: 1.6 }),
    [],
  )

  return (
    /* Pushed deep into the room on purpose. Entering stops the camera at 66% of
     * the room depth on the centre line, so anything parked near the doorway
     * ends up behind your shoulder; at 0.68 the desk sits level with you and a
     * head turn brings the whole thing into frame. */
    <group position={position} rotation={rotation}>
      {/* ---- desk ---- */}
      <mesh geometry={deskTopGeo} material={deskWood} position={[0, TOP - 0.028, 0]} castShadow receiveShadow />
      {[-1.24, 1.24].map((x) => (
        <mesh key={x} geometry={legGeo} material={m.steel} position={[x, (TOP - 0.055) / 2, 0]} castShadow />
      ))}
      {/* cable tray slung under the back edge */}
      <mesh position={[0, 0.22, -0.3]} material={m.steel}>
        <boxGeometry args={[2.0, 0.035, 0.16]} />
      </mesh>
      {/* the strip under the front lip — the light that makes the floor glow */}
      <mesh position={[0, TOP - 0.062, DESK_D / 2 - 0.03]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[DESK_W - 0.2, 0.03]} />
        <meshBasicMaterial ref={underglow} color={accent} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 0.62, 0.42]} color={accent} intensity={2.4} distance={2.6} decay={2} />

      {/* ---- monitors ---- */}
      {/* The centre panel takes its size from the screen when one is supplied:
          the desktop is ultrawide and would be stretched onto a 16:10 monitor.
          The side monitors move out to clear it. */}
      <Monitor
        screen={big}
        w={big.w ?? 0.82}
        h={big.h ?? 0.48}
        x={0}
        // a taller panel needs lifting or its bottom edge sits in the keyboard
        y={centre ? 1.32 : 1.24}
        z={-0.3}
        ry={0}
        onScreenClick={onCentreClick}
      />
      <Monitor screen={screens[1]} w={0.6} h={0.36} x={centre ? -1.0 : -0.84} y={1.16} z={-0.14} ry={centre ? 0.6 : 0.46} />
      <Monitor screen={screens[2]} w={0.6} h={0.36} x={centre ? 1.0 : 0.84} y={1.16} z={-0.14} ry={centre ? -0.6 : -0.46} />
      <pointLight ref={screenLight} position={[0, 1.2, 0.34]} color="#3f7fc4" intensity={3.4} distance={4.2} decay={2} />

      {/* ---- laptop, open, on the right ---- */}
      <group position={[1.08, TOP, 0.2]} rotation={[0, -0.62, 0]}>
        <mesh position={[0, 0.006, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.34, 0.012, 0.24]} />
          <meshStandardMaterial color="#15181d" roughness={0.4} metalness={0.85} envMapIntensity={1.3} />
        </mesh>
        <mesh position={[0, 0.014, 0.02]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.3, 0.14]} />
          <meshBasicMaterial map={keycaps} toneMapped={false} />
        </mesh>
        <group position={[0, 0.012, -0.12]} rotation={[-1.22, 0, 0]}>
          <mesh position={[0, 0.115, -0.004]} castShadow>
            <boxGeometry args={[0.34, 0.23, 0.008]} />
            <meshStandardMaterial color="#12151a" roughness={0.4} metalness={0.85} />
          </mesh>
          <mesh position={[0, 0.115, 0.002]}>
            <planeGeometry args={[0.31, 0.2]} />
            <meshBasicMaterial map={screens[3].texture} toneMapped={false} />
          </mesh>
        </group>
      </group>

      {/* ---- deskmat, keyboard, mouse ---- */}
      <mesh position={[-0.06, TOP + 0.001, 0.14]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[1.12, 0.46]} />
        <meshStandardMaterial map={deskmat} roughness={0.95} metalness={0} />
      </mesh>
      {/* an RGB halo bled out around the mat, additive so it reads as light */}
      <mesh position={[-0.06, TOP + 0.0006, 0.14]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.62, 40]} />
        <meshBasicMaterial ref={matEdge} color={accent} toneMapped={false} transparent opacity={0.1} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      <group position={[-0.2, TOP, 0.16]} rotation={[0, 0.06, 0]}>
        <mesh position={[0, 0.013, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.46, 0.026, 0.16]} />
          <meshStandardMaterial color="#0d1015" roughness={0.55} metalness={0.6} />
        </mesh>
        <mesh position={[0, 0.0275, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.43, 0.14]} />
          <meshBasicMaterial map={keycaps} toneMapped={false} />
        </mesh>
      </group>

      <mesh
        position={[0.34, TOP + 0.02, 0.2]}
        rotation={[0, -0.2, 0]}
        scale={[0.036, 0.021, 0.056]}
        castShadow
      >
        <sphereGeometry args={[1, 14, 10]} />
        <meshStandardMaterial color="#10141a" roughness={0.42} metalness={0.5} />
      </mesh>

      {/* mug */}
      <group position={[0.62, TOP, -0.06]}>
        <mesh position={[0, 0.05, 0]} castShadow>
          <cylinderGeometry args={[0.042, 0.037, 0.1, 16]} />
          <meshStandardMaterial color="#1b1f26" roughness={0.65} metalness={0.15} />
        </mesh>
        <mesh position={[0.052, 0.055, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.024, 0.006, 6, 14]} />
          <meshStandardMaterial color="#1b1f26" roughness={0.65} />
        </mesh>
        <mesh position={[0, 0.099, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.036, 14]} />
          <meshStandardMaterial color="#120c08" roughness={0.25} metalness={0.1} />
        </mesh>
      </group>

      <Headphones accent={accent} />
      <Lamp accent={accent} />
      <Tower accent={accent} />
      <Chair accent={accent} />
      {/* Sit target. A box over the seat and backrest rather than the chair
          meshes themselves: the chair is a dozen small parts and asking anyone
          to hit the 90mm-thick seat cushion is not an invitation. */}
      {onSit && (
        <mesh
          position={[0.05, 0.72, 1.02]}
          onClick={(e) => {
            e.stopPropagation()
            onSit()
          }}
          onPointerOver={(e) => {
            e.stopPropagation()
            document.body.style.cursor = 'pointer'
          }}
          onPointerOut={() => {
            document.body.style.cursor = 'auto'
          }}
        >
          <boxGeometry args={[0.72, 1.4, 0.72]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      )}
      <Cables />

      {/* ---- the wall behind ---- */}
      <mesh position={[0, 1.95, -0.6]}>
        <planeGeometry args={[0.88, 0.44]} />
        <meshBasicMaterial ref={signMat} map={wallSign} transparent toneMapped={false} />
      </mesh>
      {/* LED channel running the width of the bay */}
      <mesh position={[0, 2.35, -0.598]}>
        <planeGeometry args={[2.9, 0.022]} />
        <meshBasicMaterial ref={channelMat} color={accent} toneMapped={false} />
      </mesh>
    </group>
  )
}

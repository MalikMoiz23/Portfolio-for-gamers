import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { B } from '../layout'
import { finish } from './materials'
import { damp, clamp } from './util'
import { makeBoardPages } from '../board'
import { cached, grain } from '../canvasfx'
import { state, nav, useStore, toggleLights, setAboutPage } from '../store'
import RoomShell from './RoomShell'
import Battlestation from './Battlestation'

/* ============================================================================
 * THE ABOUT ROOM
 * ----------------------------------------------------------------------------
 * Every other room in this building is the same concrete cell with different
 * things bolted to the walls. This one is finished: plaster over a wood
 * wainscot, carpet, framed work on the wall, a pendant you can actually switch
 * on. Walking in is meant to feel like leaving the building.
 *
 * Local space, same as every room: +x runs away from the corridor (0 is the
 * doorway wall, B.roomD the far wall), z runs along the corridor centred on the
 * door, y is up.
 *
 * LIGHTS
 * The pendant drives `lightsOn` in the store. Nothing here is swapped when it
 * flips — every surface keeps its material and the room lerps `color` on each
 * one between a night value and a day value. That is why the plaster, carpet
 * and wood maps are baked near mid-grey: a map that is already dark cannot be
 * driven light, and one that is already light has no night to go back to.
 * ========================================================================== */


/* Board geometry. The aspect must match PAGE_W/PAGE_H in board.js or the type
 * on the panels comes out stretched. */
const BOARD_W = 2.6
const BOARD_H = 1.65
const BOARD_GAP = 0.14
const BOARD_Y = 1.62

/* Scratch for the ambient-light lerp. Its own instance: `tone` has scratch of
 * its own and both run in the same frame. */
const cAmb = new THREE.Color()

/* ---- procedural art ------------------------------------------------------ */

/* Three abstract prints. Deliberately not photographs: a photo on a wall in a
 * scene lit like this reads as a texture error, a flat graphic reads as a
 * print. */
function makeArt(kind, accent) {
  const c = document.createElement('canvas')
  c.width = 420
  c.height = 560
  const ctx = c.getContext('2d')

  ctx.fillStyle = '#12151c'
  ctx.fillRect(0, 0, c.width, c.height)

  if (kind === 0) {
    // concentric arcs, off-centre
    const g = ctx.createLinearGradient(0, 0, 0, c.height)
    g.addColorStop(0, '#1b2230')
    g.addColorStop(1, '#0d1016')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, c.width, c.height)
    for (let i = 8; i >= 0; i--) {
      ctx.beginPath()
      ctx.arc(c.width * 0.62, c.height * 0.64, 40 + i * 34, 0, Math.PI * 2)
      ctx.strokeStyle = i % 2 ? `${accent}${i < 4 ? 'cc' : '55'}` : '#e8edf522'
      ctx.lineWidth = i % 2 ? 3 : 10
      ctx.stroke()
    }
    ctx.fillStyle = accent
    ctx.beginPath()
    ctx.arc(c.width * 0.62, c.height * 0.64, 22, 0, Math.PI * 2)
    ctx.fill()
  } else if (kind === 1) {
    // a stack of bars, like a printed data plate
    ctx.fillStyle = '#0e1219'
    ctx.fillRect(0, 0, c.width, c.height)
    for (let i = 0; i < 16; i++) {
      const w = 40 + ((i * 97) % 260)
      ctx.fillStyle = i % 3 === 0 ? accent : `#dfe6f0${i % 2 ? '30' : '18'}`
      ctx.fillRect(48, 54 + i * 29, w, 12)
    }
    ctx.strokeStyle = `${accent}66`
    ctx.lineWidth = 2
    ctx.strokeRect(30, 30, c.width - 60, c.height - 60)
  } else {
    // a single diagonal split, the cheapest thing that still looks composed
    ctx.fillStyle = '#0b0e14'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.beginPath()
    ctx.moveTo(0, c.height)
    ctx.lineTo(c.width, c.height * 0.24)
    ctx.lineTo(c.width, c.height)
    ctx.closePath()
    ctx.fillStyle = `${accent}22`
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(0, c.height)
    ctx.lineTo(c.width, c.height * 0.24)
    ctx.strokeStyle = accent
    ctx.lineWidth = 4
    ctx.stroke()
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `#e6ecf6${i % 4 ? '14' : '2a'}`
      ctx.fillRect(38 + i * 13, 60, 5, 120 + ((i * 53) % 150))
    }
  }

  // paper grain, so the print is not a flat fill
  grain(ctx, c.width, c.height, 0.55)

  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/* A chevron for the board's paging buttons. Drawn once and mirrored on x for
 * the other side, so there is one texture rather than two. */
function makeChevron(accent) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, 128, 128)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 13
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.shadowColor = accent
  ctx.shadowBlur = 22
  ctx.beginPath()
  ctx.moveTo(78, 28)
  ctx.lineTo(44, 64)
  ctx.lineTo(78, 100)
  ctx.stroke()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/* Patterned area rug. The carpet underneath is plain; this is what stops the
 * floor reading as one flat sheet. */
function makeRug(accent) {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 384
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#20262f'
  ctx.fillRect(0, 0, c.width, c.height)

  ctx.strokeStyle = `${accent}44`
  ctx.lineWidth = 3
  for (let i = 0; i < 5; i++) {
    const p = 26 + i * 15
    ctx.strokeRect(p, p, c.width - p * 2, c.height - p * 2)
  }
  ctx.fillStyle = `${accent}22`
  for (let i = 0; i < 9; i++) {
    ctx.beginPath()
    ctx.arc(c.width / 2, c.height / 2, 120 - i * 12, 0, Math.PI * 2)
    ctx.lineWidth = 2
    ctx.strokeStyle = i % 2 ? `${accent}30` : '#ffffff10'
    ctx.stroke()
  }
  grain(ctx, c.width, c.height, 0.85, true)

  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/* ---- the board ----------------------------------------------------------- */

/* The panels ride on a rail behind a fixed frame. The frame is the aperture:
 * the panel materials carry two clipping planes pinned to its inner edges, so a
 * panel sliding past genuinely disappears behind the surround instead of being
 * cross-faded. The planes live in world space, so they are rebuilt from the
 * frame's world matrix every frame — the whole room is translated and rotated
 * into the corridor, and a plane set once at mount would be in the wrong place.
 */
function PagedBoard({ room, accent }) {
  // four full-size sheets; rebuilding them per visit was the worst single
  // stall when the ABOUT door opened
  const pages = cached(`about:pages:${room.id}`, () => makeBoardPages(room, room.pages ?? []))
  const n = pages.length
  const page = useStore((s) => s.aboutPage)

  const chevron = cached(`about:chevron:${accent}`, () => makeChevron(accent))
  const clips = useMemo(() => [new THREE.Plane(), new THREE.Plane()], [])

  const panelMats = useMemo(
    () =>
      pages.map(
        (p) =>
          new THREE.MeshStandardMaterial({
            map: p.texture,
            emissiveMap: p.texture,
            emissive: new THREE.Color('#ffffff'),
            emissiveIntensity: 0.22,
            roughness: 0.78,
            metalness: 0,
            clippingPlanes: clips,
          }),
      ),
    [pages, clips],
  )

  /* One material per dot: each animates its own opacity, so they cannot share.
   * Built once — building them inside the render would leak a full set every
   * time the page changes. */
  const dotMats = useMemo(
    () =>
      pages.map(
        () => new THREE.MeshBasicMaterial({ color: new THREE.Color(accent), toneMapped: false, transparent: true, opacity: 0.28 }),
      ),
    [pages, accent],
  )

  // pages and the chevron are cached for the life of the page; only the
  // materials built around them belong to this mount
  useEffect(
    () => () => {
      panelMats.forEach((m) => m.dispose())
      dotMats.forEach((m) => m.dispose())
    },
    [panelMats, dotMats],
  )

  // leaving and coming back should not replay the slide from panel one
  useEffect(() => () => setAboutPage(0), [])

  const aperture = useRef()
  const rail = useRef()
  const dots = useRef([])
  const step = BOARD_W + BOARD_GAP

  // scratch, so the per-frame plane rebuild allocates nothing
  const tmp = useMemo(
    () => ({ q: new THREE.Quaternion(), right: new THREE.Vector3(), p: new THREE.Vector3() }),
    [],
  )

  useFrame((s, dt) => {
    if (rail.current) {
      rail.current.position.x = damp(rail.current.position.x, -page * step, 7, dt)
    }
    if (aperture.current) {
      aperture.current.getWorldQuaternion(tmp.q)
      // the board's local +x in world space; the aperture edges lie along it
      tmp.right.set(1, 0, 0).applyQuaternion(tmp.q)
      aperture.current.getWorldPosition(tmp.p)
      // keep what is to the RIGHT of the left edge...
      clips[0].setFromNormalAndCoplanarPoint(tmp.right, tmp.p.clone().addScaledVector(tmp.right, -BOARD_W / 2))
      // ...and to the LEFT of the right edge
      clips[1].setFromNormalAndCoplanarPoint(
        tmp.right.clone().negate(),
        tmp.p.clone().addScaledVector(tmp.right, BOARD_W / 2),
      )
    }
    const t = s.clock.elapsedTime
    dots.current.forEach((d, i) => {
      if (!d) return
      const on = i === page
      d.material.opacity = damp(d.material.opacity, on ? 1 : 0.28, 8, dt)
      d.scale.setScalar(damp(d.scale.x, on ? 1.5 + Math.sin(t * 2.4) * 0.08 : 1, 8, dt))
    })
  })

  const cursor = (v) => () => {
    document.body.style.cursor = v
  }
  const go = (delta) => (e) => {
    e.stopPropagation()
    setAboutPage(clamp(state.aboutPage + delta, 0, n - 1))
  }
  const jump = (i) => (e) => {
    e.stopPropagation()
    setAboutPage(i)
  }

  return (
    // sits on the far wall, facing back down the room
    <group position={[B.roomD - 0.06, BOARD_Y, 0]} rotation={[0, -Math.PI / 2, 0]}>
      {/* backing board, so the gap between panels is not a hole */}
      <mesh position={[0, 0, -0.03]}>
        <planeGeometry args={[BOARD_W + 0.02, BOARD_H + 0.02]} />
        <meshStandardMaterial color="#080a0e" roughness={0.9} metalness={0.1} />
      </mesh>

      {/* the aperture marker: empty, invisible, exists only so the clipping
          planes have a transform to read */}
      <group ref={aperture} />

      <group ref={rail}>
        {pages.map((p, i) => (
          <mesh key={i} material={panelMats[i]} position={[i * step, 0, 0]}>
            <planeGeometry args={[BOARD_W, BOARD_H]} />
          </mesh>
        ))}
      </group>

      {/* surround: four bars, drawn after the panels and proud of them */}
      {[
        { pos: [0, BOARD_H / 2 + 0.05, 0.02], size: [BOARD_W + 0.2, 0.1] },
        { pos: [0, -BOARD_H / 2 - 0.05, 0.02], size: [BOARD_W + 0.2, 0.1] },
        { pos: [-BOARD_W / 2 - 0.05, 0, 0.02], size: [0.1, BOARD_H + 0.2] },
        { pos: [BOARD_W / 2 + 0.05, 0, 0.02], size: [0.1, BOARD_H + 0.2] },
      ].map((b, i) => (
        <mesh key={i} position={b.pos}>
          <planeGeometry args={b.size} />
          <meshStandardMaterial color="#14181f" roughness={0.4} metalness={0.7} envMapIntensity={1.6} />
        </mesh>
      ))}
      {/* a lit reveal down each side of the surround */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (BOARD_W / 2 + 0.102), 0, 0.022]}>
          <planeGeometry args={[0.012, BOARD_H + 0.2]} />
          <meshBasicMaterial color={accent} toneMapped={false} />
        </mesh>
      ))}

      {/* paging buttons */}
      {[-1, 1].map((dir) => {
        const enabled = dir === -1 ? page > 0 : page < n - 1
        return (
          <group key={dir} position={[dir * (BOARD_W / 2 + 0.34), 0, 0.02]}>
            <mesh
              onClick={go(dir)}
              onPointerOver={cursor('pointer')}
              onPointerOut={cursor('auto')}
            >
              <planeGeometry args={[0.36, 0.5]} />
              <meshStandardMaterial
                color={enabled ? '#1b212b' : '#0c0f14'}
                roughness={0.45}
                metalness={0.6}
                envMapIntensity={enabled ? 1.4 : 0.4}
              />
            </mesh>
            {/* The chevron art has an accent glow baked into it, so a disabled
                arrow has to be knocked back hard — at half opacity it still
                bloomed and read as live. */}
            <mesh position={[0, 0, 0.004]} scale={[dir === -1 ? 1 : -1, 1, 1]} raycast={() => null}>
              <planeGeometry args={[0.26, 0.26]} />
              <meshBasicMaterial
                map={chevron}
                transparent
                toneMapped={false}
                color={enabled ? accent : '#141920'}
                opacity={enabled ? 1 : 0.35}
              />
            </mesh>
          </group>
        )
      })}

      {/* page dots */}
      <group position={[0, -BOARD_H / 2 - 0.22, 0.02]}>
        {pages.map((p, i) => (
          <mesh
            key={i}
            ref={(el) => (dots.current[i] = el)}
            material={dotMats[i]}
            position={[(i - (n - 1) / 2) * 0.13, 0, 0]}
            onClick={jump(i)}
            onPointerOver={cursor('pointer')}
            onPointerOut={cursor('auto')}
          >
            <circleGeometry args={[0.022, 14]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/* ---- the pendant, and the switch ----------------------------------------- */

function Pendant({ accent, lightsOn }) {
  const [hover, setHover] = useState(false)
  const bulbMat = useRef()
  const lamp = useRef()
  const halo = useRef()

  useFrame((s, dt) => {
    const t = s.clock.elapsedTime
    // off: a slow ember so it advertises itself as clickable. on: full output.
    const idle = 0.5 + Math.sin(t * 1.6) * 0.25
    const want = lightsOn ? 9 : (hover ? 1.6 : 0.55) * idle
    if (bulbMat.current) bulbMat.current.emissiveIntensity = damp(bulbMat.current.emissiveIntensity, want, 7, dt)
    if (lamp.current) lamp.current.intensity = damp(lamp.current.intensity, lightsOn ? 26 : 0.9, 5, dt)
    if (halo.current) halo.current.material.opacity = damp(halo.current.material.opacity, lightsOn ? 0.22 : hover ? 0.16 : 0.07, 7, dt)
  })

  const over = (e) => {
    e.stopPropagation()
    setHover(true)
    document.body.style.cursor = 'pointer'
  }
  const out = () => {
    setHover(false)
    document.body.style.cursor = 'auto'
  }
  const hit = (e) => {
    e.stopPropagation()
    toggleLights()
  }

  return (
    <group position={[5.25, 0, 2.0]}>
      {/* canopy and flex */}
      <mesh position={[0, B.roomH - 0.02, 0]}>
        <cylinderGeometry args={[0.055, 0.065, 0.04, 14]} />
        <meshStandardMaterial color="#171b22" roughness={0.4} metalness={0.8} />
      </mesh>
      <mesh position={[0, B.roomH - 0.36, 0]}>
        <cylinderGeometry args={[0.006, 0.006, 0.66, 6]} />
        <meshStandardMaterial color="#141820" roughness={0.9} />
      </mesh>

      {/* open drum shade */}
      <mesh position={[0, 2.62, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.15, 0.2, 20, 1, true]} />
        <meshStandardMaterial color="#1c212a" roughness={0.5} metalness={0.5} side={THREE.DoubleSide} envMapIntensity={1.5} />
      </mesh>

      {/* the bulb itself */}
      <mesh position={[0, 2.56, 0]}>
        <sphereGeometry args={[0.055, 16, 12]} />
        <meshStandardMaterial ref={bulbMat} color="#100d08" emissive="#ffd9a2" emissiveIntensity={0.55} toneMapped={false} />
      </mesh>
      <mesh ref={halo} position={[0, 2.56, 0]}>
        <sphereGeometry args={[0.17, 14, 10]} />
        <meshBasicMaterial color="#ffd9a2" toneMapped={false} transparent opacity={0.07} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <pointLight ref={lamp} position={[0, 2.5, 0]} color="#ffdcb0" intensity={0.9} distance={13} decay={1.7} />

      {/* pull chain, hanging where a hand would reach it */}
      <mesh position={[0.11, 2.3, 0]}>
        <cylinderGeometry args={[0.004, 0.004, 0.42, 5]} />
        <meshStandardMaterial color="#5a5f68" roughness={0.4} metalness={0.9} />
      </mesh>
      <mesh position={[0.11, 2.07, 0]}>
        <sphereGeometry args={[0.022, 10, 8]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={hover ? 1.4 : 0.5} toneMapped={false} roughness={0.3} metalness={0.7} />
      </mesh>

      {/* one generous invisible target over the whole fitting — a 55mm bulb is
          not something anyone should have to aim at */}
      <mesh position={[0, 2.38, 0]} onClick={hit} onPointerOver={over} onPointerOut={out}>
        <cylinderGeometry args={[0.3, 0.3, 0.85, 10]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </group>
  )
}

/* ---- dressing ------------------------------------------------------------ */

function Art({ accent }) {
  const arts = cached(`about:art:${accent}`, () => [0, 1, 2].map((k) => makeArt(k, accent)))

  const frameMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#15191f', roughness: 0.42, metalness: 0.65, envMapIntensity: 1.5 }),
    [],
  )
  const mount = [
    { x: 3.42, y: 1.94, w: 0.62, h: 0.82 },
    { x: 4.52, y: 2.02, w: 0.78, h: 0.62 },
    { x: 5.58, y: 1.9, w: 0.56, h: 0.74 },
  ]

  return (
    <group>
      {mount.map((m, i) => (
        /* The group is rotated PI, so local +z points back at the viewer. The
         * frame therefore has to sit at NEGATIVE local z to be behind the
         * print — at -0.012 with a 30mm box its front face landed 3mm proud and
         * hid the artwork completely. */
        <group key={i} position={[m.x, m.y, B.roomW / 2 - 0.02]} rotation={[0, Math.PI, 0]}>
          <mesh material={frameMat} position={[0, 0, -0.022]} castShadow>
            <boxGeometry args={[m.w + 0.075, m.h + 0.075, 0.032]} />
          </mesh>
          <mesh position={[0, 0, 0.002]}>
            <planeGeometry args={[m.w, m.h]} />
            <meshStandardMaterial map={arts[i]} emissiveMap={arts[i]} emissive="#ffffff" emissiveIntensity={0.14} roughness={0.85} />
          </mesh>
        </group>
      ))}
      {/* picture light, aimed at nothing in particular — it only has to put a
          falloff on the wall so three frames do not float in flat shade */}
      <pointLight position={[4.5, 2.72, B.roomW / 2 - 0.6]} color="#f0e4d0" intensity={3.2} distance={4.4} decay={2} />
    </group>
  )
}

function Plant() {
  const pot = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a2f38', roughness: 0.7, metalness: 0.2 }), [])
  const leaf = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#2f4a38', roughness: 0.75, metalness: 0, side: THREE.DoubleSide }),
    [],
  )
  const blades = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => ({
        rot: (i / 9) * Math.PI * 2,
        lean: 0.22 + (i % 3) * 0.13,
        len: 0.52 + ((i * 7) % 5) * 0.07,
      })),
    [],
  )

  return (
    <group position={[6.05, 0, B.roomW / 2 - 0.72]}>
      <mesh material={pot} position={[0, 0.17, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.16, 0.12, 0.34, 14]} />
      </mesh>
      <mesh material={pot} position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.165, 0.165, 0.03, 14]} />
      </mesh>
      {blades.map((b, i) => (
        <group key={i} rotation={[0, b.rot, 0]}>
          <mesh material={leaf} position={[0.07, 0.36 + b.len / 2, 0]} rotation={[0, 0, -b.lean]} castShadow>
            <planeGeometry args={[0.1, b.len]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Sideboard({ mats }) {
  return (
    <group position={[4.6, 0, B.roomW / 2 - 0.3]} rotation={[0, Math.PI, 0]}>
      <mesh material={mats.wood} position={[0, 0.62, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.55, 0.05, 0.42]} />
      </mesh>
      <mesh material={mats.wood} position={[0, 0.32, 0]} castShadow>
        <boxGeometry args={[1.45, 0.52, 0.36]} />
      </mesh>
      {[-0.62, 0.62].map((x) => (
        <mesh key={x} material={mats.trim} position={[x, 0.03, 0]}>
          <boxGeometry args={[0.1, 0.06, 0.34]} />
        </mesh>
      ))}
      {/* a row of books, because an empty sideboard reads as a prop */}
      {Array.from({ length: 7 }, (_, i) => (
        <mesh key={i} position={[-0.42 + i * 0.075, 0.76, 0.02]} rotation={[0, 0, (i % 3) * 0.035]} castShadow>
          <boxGeometry args={[0.045, 0.24 + (i % 4) * 0.03, 0.17]} />
          <meshStandardMaterial color={['#3b2a2a', '#26333f', '#2f3a2c', '#3a3340'][i % 4]} roughness={0.85} />
        </mesh>
      ))}
    </group>
  )
}

/* ---- the room ------------------------------------------------------------ */

export default function AboutRoom({ room }) {
  const accent = room.accent
  const lightsOn = useStore((s) => s.lightsOn)

  /* Shared with the lobby and the door reveals, and tinted once per frame by
   * Corridor — which is always mounted. This room must not tint it too, or two
   * writers fight over the same colour. */
  const mats = finish()
  const rugTex = cached(`about:rug:${accent}`, () => makeRug(accent))

  /* One material for all three cove strips, so the fade is a single write. */
  const trimMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color(accent), toneMapped: false, transparent: true }),
    [accent],
  )
  useEffect(() => () => trimMat.dispose(), [trimMat])
  const accentA = useRef()
  const accentB = useRef()
  const amb = useRef()
  const rugMat = useRef()

  useFrame((s) => {
    /* Damped in Rig and shared with the lobby, so the hall and the room never
     * disagree about what the switch is doing. Corridor tints the shared finish
     * materials; this room only handles what is its own. */
    const t = nav.lit
    if (rugMat.current) rugMat.current.color.setScalar(0.55 + t * 0.85)

    // the neon has no job once the ceiling light is on
    const breath = 0.8 + Math.sin(s.clock.elapsedTime * 0.9) * 0.12
    trimMat.color.set(accent).multiplyScalar(breath * 1.4 * (1 - t))
    trimMat.opacity = 1 - t * 0.92
    if (accentA.current) accentA.current.intensity = 7.5 * (1 - t)
    if (accentB.current) accentB.current.intensity = 6.0 * (1 - t)
    if (amb.current) {
      amb.current.intensity = 0.24 + t * 0.44
      amb.current.color.set(accent).lerp(cAmb.set('#fff2de'), t)
    }
  })

  const trimStrips = useMemo(
    () => [
      { pos: [B.roomD / 2, B.roomH - 0.12, -B.roomW / 2 + 0.014], rot: [0, 0, 0], size: [B.roomD - 0.4, 0.02] },
      { pos: [B.roomD / 2, B.roomH - 0.12, B.roomW / 2 - 0.014], rot: [0, Math.PI, 0], size: [B.roomD - 0.4, 0.02] },
      { pos: [B.roomD - 0.014, B.roomH - 0.12, 0], rot: [0, -Math.PI / 2, 0], size: [B.roomW - 0.4, 0.02] },
    ],
    [],
  )

  return (
    <group>
      <RoomShell mats={mats} />

      {/* rug, laid where you stand when you come in */}
      <mesh position={[B.roomD * 0.5, 0.008, 0.55]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[4.3, 3.1]} />
        <meshStandardMaterial ref={rugMat} map={rugTex} roughness={0.96} metalness={0} />
      </mesh>

      <PagedBoard room={room} accent={accent} />
      <Art accent={accent} />
      <Sideboard mats={mats} />
      <Plant />
      <Battlestation accent={accent} lightsOn={lightsOn} />
      <Pendant accent={accent} lightsOn={lightsOn} />

      {/* cove lighting, which is the only thing lit in here with the bulb off */}
      {trimStrips.map((s, i) => (
        <mesh key={i} position={s.pos} rotation={s.rot} material={trimMat}>
          <planeGeometry args={s.size} />
        </mesh>
      ))}

      {/* Cove fill. Sat near the doorway at first, which lit the half of the
          room behind you and left everything you were looking at black — these
          are level with where you actually stand. All three fade out as the
          pendant comes up; with the lights on they would only muddy it. */}
      <pointLight ref={accentA} position={[4.4, 2.85, -2.6]} color={accent} intensity={7.5} distance={9} decay={2} />
      <pointLight ref={accentB} position={[4.4, 2.85, 2.6]} color={accent} intensity={6.0} distance={9} decay={2} />
      {/* The board-wall uplight is gone — the picture light over the board and
          the cove trim behind it were already doing this, and a third source in
          the same corner cost a full pass for no visible change. */}
      <ambientLight ref={amb} intensity={0.24} color={accent} />
    </group>
  )
}

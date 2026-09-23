import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { B } from '../layout'
import { finish } from './materials'
import { damp } from './util'
import { makeDesktop } from '../desktop'
import { cached, grain } from '../canvasfx'
import { nav, state, useStore, toggleLights, sitDown, openProject } from '../store'
import RoomShell from './RoomShell'
import Battlestation from './Battlestation'

/* ============================================================================
 * THE PROJECTS ROOM
 * ----------------------------------------------------------------------------
 * Same fabric as ABOUT — plaster, wainscot, carpet, a pendant on the building's
 * switch — but laid out the other way round. The desk stands against the FAR
 * wall with the monitors facing back down the room, so walking in puts the
 * screens in front of you rather than off to one side.
 *
 * Click the chair and the camera sits down at the desk (the move itself is in
 * Rig; this room only asks for it). Seated, the centre monitor is a desktop
 * with one window per project.
 *
 * WHY THE DESK FACES THIS WAY
 * A desk against a wall has the person sitting with their back to the room,
 * facing the wall, looking at screens that face into it. That means the seated
 * camera keeps the same yaw it already had on entering — it only moves forward
 * and drops. No turn to blend, which is why sitting down is two damped numbers
 * rather than a scripted animation.
 * ========================================================================== */

/* The desk group's own +z is the direction the monitors face. Rotating the group
 * by -90° about y sends that to world -x: back down the room, at the door. */
const DESK_POS = [B.roomD - 0.62, 0, 0]
const DESK_ROT = [0, -Math.PI / 2, 0]

/* ---- the sit prompt ------------------------------------------------------ *
 * A label floating over the chair. The HUD already says the same thing along
 * the bottom of the screen, but a line of chrome 400px away from the object it
 * refers to is not an instruction anybody follows — it has to be ON the chair.
 * Fades out as you sit, because by then it is answered.
 * ------------------------------------------------------------------------- */

function makeSitLabel(accent) {
  const c = document.createElement('canvas')
  c.width = 640
  c.height = 200
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, c.width, c.height)

  const pad = 14
  ctx.beginPath()
  ctx.roundRect(pad, pad, c.width - pad * 2, 96, 12)
  ctx.fillStyle = 'rgba(6,9,16,0.88)'
  ctx.fill()
  ctx.strokeStyle = accent
  ctx.lineWidth = 3
  ctx.stroke()

  ctx.font = 'bold 34px Consolas, "Cascadia Mono", monospace'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffffff'
  ctx.fillText('CLICK THE CHAIR', c.width / 2, 58)
  ctx.font = '23px Consolas, "Cascadia Mono", monospace'
  ctx.fillStyle = accent
  ctx.fillText('to sit down and browse the projects', c.width / 2, 90)

  // a chevron pointing at the seat below it
  ctx.beginPath()
  ctx.moveTo(c.width / 2 - 26, 126)
  ctx.lineTo(c.width / 2, 156)
  ctx.lineTo(c.width / 2 + 26, 126)
  ctx.strokeStyle = accent
  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke()

  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

function SitPrompt({ accent }) {
  const tex = cached(`proj:sitlabel:${accent}`, () => makeSitLabel(accent))
  const grp = useRef()
  const mat = useRef()

  useFrame((s, dt) => {
    const t = s.clock.elapsedTime
    const want = 1 - nav.sitT
    if (mat.current) mat.current.opacity = damp(mat.current.opacity, want * (0.72 + Math.sin(t * 2) * 0.16), 6, dt)
    if (grp.current) {
      grp.current.visible = mat.current ? mat.current.opacity > 0.02 : true
      grp.current.position.y = 1.72 + Math.sin(t * 1.5) * 0.025
    }
  })

  // faces back down the room, the same way the monitors do
  return (
    <group ref={grp} position={[4.96, 1.72, 0.05]} rotation={[0, -Math.PI / 2, 0]}>
      <mesh>
        <planeGeometry args={[0.92, 0.2875]} />
        <meshBasicMaterial ref={mat} map={tex} transparent toneMapped={false} depthWrite={false} opacity={0.8} />
      </mesh>
    </group>
  )
}

/* ---- dressing ------------------------------------------------------------ */

function makeArt(kind, accent) {
  const c = document.createElement('canvas')
  c.width = 420
  c.height = 300
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#0d1119'
  ctx.fillRect(0, 0, c.width, c.height)

  if (kind === 0) {
    // a wireframe plan, the kind of thing that ends up framed in a studio
    ctx.strokeStyle = `${accent}88`
    ctx.lineWidth = 1.5
    for (let i = 0; i < 7; i++) {
      ctx.strokeRect(40 + i * 12, 40 + i * 9, c.width - 80 - i * 24, c.height - 80 - i * 18)
    }
    ctx.strokeStyle = '#e8edf533'
    ctx.beginPath()
    ctx.moveTo(40, 40)
    ctx.lineTo(c.width - 40, c.height - 40)
    ctx.moveTo(c.width - 40, 40)
    ctx.lineTo(40, c.height - 40)
    ctx.stroke()
  } else {
    // a bar chart, deliberately unlabelled
    ctx.fillStyle = '#0b0f17'
    ctx.fillRect(0, 0, c.width, c.height)
    const n = 14
    const bw = (c.width - 80) / n
    for (let i = 0; i < n; i++) {
      const h = 30 + ((i * 71) % 170)
      ctx.fillStyle = i % 4 === 0 ? accent : `#dfe6f0${i % 2 ? '2a' : '14'}`
      ctx.fillRect(40 + i * bw, c.height - 40 - h, bw - 5, h)
    }
    ctx.strokeStyle = `${accent}55`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(40, c.height - 40)
    ctx.lineTo(c.width - 40, c.height - 40)
    ctx.stroke()
  }

  grain(ctx, c.width, c.height, 0.5)

  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

function Art({ accent }) {
  const arts = cached(`proj:art:${accent}`, () => [makeArt(0, accent), makeArt(1, accent)])
  const frameMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#15191f', roughness: 0.42, metalness: 0.65, envMapIntensity: 1.5 }),
    [],
  )
  const mount = [
    { x: 3.5, y: 1.98, w: 0.86, h: 0.62, i: 0 },
    { x: 4.8, y: 1.98, w: 0.86, h: 0.62, i: 1 },
  ]
  return (
    <group>
      {mount.map((m, k) => (
        // rotated PI, so local +z points back at the viewer: the frame has to
        // sit at NEGATIVE local z or it covers the print
        <group key={k} position={[m.x, m.y, B.roomW / 2 - 0.02]} rotation={[0, Math.PI, 0]}>
          <mesh material={frameMat} position={[0, 0, -0.022]} castShadow>
            <boxGeometry args={[m.w + 0.075, m.h + 0.075, 0.032]} />
          </mesh>
          <mesh position={[0, 0, 0.002]}>
            <planeGeometry args={[m.w, m.h]} />
            <meshStandardMaterial map={arts[m.i]} emissiveMap={arts[m.i]} emissive="#ffffff" emissiveIntensity={0.14} roughness={0.85} />
          </mesh>
        </group>
      ))}
      <pointLight position={[4.2, 2.72, B.roomW / 2 - 0.6]} color="#f0e4d0" intensity={3.2} distance={4.4} decay={2} />
    </group>
  )
}

/* Open shelving down the other side, loaded with boxes and folders. */
function Shelving({ mats, accent }) {
  const boxes = useMemo(() => {
    const out = []
    let seed = 91
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return (seed >>> 8) / 8388608
    }
    for (let lvl = 0; lvl < 4; lvl++) {
      let z = -1.25
      while (z < 1.05) {
        const w = 0.14 + rnd() * 0.16
        out.push({ lvl, z: z + w / 2, w, h: 0.22 + rnd() * 0.1, tint: rnd() })
        z += w + 0.03
      }
    }
    return out
  }, [])

  return (
    <group position={[B.roomD * 0.52, 0, -B.roomW / 2 + 0.34]} rotation={[0, Math.PI / 2, 0]}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} material={mats.wood} position={[0, 0.46 + i * 0.44, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.8, 0.045, 0.34]} />
        </mesh>
      ))}
      {[-1.38, 1.38].map((x) => (
        <mesh key={x} material={mats.wood} position={[x, 0.95, 0]} castShadow>
          <boxGeometry args={[0.05, 1.9, 0.34]} />
        </mesh>
      ))}
      {boxes.map((b, i) => (
        <mesh key={i} position={[b.z, 0.49 + b.lvl * 0.44 + b.h / 2, 0]} castShadow>
          <boxGeometry args={[b.w, b.h, 0.28]} />
          <meshStandardMaterial
            color={b.tint > 0.82 ? accent : ['#2a3140', '#343b28', '#3a2f33', '#26313a'][i % 4]}
            roughness={0.85}
            metalness={0.05}
          />
        </mesh>
      ))}
    </group>
  )
}

function Pendant({ accent, lightsOn, x, z }) {
  const [hover, setHover] = useState(false)
  const bulbMat = useRef()
  const lamp = useRef()

  useFrame((s, dt) => {
    const t = s.clock.elapsedTime
    const idle = 0.5 + Math.sin(t * 1.6) * 0.25
    const want = lightsOn ? 9 : (hover ? 1.6 : 0.55) * idle
    if (bulbMat.current) bulbMat.current.emissiveIntensity = damp(bulbMat.current.emissiveIntensity, want, 7, dt)
    if (lamp.current) lamp.current.intensity = damp(lamp.current.intensity, lightsOn ? 24 : 0.9, 5, dt)
  })

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, B.roomH - 0.02, 0]}>
        <cylinderGeometry args={[0.055, 0.065, 0.04, 14]} />
        <meshStandardMaterial color="#171b22" roughness={0.4} metalness={0.8} />
      </mesh>
      <mesh position={[0, B.roomH - 0.36, 0]}>
        <cylinderGeometry args={[0.006, 0.006, 0.66, 6]} />
        <meshStandardMaterial color="#141820" roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.62, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.15, 0.2, 20, 1, true]} />
        <meshStandardMaterial color="#1c212a" roughness={0.5} metalness={0.5} side={THREE.DoubleSide} envMapIntensity={1.5} />
      </mesh>
      <mesh position={[0, 2.56, 0]}>
        <sphereGeometry args={[0.055, 16, 12]} />
        <meshStandardMaterial ref={bulbMat} color="#100d08" emissive="#ffd9a2" emissiveIntensity={0.55} toneMapped={false} />
      </mesh>
      <pointLight ref={lamp} position={[0, 2.5, 0]} color="#ffdcb0" intensity={0.9} distance={13} decay={1.7} />
      <mesh position={[0.11, 2.3, 0]}>
        <cylinderGeometry args={[0.004, 0.004, 0.42, 5]} />
        <meshStandardMaterial color="#5a5f68" roughness={0.4} metalness={0.9} />
      </mesh>
      <mesh position={[0.11, 2.07, 0]}>
        <sphereGeometry args={[0.022, 10, 8]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={hover ? 1.4 : 0.5} toneMapped={false} roughness={0.3} metalness={0.7} />
      </mesh>
      <mesh
        position={[0, 2.38, 0]}
        onClick={(e) => {
          e.stopPropagation()
          toggleLights()
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
        <cylinderGeometry args={[0.3, 0.3, 0.85, 10]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </group>
  )
}

/* ---- the room ------------------------------------------------------------ */

export default function ProjectsRoom({ room }) {
  const accent = room.accent
  const lightsOn = useStore((s) => s.lightsOn)
  const open = useStore((s) => s.openProject)
  const seated = useStore((s) => s.seated)

  const mats = finish()

  /* Every project in this room's `cards` block, flattened — the desktop wants a
   * plain list, not the block structure the printed boards read. */
  const projects = useMemo(() => {
    const out = []
    for (const b of room.blocks ?? []) {
      if (b.kind === 'cards') out.push(...(b.items ?? []))
    }
    return out
  }, [room])

  const desktop = cached(`proj:desktop:${accent}`, () => makeDesktop(projects, accent))

  /* Repainting the desktop is not cheap: 1280x560 of 2D drawing plus a 2.9MB
   * texture upload. It was running at a flat 5Hz forever, including while you
   * stood across the room and the panel was forty pixels wide.
   *
   * Now it repaints immediately when the open window changes, briskly while you
   * are actually sat in front of it, and once a second otherwise — which is all
   * the clock in the corner needs. */
  const acc = useRef(0)
  const lastOpen = useRef(-2)
  useFrame((s, dt) => {
    const changed = state.openProject !== lastOpen.current
    acc.current += dt
    const period = changed ? 0 : state.seated ? 1 / 6 : 1
    if (acc.current < period) return
    acc.current = 0
    lastOpen.current = state.openProject
    desktop.draw(state.openProject, s.clock.elapsedTime)
  })

  /* A click on the panel arrives as a UV. The desktop says what is under it; the
   * room decides what that means, so desktop.js never touches the store. */
  const onCentreClick = (u, v) => {
    if (!state.seated) {
      sitDown()
      return
    }
    const a = desktop.hit(u, v, state.openProject)
    if (!a) return
    if (a.kind === 'open') openProject(a.index)
    else if (a.kind === 'close') openProject(-1)
    else if (a.kind === 'link') window.open(a.href, '_blank', 'noopener,noreferrer')
  }

  const trimMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color(accent), toneMapped: false, transparent: true }),
    [accent],
  )
  useEffect(() => () => trimMat.dispose(), [trimMat])

  const accentA = useRef()
  const accentB = useRef()
  const amb = useRef()

  useFrame((s) => {
    const t = nav.lit
    const breath = 0.8 + Math.sin(s.clock.elapsedTime * 0.9) * 0.12
    trimMat.color.set(accent).multiplyScalar(breath * 1.4 * (1 - t))
    trimMat.opacity = 1 - t * 0.92
    if (accentA.current) accentA.current.intensity = 7.0 * (1 - t)
    if (accentB.current) accentB.current.intensity = 5.2 * (1 - t)
    if (amb.current) {
      amb.current.intensity = 0.24 + t * 0.44
      amb.current.color.set(accent)
    }
  })

  const trimStrips = useMemo(
    () => [
      { pos: [B.roomD / 2, B.roomH - 0.12, -B.roomW / 2 + 0.014], rot: [0, 0, 0], size: [B.roomD - 0.4, 0.02] },
      { pos: [B.roomD / 2, B.roomH - 0.12, B.roomW / 2 - 0.014], rot: [0, Math.PI, 0], size: [B.roomD - 0.4, 0.02] },
    ],
    [],
  )

  return (
    <group>
      <RoomShell mats={mats} />

      <Battlestation
        accent={accent}
        lightsOn={lightsOn}
        position={DESK_POS}
        rotation={DESK_ROT}
        centre={desktop}
        onCentreClick={onCentreClick}
        onSit={seated ? null : sitDown}
      />

      <SitPrompt accent={accent} />
      <Art accent={accent} />
      <Shelving mats={mats} accent={accent} />
      <Pendant accent={accent} lightsOn={lightsOn} x={B.roomD * 0.42} z={1.9} />

      {trimStrips.map((s, i) => (
        <mesh key={i} position={s.pos} rotation={s.rot} material={trimMat}>
          <planeGeometry args={s.size} />
        </mesh>
      ))}

      <pointLight ref={accentA} position={[3.4, 2.85, -2.6]} color={accent} intensity={7.0} distance={9} decay={2} />
      <pointLight ref={accentB} position={[3.4, 2.85, 2.6]} color={accent} intensity={5.2} distance={9} decay={2} />
      {/* No separate desk glow: the battlestation already runs a screen light
          a metre from this exact spot, and two lights for one wash is one more
          shading pass over everything in the room. */}
      <ambientLight ref={amb} intensity={0.24} color={accent} />
    </group>
  )
}

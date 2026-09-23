import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { B, DOORS, END, MOUTH, TUBES, OPEN_FROM, OPEN_TO } from '../layout'
import { PROFILE } from '../content'
import { materials, finish } from './materials'
import { planeUV, boxUV, rng, clamp01, damp, smootherstep } from './util'
import { makeSign } from '../textures'
import { nav, toggleLights } from '../store'
import { TONE, tone } from './tone'
import { brightest, floodWant } from './doorGlow'
import Door from './Door'

const DENSITY = 0.42 // texture tiles per metre

/* The lobby is finished to the same spec as the ABOUT room: plaster over a wood
 * wainscot, carpet, a chair rail and a cornice. Densities match so the two
 * spaces read as one building. */
const D_WALL = 0.5
const D_FLOOR = 1.1
const D_WOOD = 1.1

const WAINSCOT = 0.96
const RAIL_Y = 0.98

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

/* ---- a ceiling fitting, and the light switch ---------------------------- *
 * Every one of these is the switch for the whole building — click any fitting
 * in the hall and the lights come up, here and in the rooms.
 *
 * The click target is a box 600mm wide on the corridor centreline at ceiling
 * height. The doors' targets are on the walls at x = ±1.7 and stop at 2.16m,
 * so the two never overlap and a fitting cannot eat a click meant for a door.
 *
 * Off is not off: each fitting keeps a cold standby glow that breathes. A
 * finished lobby with every fitting genuinely dark is a corridor nobody can
 * walk down, and a switch nobody can find.
 * ------------------------------------------------------------------------- */

const COLD = new THREE.Color('#8ec2ff')
const WARM = new THREE.Color('#ffe9cf')

function Tube({ z, seed, lit: hasLight }) {
  const [hover, setHover] = useState(false)
  const light = useRef()
  const mat = useRef()
  const phase = useMemo(() => rng(seed)() * 100, [seed])

  const geo = useMemo(
    () => ({
      housing: boxUV(0.4, 0.085, 1.5, 1.4),
      diffuser: new THREE.PlaneGeometry(0.3, 1.42),
      stem: new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6),
    }),
    [],
  )

  useFrame((s, dt) => {
    const lit = nav.lit
    const t = s.clock.elapsedTime + phase

    /* A slow breath on standby so the fitting reads as live and clickable, and
     * dead-steady output once it is on — a lobby light that flickers while lit
     * reads as broken, which is the thing we just finished removing. */
    /* Standby is not decoration — it is the only thing lighting the hall with
     * the lights off, and at 2.2 the finished plaster and wainscot were
     * invisible. High enough to read the room by, low enough that switching on
     * is still a change. */
    const standby = 0.5 + Math.sin(t * 1.3) * 0.16 + (hover ? 0.8 : 0)
    // the ones that carry a light have to do the work of two
    const want = (lit * 15 + (1 - lit) * standby * 12) * (hasLight ? 1.9 : 1)

    if (light.current) {
      light.current.intensity = damp(light.current.intensity, want, 6, dt)
      light.current.color.copy(COLD).lerp(WARM, lit)
    }
    /* The diffuser is unmapped by tone mapping and sits above the bloom
     * threshold, so its emissive has to be kept far lower than the light's
     * output — matching the two made a fitting on standby blow out into a white
     * slab that read as fully on. */
    if (mat.current) {
      const glow = 0.12 + lit * 1.5 + (1 - lit) * standby * 0.18
      mat.current.emissiveIntensity = damp(mat.current.emissiveIntensity, glow, 6, dt)
      mat.current.emissive.copy(COLD).lerp(WARM, lit)
    }
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
    <group position={[0, B.height - 0.02, z]}>
      <mesh geometry={geo.stem} material={materials().steel} position={[0, 0.05, 0]} />
      <mesh geometry={geo.housing} material={materials().steel} position={[0, -0.048, 0]} castShadow />
      <mesh geometry={geo.diffuser} position={[0, -0.093, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <meshStandardMaterial
          ref={mat}
          color="#0b0d0e"
          emissive="#8ec2ff"
          emissiveIntensity={0.25}
          toneMapped={false}
          roughness={0.35}
        />
      </mesh>
      {hasLight && (
        <pointLight ref={light} position={[0, -0.2, 0]} color="#8ec2ff" intensity={1} distance={13} decay={1.9} />
      )}

      {/* the switch */}
      <mesh position={[0, -0.12, 0]} onClick={hit} onPointerOver={over} onPointerOut={out}>
        <boxGeometry args={[0.6, 0.34, 1.7]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>
    </group>
  )
}

/* ---- the way in --------------------------------------------------------- */

/* ---------------------------------------------------------------------------
 * The way in, and the first thing anybody sees. Cut stone with a projecting
 * canopy, paved apron, planters, sconces either side of the door and a backlit
 * sign over it.
 *
 * It answers the same switch as everything else, but backwards: an entrance is
 * lit at night and unlit by day, so the sconces and the sign go OUT as the
 * building lights come on and the stone tints from cold to warm.
 * ------------------------------------------------------------------------- */
function Entrance() {
  const m = materials()
  const f = finish()
  const hinge = useRef()
  const signMat = useRef()
  const sconceMat = useRef()
  const sconceL = useRef()
  const canopyLight = useRef()
  const signHalo = useRef()
  const dayFill = useRef()

  const accent = DOORS[0].room.accent
  const halfGap = (B.doorW + 0.5) / 2
  const FACADE_H = 5.2
  /* Low enough that the sign lands where it used to. Raising the canopy pushed
   * the sign up behind the title card's name on the entry screen. */
  const CANOPY_Y = 3.3

  const geo = useMemo(
    () => ({
      side: planeUV(6.2, FACADE_H, 0.34),
      head: planeUV(B.doorW + 0.5, FACADE_H - B.doorH - 0.2, 0.34),
      reveal: planeUV(0.3, B.doorH + 0.2, 0.5),
      leaf: boxUV(B.doorW + 0.42, B.doorH + 0.16, 0.06, 1.0),
      sign: new THREE.PlaneGeometry(3.4, 0.82),
      apron: planeUV(18, B.entry + 7, 0.5),
      // a slab over the door, and the fascia hanging off its front edge
      canopy: boxUV(5.2, 0.16, 1.5, 0.9),
      fascia: boxUV(5.2, 0.28, 0.07, 1.2),
      plinth: boxUV(18, 0.09, 0.5, 0.9),
      pilaster: boxUV(0.34, FACADE_H, 0.22, 0.8),
    }),
    [],
  )

  const sign = useMemo(
    () =>
      makeSign('PORTFOLIO', {
        w: 1024,
        h: 256,
        bg: '#0b0e14',
        fg: '#eef2f8',
        font: 'bold 132px Consolas, "Cascadia Mono", monospace',
        sub: PROFILE.name,
        seed: 5,
      }),
    [],
  )

  useFrame((s, dt) => {
    const open = smootherstep(clamp01((nav.pos - OPEN_FROM) / (OPEN_TO - OPEN_FROM)))
    // swings inward so you push through it rather than walking into it
    if (hinge.current) hinge.current.rotation.y = open * 1.62

    const t = nav.lit
    tone(f.stone, TONE.stone, t)
    tone(f.paving, TONE.paving, t)

    // night = the entrance lights itself; day = they are off and pointless
    const night = 1 - t
    if (signMat.current) {
      signMat.current.emissiveIntensity = damp(signMat.current.emissiveIntensity, 0.3 + night * 0.95, 6, dt)
    }
    if (signHalo.current) signHalo.current.material.opacity = 0.1 + night * 0.4
    if (sconceMat.current) sconceMat.current.color.set(accent).multiplyScalar(0.35 + night * 1.5)
    const sc = 0.4 + night * 5.2
    if (sconceL.current) sconceL.current.intensity = damp(sconceL.current.intensity, sc, 5, dt)
    if (canopyLight.current) {
      canopyLight.current.intensity = damp(canopyLight.current.intensity, 2 + night * 7, 5, dt)
    }
    if (dayFill.current) dayFill.current.intensity = damp(dayFill.current.intensity, t * 22, 4, dt)
  })

  const headH = FACADE_H - B.doorH - 0.2

  return (
    <group>
      {/* paved apron, and a step at the threshold */}
      <mesh
        geometry={geo.apron}
        material={f.paving}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, (B.entry + 7) / 2]}
        receiveShadow
      />
      <mesh geometry={geo.plinth} material={f.stone} position={[0, 0.045, 0.3]} receiveShadow />

      {/* facade, with the opening cut out of it */}
      <mesh geometry={geo.side} material={f.stone} position={[-halfGap - 3.1, FACADE_H / 2, 0]} receiveShadow />
      <mesh geometry={geo.side} material={f.stone} position={[halfGap + 3.1, FACADE_H / 2, 0]} receiveShadow />
      <mesh
        geometry={geo.head}
        material={f.stone}
        position={[0, B.doorH + 0.2 + headH / 2, 0]}
        receiveShadow
      />
      {/* the reveal either side of the opening, so the wall has thickness */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          geometry={geo.reveal}
          material={f.stone}
          position={[side * halfGap, (B.doorH + 0.2) / 2, -0.15]}
          rotation={[0, side === -1 ? Math.PI / 2 : -Math.PI / 2, 0]}
        />
      ))}

      {/* pilasters framing the entrance */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          geometry={geo.pilaster}
          material={f.stone}
          position={[side * (halfGap + 0.4), FACADE_H / 2, 0.12]}
          castShadow
        />
      ))}

      {/* canopy over the door, with a downlight under it */}
      <mesh geometry={geo.canopy} material={f.stone} position={[0, CANOPY_Y, 0.72]} castShadow receiveShadow />
      <mesh geometry={geo.fascia} material={f.trim} position={[0, CANOPY_Y - 0.06, 1.44]} castShadow />
      {/* Pulled forward under the canopy and turned down. The door leaf is
          near-black paint, but a 15-intensity source two metres off it still
          renders grey — the fix was never the material (it measures #0b0d12 at
          runtime), it was a porch lamp brighter than anything else outside. */}
      <pointLight ref={canopyLight} position={[0, CANOPY_Y - 0.22, 1.2]} color="#ffdcb4" intensity={7} distance={8} decay={1.9} />

      {/* the sign, mounted on the fascia and backlit */}
      <mesh geometry={geo.sign} position={[0, CANOPY_Y - 0.05, 1.49]}>
        <meshStandardMaterial
          ref={signMat}
          map={sign}
          emissiveMap={sign}
          emissive="#eaf1ff"
          emissiveIntensity={1.25}
          roughness={0.85}
          metalness={0}
        />
      </mesh>
      {/* A lightbox edge under the sign rather than a glow plane behind it. The
          plane version was a 3.7m additive rectangle: with hard edges and no
          falloff it read as a cyan UI box, and on the title screen it landed
          directly behind the name. A thin strip reads as the fitting it is. */}
      <mesh ref={signHalo} position={[0, CANOPY_Y - 0.48, 1.485]}>
        <planeGeometry args={[3.44, 0.03]} />
        <meshBasicMaterial color={accent} toneMapped={false} transparent opacity={0.5} depthWrite={false} />
      </mesh>

      {/* sconces either side of the door */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (halfGap + 0.78), 2.05, 0.1]}>
          <mesh castShadow>
            <boxGeometry args={[0.1, 0.62, 0.11]} />
            <meshStandardMaterial color="#12161d" roughness={0.4} metalness={0.8} envMapIntensity={1.5} />
          </mesh>
          <mesh position={[0, 0, 0.062]}>
            <planeGeometry args={[0.055, 0.5]} />
            <meshBasicMaterial ref={side === -1 ? sconceMat : undefined} color={accent} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {/* One light for both sconces. The fittings either side are emissive and
          read as the sources; a second point light only doubled the cost of the
          same pool of colour. */}
      <pointLight ref={sconceL} position={[0, 2.05, 0.75]} color={accent} intensity={5} distance={6} decay={2} />

      {/* Daylight on the forecourt, off at night. Without it "lights on" only
          lifted the stone's tint and the entrance stayed as dim as it was in
          the dark — a warm swatch under no light still reads as night. */}
      <pointLight ref={dayFill} position={[0, 6.5, 9]} color="#cfe0ff" intensity={0} distance={26} decay={1.4} />

      {/* planters, because a bare paved forecourt reads as a loading bay */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (halfGap + 2.35), 0, 1.5]}>
          <mesh position={[0, 0.28, 0]} material={f.trim} castShadow receiveShadow>
            <boxGeometry args={[0.9, 0.56, 0.9]} />
          </mesh>
          <mesh position={[0, 0.58, 0]}>
            <boxGeometry args={[0.78, 0.06, 0.78]} />
            <meshStandardMaterial color="#1d2a22" roughness={0.95} />
          </mesh>
          {Array.from({ length: 7 }, (_, i) => (
            <mesh
              key={i}
              position={[Math.cos((i / 7) * Math.PI * 2) * 0.16, 0.86, Math.sin((i / 7) * Math.PI * 2) * 0.16]}
              rotation={[0, (i / 7) * Math.PI * 2, 0.2 + (i % 3) * 0.1]}
              castShadow
            >
              <planeGeometry args={[0.13, 0.58]} />
              <meshStandardMaterial color="#2c4535" roughness={0.8} side={THREE.DoubleSide} />
            </mesh>
          ))}
        </group>
      ))}

      {/* the door you push through */}
      <group ref={hinge} position={[-halfGap + 0.04, 0, 0]}>
        <mesh
          geometry={geo.leaf}
          material={m.door}
          position={[(B.doorW + 0.42) / 2, (B.doorH + 0.16) / 2, 0]}
          castShadow
        />
        {/* a glazed panel, so it reads as an entrance door and not a hatch */}
        {/* Glass onto an unlit lobby, so it is the darkest thing on the facade.
            Every glossier setting tried here caught the canopy light as a hard
            white blob that read as a lamp behind the door. */}
        <mesh position={[(B.doorW + 0.42) / 2, 1.42, 0.036]}>
          <planeGeometry args={[B.doorW - 0.24, 0.9]} />
          <meshStandardMaterial color="#05070c" roughness={0.55} metalness={0.08} envMapIntensity={0.5} />
        </mesh>
        <mesh position={[(B.doorW + 0.42) / 2 + 0.42, 1.02, 0.05]} castShadow>
          <cylinderGeometry args={[0.02, 0.02, 0.72, 8]} />
          <meshStandardMaterial color="#8a8f94" roughness={0.3} metalness={1} envMapIntensity={1.6} />
        </mesh>
      </group>
    </group>
  )
}

/* ---- everything else ---------------------------------------------------- */

/* A carpet runner: plain field, a border stripe in each room's accent so the
 * colour on the floor keeps changing as you walk. One texture, tiled along the
 * length, with the accent taken from the middle of the building. */
function makeRunner(accent) {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 256
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#4a5260'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.fillStyle = '#39404d'
  ctx.fillRect(14, 0, c.width - 28, c.height)
  ctx.fillStyle = accent
  ctx.globalAlpha = 0.5
  ctx.fillRect(9, 0, 4, c.height)
  ctx.fillRect(c.width - 13, 0, 4, c.height)
  ctx.globalAlpha = 1
  for (let i = 0; i < 6000; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.14})`
    ctx.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 1)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(1, END / 2.2)
  t.anisotropy = 8
  return t
}

function Shell() {
  /* The lobby's own tintable set. Same maps as the ABOUT room, its own
   * instances, because both animate `color` and neither can own the other's. */
  const lounge = finish()
  const runsL = useMemo(() => wallRuns(-1), [])
  const runsR = useMemo(() => wallRuns(1), [])

  const runner = useMemo(() => makeRunner(DOORS[0].room.accent), [])
  const runnerMat = useRef()

  useFrame(() => {
    const t = nav.lit
    tone(lounge.wall, TONE.wall, t)
    tone(lounge.ceiling, TONE.ceiling, t)
    tone(lounge.carpet, TONE.carpet, t)
    tone(lounge.wood, TONE.wood, t)
    // the runner has its colours baked in, so it only needs an exposure lift
    if (runnerMat.current) runnerMat.current.color.setScalar(0.4 + t * 0.85)
  })

  const floorLen = END
  const geo = useMemo(
    () => ({
      floor: planeUV(B.width, floorLen, D_FLOOR),
      ceil: planeUV(B.width, floorLen, D_WALL),
      end: planeUV(B.width, B.height, D_WALL),
      runner: new THREE.PlaneGeometry(1.5, floorLen),
      // cornice and skirting run the full length; the doorways are recessed, so
      // nothing here has to dodge them
      cornice: boxUV(0.09, 0.1, floorLen, 1.6),
      skirt: boxUV(0.05, 0.13, floorLen, 1.6),
    }),
    [floorLen],
  )

  /* Wall runs get split into plaster above the rail and wood below it. The
   * chair rail itself runs the whole length regardless — it is thin enough that
   * crossing a doorway recess is invisible, and one long box is five fewer
   * draw calls than one per run. */
  const wallGeos = useMemo(() => {
    const make = (runs) =>
      runs.map(([a, b]) => ({
        g: planeUV(a - b, B.height - WAINSCOT, D_WALL),
        w: planeUV(a - b, WAINSCOT, D_WOOD),
        z: (a + b) / 2,
      }))
    return { l: make(runsL), r: make(runsR) }
  }, [runsL, runsR])

  const railGeo = useMemo(() => boxUV(0.05, 0.055, floorLen, 1.6), [floorLen])

  const lintels = useMemo(
    () =>
      DOORS.map((d) => ({
        g: planeUV(B.doorW, B.height - B.doorH, DENSITY),
        d,
      })),
    [],
  )

  const endSign = useMemo(
    () =>
      makeSign('END OF HALL', {
        w: 512,
        h: 160,
        bg: '#0d1118',
        fg: '#8f9bad',
        seed: 77,
        font: 'bold 52px Consolas, "Cascadia Mono", monospace',
      }),
    [],
  )

  const halfW = B.width / 2

  return (
    <group>
      <mesh
        geometry={geo.floor}
        material={lounge.carpet}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, -END / 2]}
        receiveShadow
      />
      {/* the runner, laid down the centre line */}
      <mesh geometry={geo.runner} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, -END / 2]} receiveShadow>
        <meshStandardMaterial ref={runnerMat} map={runner} roughness={0.97} metalness={0} />
      </mesh>
      <mesh
        geometry={geo.ceil}
        material={lounge.ceiling}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, B.height, -END / 2]}
        receiveShadow
      />

      {/* plaster above the rail, wood below it, per wall run */}
      {wallGeos.l.map((s, i) => (
        <group key={`l${i}`}>
          <mesh
            geometry={s.g}
            material={lounge.wall}
            position={[-halfW, WAINSCOT + (B.height - WAINSCOT) / 2, s.z]}
            rotation={[0, Math.PI / 2, 0]}
            receiveShadow
          />
          <mesh
            geometry={s.w}
            material={lounge.wood}
            position={[-halfW + 0.008, WAINSCOT / 2, s.z]}
            rotation={[0, Math.PI / 2, 0]}
            receiveShadow
          />
        </group>
      ))}
      {wallGeos.r.map((s, i) => (
        <group key={`r${i}`}>
          <mesh
            geometry={s.g}
            material={lounge.wall}
            position={[halfW, WAINSCOT + (B.height - WAINSCOT) / 2, s.z]}
            rotation={[0, -Math.PI / 2, 0]}
            receiveShadow
          />
          <mesh
            geometry={s.w}
            material={lounge.wood}
            position={[halfW - 0.008, WAINSCOT / 2, s.z]}
            rotation={[0, -Math.PI / 2, 0]}
            receiveShadow
          />
        </group>
      ))}
      {lintels.map(({ g, d }, i) => (
        <mesh
          key={`t${i}`}
          geometry={g}
          material={lounge.wall}
          position={[d.x, (B.height + B.doorH) / 2, d.z]}
          rotation={[0, d.side === -1 ? Math.PI / 2 : -Math.PI / 2, 0]}
          receiveShadow
        />
      ))}

      {/* joinery: one long run each, both sides */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh geometry={railGeo} material={lounge.wood} position={[side * (halfW - 0.03), RAIL_Y, -END / 2]} castShadow />
          <mesh geometry={geo.skirt} material={lounge.wood} position={[side * (halfW - 0.03), 0.065, -END / 2]} />
          <mesh
            geometry={geo.cornice}
            material={lounge.ceiling}
            position={[side * (halfW - 0.05), B.height - 0.055, -END / 2]}
          />
        </group>
      ))}

      {/* dead end */}
      <mesh geometry={geo.end} material={lounge.wall} position={[0, B.height / 2, -END]} receiveShadow />
      <mesh position={[0, 2.05, -END + 0.02]}>
        <planeGeometry args={[1.3, 0.41]} />
        <meshStandardMaterial
          map={endSign}
          emissiveMap={endSign}
          emissive="#7f93b5"
          emissiveIntensity={0.28}
          roughness={0.9}
        />
      </mesh>
    </group>
  )
}

/* ---- the guide strip ---------------------------------------------------- *
 * A neon channel at skirting height down both walls, cut into one segment per
 * door bay and lit in that room's accent. Walk the hall and the colour changes
 * under you a bay before the matching door shows up — it is the only piece of
 * wayfinding in the building that is not rusted signage.
 *
 * Emissive geometry only, no lights: ten more point lights down a corridor is
 * ten more full shading passes, and bloom already does the work. */
function GuideStrip() {
  const segs = useMemo(() => {
    const out = []
    // One bay per door, plus the run before the first and after the last. Each
    // segment stops at a doorway rather than running across it — z is negative
    // going deeper, so `from` is always the less-negative end.
    for (let i = 0; i <= DOORS.length; i++) {
      const from = i === 0 ? -0.4 : DOORS[i - 1].z - B.doorW / 2
      const to = i === DOORS.length ? -END + 0.2 : DOORS[i].z + B.doorW / 2
      const len = from - to
      if (len < 0.3) continue
      const accent = DOORS[Math.min(i, DOORS.length - 1)].room.accent
      out.push({ z: (from + to) / 2, len, accent })
    }
    return out
  }, [])

  const mats = useMemo(() => {
    const cache = new Map()
    for (const s of segs) {
      if (!cache.has(s.accent)) {
        cache.set(
          s.accent,
          new THREE.MeshBasicMaterial({ color: s.accent, toneMapped: false, transparent: true }),
        )
      }
    }
    return cache
  }, [segs])

  useFrame((s) => {
    /* Breathes together, so the hall reads as one circuit rather than five.
     * Knocked right back when the ceiling lights are on: cove neon competing
     * with a lit lobby looks like a strip somebody forgot to switch off. */
    const k = 0.72 + Math.sin(s.clock.elapsedTime * 0.75) * 0.14
    /* Nearly all the way out with the lights on. These are unmapped by tone
     * mapping and cross the bloom threshold, so even a fifth of full strength
     * still burns as a bright line across a lit floor. */
    const dim = 1 - nav.lit * 0.94
    for (const [hex, mat] of mats) {
      mat.color.set(hex).multiplyScalar(k * 1.5 * dim)
      mat.opacity = 0.16 + dim * 0.84
    }
  })

  return (
    <group>
      {/* One band per wall per bay, just above the skirting, where it puts
          colour on the carpet.

          There was a second band up in the cornice and it had to go: a thin
          emissive line near the ceiling, seen at a grazing angle down a 50m
          corridor, becomes a long bright diagonal across the frame. It read as
          a laser beam, not as coving, and no amount of dimming fixed the shape.
          Down here the same strip is seen almost end-on and reads correctly. */}
      {segs.map((s, i) =>
        [-1, 1].map((side) => (
          <mesh
            key={`${i}${side}`}
            position={[side * (B.width / 2 - 0.014), 0.15, s.z]}
            rotation={[0, side === -1 ? Math.PI / 2 : -Math.PI / 2, 0]}
            material={mats.get(s.accent)}
          >
            <planeGeometry args={[s.len, 0.018]} />
          </mesh>
        )),
      )}
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
          bg: '#171c26',
          fg: '#93a2b8',
          font: 'bold 104px Consolas, "Cascadia Mono", monospace',
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

/* The one light that serves all five doors. See doorGlow.js. */
function DoorGlow() {
  const light = useRef()
  useFrame((s, dt) => {
    const l = light.current
    if (!l) return
    const b = brightest()
    if (!b) {
      l.intensity = damp(l.intensity, 0, 6, dt)
      return
    }
    // snap position when the winner changes, damp only the brightness: sliding
    // a light down the corridor between doors would read as a passing car
    l.position.set(b.x, 0.28, b.z)
    l.color.set(b.color)
    l.intensity = damp(l.intensity, b.want, 6, dt)
  })
  return <pointLight ref={light} position={[0, 0.28, 0]} intensity={0} distance={3.4} decay={2} />
}

/* The one flood the open door throws back into the hall. Always mounted, even
 * with every door shut, because a light that comes and goes changes the scene's
 * light count and makes three recompile every shader in view. */
function DoorFlood() {
  const light = useRef()
  const target = useRef()
  useFrame((s, dt) => {
    const l = light.current
    if (!l || !target.current) return
    l.target = target.current
    l.position.set(floodWant.x, 1.5, floodWant.z)
    target.current.position.set(floodWant.tx, 1.1, floodWant.z)
    if (floodWant.want > 0.001) l.color.set(floodWant.color)
    l.intensity = damp(l.intensity, floodWant.want, 5, dt)
  })
  return (
    <>
      <spotLight ref={light} angle={0.95} penumbra={1} intensity={0} distance={8} decay={1.8} />
      <object3D ref={target} />
    </>
  )
}

export default function Corridor() {
  return (
    <group>
      <DoorGlow />
      <DoorFlood />
      <Entrance />
      <Shell />
      {/* Debris is gone: it was rubbish scattered on a bare concrete floor, and
          there is now a carpet runner where it used to sit. Rubbish on a carpet
          does not read as neglect, it reads as a mistake. */}
      <Signage />
      <GuideStrip />
      {TUBES.map((t, i) => (
        <Tube key={i} z={t.z} seed={t.seed} lit={t.lit} />
      ))}
      {DOORS.map((d) => (
        <Door key={d.index} door={d} />
      ))}
    </group>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import * as THREE from 'three'
import { B, DOORS } from '../layout'
import { buildEnvironment } from './materials'
import { set, useStore } from '../store'
import Corridor from './Corridor'
import Room from './Room'
import Rig from './Rig'
import Flashlight from './Flashlight'
import Dust from './Dust'
import Effects from './Effects'

/* Fog, a near-black environment probe and a pitch-black background. Together
 * they mean anything more than ~15 metres away simply is not there. */
function Atmosphere() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const env = buildEnvironment(gl)
    scene.environment = env
    scene.environmentIntensity = 1.15
    /* The fog colour is what every distant surface fades into, so it sets the
     * hue of the whole building more than any light does. A blue-violet reads
     * as depth; the old near-black just read as "off". */
    scene.fog = new THREE.FogExp2(new THREE.Color('#070a18'), 0.043)
    scene.background = new THREE.Color('#000000')
    return () => {
      scene.environment = null
      scene.fog = null
      env.dispose()
    }
  }, [gl, scene])
  return null
}

/* ---------------------------------------------------------------------------
 * WARMUP
 * Three compiles a shader program the first time a material is rendered, and
 * the program's cache key includes the NUMBER OF LIGHTS in the scene. Walking
 * into a room adds nine, so every material in view needed a fresh program at
 * exactly the moment the door swung open — measured at 2 to 3.5 seconds of
 * frozen main thread, and it happened again on re-entry because leaving took
 * the count back down.
 *
 * So mount each room for a few frames while the loading screen is still up.
 * Three caches the programs by key, and the real visit reuses them.
 *
 * ONE AT A TIME, deliberately. Mounting all five together would be a 56-light
 * scene and would compile programs for a configuration that never occurs.
 * ------------------------------------------------------------------------- */
function Warmup() {
  const [i, setI] = useState(0)
  const held = useRef(0)

  useFrame(() => {
    // two rendered frames each: one to compile, one to be sure it landed
    if (++held.current < 2) return
    held.current = 0
    if (i >= DOORS.length) {
      set({ phase: 'ready' })
      return
    }
    setI(i + 1)
  })

  if (i >= DOORS.length) return null
  return <Room door={DOORS[i]} warm />
}

function World() {
  const active = useStore((s) => s.activeRoom)
  const phase = useStore((s) => s.phase)
  return (
    <>
      <Atmosphere />
      <ambientLight intensity={0.12} color="#3c63a8" />
      <Rig />
      <Flashlight />
      <Corridor />
      {phase === 'warming' && <Warmup />}
      {active >= 0 && <Room door={DOORS[active]} />}
      <Dust />
      <Effects />
    </>
  )
}

export default function Scene() {
  return (
    <Canvas
      shadows="soft"
      flat
      dpr={[1, 1.6]}
      camera={{ fov: 68, near: 0.05, far: 70, position: [0, B.eye, B.entry] }}
      gl={{
        antialias: false,
        powerPreference: 'high-performance',
        stencil: false,
        preserveDrawingBuffer: false,
      }}
      onCreated={(root) => {
        root.gl.shadowMap.type = THREE.PCFSoftShadowMap
        /* The ABOUT room's sliding board clips its panels against the frame
         * aperture. Without this the clippingPlanes on those materials are
         * ignored and every panel is drawn in full, side by side. */
        root.gl.localClippingEnabled = true
        if (import.meta.env.DEV && window.__portfolio) window.__portfolio.three = root
      }}
    >
      <PerformanceMonitor
        bounds={() => [45, 60]}
        flipflops={3}
        onFallback={() => set({ lowSpec: true })}
      />
      <World />
    </Canvas>
  )
}

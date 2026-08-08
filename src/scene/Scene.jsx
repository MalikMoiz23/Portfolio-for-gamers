import { useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
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
    scene.environmentIntensity = 0.9
    scene.fog = new THREE.FogExp2(new THREE.Color('#05070a'), 0.045)
    scene.background = new THREE.Color('#000000')
    return () => {
      scene.environment = null
      scene.fog = null
      env.dispose()
    }
  }, [gl, scene])
  return null
}

function World() {
  const active = useStore((s) => s.activeRoom)
  return (
    <>
      <Atmosphere />
      <ambientLight intensity={0.085} color="#48586a" />
      <Rig />
      <Flashlight />
      <Corridor />
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

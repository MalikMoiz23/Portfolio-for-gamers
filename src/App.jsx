import { useEffect, useState } from 'react'
import { buildTextures } from './textures'
import { set, useStore } from './store'
import Scene from './scene/Scene'
import Boot from './ui/Boot'
import Title from './ui/Title'
import Hud from './ui/Hud'
import RoomPanel from './ui/RoomPanel'
import Plain from './ui/Plain'

function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'))
  } catch {
    return false
  }
}

export default function App() {
  const phase = useStore((s) => s.phase)
  const plain = useStore((s) => s.plain)
  const [supported, setSupported] = useState(true)

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('plain') === '1') {
      set({ plain: true })
    }
    if (!hasWebGL()) {
      setSupported(false)
      set({ plain: true })
      return
    }
    let alive = true
    buildTextures((p, label) => {
      if (alive) set({ progress: p, progressLabel: label })
    }).then(() => {
      if (alive) set({ phase: 'ready' })
    })
    return () => {
      alive = false
    }
  }, [])

  if (plain) return <Plain webglMissing={!supported} />

  return (
    <>
      {phase !== 'boot' && <Scene />}
      {phase === 'boot' && <Boot />}
      <Title />
      <Hud />
      <RoomPanel />
    </>
  )
}

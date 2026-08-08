import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { B, DOORS, MAX_POS, cameraZ } from '../layout'
import { nav, state, set, leaveRoom } from '../store'
import { clamp, clamp01, damp, easeInOut, lerp } from './util'
import * as audio from '../audio'

const ENTER_TIME = 2.6
const LEAVE_TIME = 1.5

/* Inside a room the text panel occupies the right-hand side of a wide screen,
 * so turn the head slightly right — which slides the room's own signage and
 * fittings into the clear left half. On narrow screens the panel is a bottom
 * sheet instead, and the bias would just aim you at a blank side wall. */
const PANEL_BIAS = -0.26
let wideLayout = typeof window !== 'undefined' && window.innerWidth > 720
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    wideLayout = window.innerWidth > 720
  })
}

/* The camera, and everything that moves it: scroll, keys, touch, head bob,
 * the walk through a doorway, and the footsteps that go with all of it. */
export default function Rig() {
  const { camera, gl } = useThree()
  const keys = useRef(new Set())
  const posAtEnter = useRef(0)
  const lastStep = useRef(0)
  const targetLook = useRef({ x: 0, y: 0 })

  useEffect(() => {
    camera.rotation.order = 'YXZ'
    camera.position.set(0, B.eye, cameraZ(0))
  }, [camera])

  useEffect(() => {
    const el = gl.domElement

    const onWheel = (e) => {
      if (state.phase !== 'walk') return
      e.preventDefault()
      nav.target = clamp(nav.target + e.deltaY * 0.0072, 0, MAX_POS)
    }

    let touchY = null
    const onTouchStart = (e) => {
      touchY = e.touches[0].clientY
    }
    const onTouchMove = (e) => {
      if (touchY === null || state.phase !== 'walk') return
      const y = e.touches[0].clientY
      nav.target = clamp(nav.target + (touchY - y) * 0.016, 0, MAX_POS)
      touchY = y
    }
    const onTouchEnd = () => {
      touchY = null
    }

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        leaveRoom()
        return
      }
      if (e.key === 'Enter' && state.hoverRoom >= 0 && state.phase === 'walk') return
      keys.current.add(e.key.toLowerCase())
      if ([' ', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key)) e.preventDefault()
    }
    const onKeyUp = (e) => keys.current.delete(e.key.toLowerCase())

    const onPointerMove = (e) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1
      const ny = (e.clientY / window.innerHeight) * 2 - 1
      const range = state.phase === 'inside' ? 0.42 : 0.2
      targetLook.current.x = -nx * range
      targetLook.current.y = clamp(-ny * range * 0.62, -0.3, 0.3)
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('touchend', onTouchEnd)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('pointermove', onPointerMove)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('pointermove', onPointerMove)
    }
  }, [gl])

  useFrame((s, rawDt) => {
    // clamped so a stalled tab does not teleport you, but not so tightly that
    // a slow machine makes every transition crawl
    const dt = Math.min(rawDt, 1 / 12)
    const t = s.clock.elapsedTime
    const phase = state.phase

    /* ---- scroll / keys ---- */
    if (phase === 'walk') {
      const k = keys.current
      let drive = 0
      if (k.has('w') || k.has('arrowup') || k.has(' ')) drive += 1
      if (k.has('s') || k.has('arrowdown')) drive -= 1
      if (drive !== 0) nav.target = clamp(nav.target + drive * 3.1 * dt, 0, MAX_POS)
    }

    /* ---- the walk through a door ---- */
    if (phase === 'entering') {
      if (nav.roomT === 0) posAtEnter.current = nav.pos
      nav.roomT = Math.min(1, nav.roomT + dt / ENTER_TIME)
      if (nav.roomT >= 1) set({ phase: 'inside' })
    } else if (phase === 'leaving') {
      nav.roomT = Math.max(0, nav.roomT - dt / LEAVE_TIME)
      if (nav.roomT <= 0) {
        set({ phase: 'walk', activeRoom: -1 })
        nav.target = nav.pos
      }
    }

    /* ---- position ---- */
    const door = state.activeRoom >= 0 ? DOORS[state.activeRoom] : null
    const prevZ = camera.position.z
    const prevX = camera.position.x

    if (door) {
      // walk the last few metres up to the doorway, then turn and step in
      const doorPos = B.entry - door.z
      const walk = easeInOut(clamp01(nav.roomT / 0.42))
      nav.pos = lerp(posAtEnter.current, doorPos, walk)
      nav.target = nav.pos
    } else {
      nav.pos = damp(nav.pos, nav.target, 4.2, dt)
    }

    const baseZ = cameraZ(nav.pos)
    let x = 0
    let yaw = 0

    if (door) {
      const e = easeInOut(clamp01((nav.roomT - 0.3) / 0.7))
      const p1 = door.side * (B.width / 2 + B.recess)
      const p2 = door.side * (B.width / 2 + B.recess + B.roomD * 0.4)
      x = 2 * (1 - e) * e * p1 + e * e * p2
      const turn = (-door.side * Math.PI) / 2 + (wideLayout ? PANEL_BIAS : 0)
      yaw = easeInOut(clamp01((nav.roomT - 0.22) / 0.78)) * turn
    }

    /* ---- head bob and footsteps ---- */
    const moved = Math.hypot(baseZ - prevZ, x - prevX)
    nav.speed = damp(nav.speed, moved / Math.max(dt, 1e-4), 8, dt)
    nav.walked += moved

    const gait = clamp01(nav.speed / 2.4)
    const amp = 0.012 + gait * 0.036
    const bobY = Math.sin(nav.walked * 3.6) * amp
    const bobX = Math.sin(nav.walked * 1.8) * amp * 0.7
    const roll = Math.sin(nav.walked * 1.8) * gait * 0.012
    // you are still breathing even when you stop
    const breathe = Math.sin(t * 0.9) * 0.006 + Math.sin(t * 0.37) * 0.004

    const step = Math.floor((nav.walked * 3.6) / Math.PI)
    if (step !== lastStep.current) {
      if (gait > 0.06) audio.footstep(0.35 + gait * 0.65)
      lastStep.current = step
    }

    camera.position.set(x + bobX * 0.5, B.eye + bobY + breathe, baseZ)

    /* ---- look ---- */
    nav.lookX = damp(nav.lookX, targetLook.current.x, 3.4, dt)
    nav.lookY = damp(nav.lookY, targetLook.current.y, 3.4, dt)
    camera.rotation.y = yaw + nav.lookX
    camera.rotation.x = nav.lookY + Math.sin(t * 0.63) * 0.004
    camera.rotation.z = roll + Math.sin(t * 0.41) * 0.0025
  })

  return null
}

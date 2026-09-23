import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { B, DOORS, MAX_POS, SEAT, standDepth, cameraZ } from '../layout'
import { nav, state, set, leaveRoom, standUp } from '../store'
import { clamp, clamp01, damp, easeInOut, lerp, smootherstep } from './util'
import * as audio from '../audio'

/* Every damp() below is a first-order filter: `rate` is e-folds per second, so
 * the lag you feel is roughly 1/rate seconds. The first pass used 3-4 across
 * the board, which is a quarter-second of mush behind every input. These are
 * tuned so motion still smooths out the discrete steps of a wheel event but
 * starts moving on the same frame you scroll. */
const POS_DAMP = 11 // was 4.2 — the scroll lag
const LOOK_DAMP = 15 // was 3.4 — the mouse lag
const LATERAL_DAMP = 8.5 // was 3.2
const SPEED_DAMP = 14

const ENTER_TIME = 1.45
const LEAVE_TIME = 0.85

const WALK_SPEED = 3.2
const RUN_SPEED = 6.6
const SPRINT_AT = 3.9 // m/s above which a scroll counts as running

/* How far you can move across the corridor, and how strongly a door pulls you
 * towards it as you come alongside. */
const STRAFE_LIMIT = B.width / 2 - 0.52
const DOOR_PULL = 0.8
const PULL_RANGE = 5.0

/* Coming alongside a door turns you to face it and arms the prompt. It does
 * NOT open it — you go in by clicking the door itself and nothing else. */
const OPEN_RADIUS = 2.6

/* Radians of bob per metre walked. Lower when running, because a running
 * stride is nearly twice as long — you take fewer, bigger steps per metre but
 * cover the ground faster, so the cadence in time still goes up. */
const BOB_PER_M_WALK = 4.18
const BOB_PER_M_RUN = 2.33

export default function Rig() {
  const { camera, gl } = useThree()
  const keys = useRef(new Set())
  const posAtEnter = useRef(0)
  const lateralAtEnter = useRef(0)
  const lastHalfStep = useRef(0)
  const stepParity = useRef(0)
  const targetLook = useRef({ x: 0, y: 0 })
  const wasRunning = useRef(false)
  const tensionClock = useRef(0)

  useEffect(() => {
    camera.rotation.order = 'YXZ'
    camera.position.set(0, B.eye, cameraZ(0))
  }, [camera])

  useEffect(() => {
    const el = gl.domElement

    const onWheel = (e) => {
      if (state.phase !== 'walk') return
      e.preventDefault()
      nav.target = clamp(nav.target + e.deltaY * 0.0095, 0, MAX_POS)
    }

    let touch = null
    const onTouchStart = (e) => {
      touch = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
    const onTouchMove = (e) => {
      if (!touch || state.phase !== 'walk') return
      const x = e.touches[0].clientX
      const y = e.touches[0].clientY
      nav.target = clamp(nav.target + (touch.y - y) * 0.016, 0, MAX_POS)
      // dragging sideways walks you across the corridor towards a door
      nav.strafe = clamp(nav.strafe + (x - touch.x) * 0.006, -STRAFE_LIMIT, STRAFE_LIMIT)
      touch = { x, y }
    }
    const onTouchEnd = () => {
      touch = null
    }

    /* Escape unwinds one step at a time: out of the chair first, out of the
     * room second. Leaving straight from a seated camera skipped the stand-up
     * move and teleported you into the corridor. */
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (state.seated) standUp()
        else leaveRoom()
        return
      }
      keys.current.add(e.key.toLowerCase())
      if ([' ', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key)) e.preventDefault()
    }
    const onKeyUp = (e) => keys.current.delete(e.key.toLowerCase())
    const onBlur = () => keys.current.clear()

    /* Inside a room the camera stops on the centre line facing the boards, so
     * the head turn is the only way to see the side walls — and the side walls
     * are where the dressing is. At 0.5 rad the desk in the ABOUT room sat
     * permanently off-frame. 1.0 rad plus the ~50° half-FOV reaches past 90°,
     * which is what it takes to look at something standing beside you. */
    /* Seated, the head is locked. The mouse both aims the view and places the
     * cursor, so any head-turn at all drags the screen out from under the
     * pointer: at 0.3 rad the panel slid 0.42m at arm's length — wider than a
     * desktop icon — and reaching for one moved it away. You are sitting
     * looking at a monitor; stand up to look around the room. */
    const onPointerMove = (e) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1
      const ny = (e.clientY / window.innerHeight) * 2 - 1
      if (state.seated) {
        targetLook.current.x = 0
        targetLook.current.y = 0
        return
      }
      const range = state.phase === 'inside' ? 1.0 : 0.2
      targetLook.current.x = -nx * range
      targetLook.current.y = clamp(-ny * range * 0.45, -0.4, 0.4)
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('touchend', onTouchEnd)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    window.addEventListener('pointermove', onPointerMove)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('pointermove', onPointerMove)
    }
  }, [gl])

  useFrame((s, rawDt) => {
    const dt = Math.min(rawDt, 1 / 12)
    const t = s.clock.elapsedTime
    const phase = state.phase

    /* The building's lights. Advanced here, before anything reads it, because
     * Rig is the first useFrame in the tree and is the only one that runs no
     * matter which room is mounted. */
    nav.lit = damp(nav.lit, state.lightsOn ? 1 : 0, 3.4, dt)
    // sitting down and getting up again
    nav.sitT = damp(nav.sitT, state.seated ? 1 : 0, 4.2, dt)

    const k = keys.current
    const holdingRun = k.has('shift')

    /* ---- forward / sideways input ---- */
    if (phase === 'walk') {
      let drive = 0
      if (k.has('w') || k.has('arrowup') || k.has(' ')) drive += 1
      if (k.has('s') || k.has('arrowdown')) drive -= 1
      if (drive !== 0) {
        const spd = holdingRun ? RUN_SPEED : WALK_SPEED
        nav.target = clamp(nav.target + drive * spd * dt, 0, MAX_POS)
      }
      let strafeIn = 0
      if (k.has('a') || k.has('arrowleft')) strafeIn -= 1
      if (k.has('d') || k.has('arrowright')) strafeIn += 1
      if (strafeIn !== 0) {
        nav.strafe = clamp(nav.strafe + strafeIn * 2.4 * dt, -STRAFE_LIMIT, STRAFE_LIMIT)
      }
    }

    /* ---- room transitions ---- */
    if (phase === 'entering') {
      if (nav.roomT === 0) {
        posAtEnter.current = nav.pos
        lateralAtEnter.current = nav.lateral
      }
      nav.roomT = Math.min(1, nav.roomT + dt / ENTER_TIME)
      if (nav.roomT >= 1) set({ phase: 'inside' })
    } else if (phase === 'leaving') {
      nav.roomT = Math.max(0, nav.roomT - dt / LEAVE_TIME)
      if (nav.roomT <= 0) {
        set({ phase: 'walk', activeRoom: -1, nearDoor: -1 })
        nav.target = nav.pos
      }
    }

    /* ---- position along the corridor ---- */
    const door = state.activeRoom >= 0 ? DOORS[state.activeRoom] : null
    const prevZ = camera.position.z
    const prevX = camera.position.x

    if (door) {
      const doorPos = B.entry - door.z
      // smootherstep rather than easeInOut: it is second-order continuous, so
      // the camera has no detectable kick at either end of the move
      const walk = smootherstep(clamp01(nav.roomT / 0.42))
      nav.pos = lerp(posAtEnter.current, doorPos, walk)
      nav.target = nav.pos
    } else {
      nav.pos = damp(nav.pos, nav.target, POS_DAMP, dt)
    }

    const baseZ = cameraZ(nav.pos)

    /* ---- doors pull you across the corridor as you come alongside ---- */
    let pull = 0
    let nearest = -1
    let nearestDist = 1e9
    if (!door) {
      for (const d of DOORS) {
        const dz = Math.abs(baseZ - d.z)
        if (dz < PULL_RANGE) {
          const w = 1 - dz / PULL_RANGE
          pull += d.side * DOOR_PULL * w * w
        }
        const dist = Math.hypot(baseZ - d.z, nav.lateral - d.x)
        if (dist < nearestDist) {
          nearestDist = dist
          nearest = d.index
        }
      }
    }
    const lateralTarget = clamp(nav.strafe + pull, -STRAFE_LIMIT, STRAFE_LIMIT)
    nav.lateral = damp(nav.lateral, lateralTarget, LATERAL_DAMP, dt)

    /* ---- position and orientation ---- */
    let x = nav.lateral
    let yaw = 0

    if (door) {
      const e = smootherstep(clamp01((nav.roomT - 0.3) / 0.7))
      const p1 = door.side * (B.width / 2 + B.recess)
      /* Sitting only moves you deeper into the room and lower — the yaw is
       * already facing the far wall, which is exactly where the desk is, so
       * there is no turn to blend. */
      const deep = lerp(B.roomD * standDepth(door.room), SEAT.x, nav.sitT)
      const p2 = door.side * (B.width / 2 + B.recess + deep)
      const from = lateralAtEnter.current
      x = from * (1 - e) * (1 - e) + 2 * (1 - e) * e * p1 + e * e * p2
      yaw = smootherstep(clamp01((nav.roomT - 0.22) / 0.78)) * ((-door.side * Math.PI) / 2)
    } else if (nearest >= 0 && nearestDist < PULL_RANGE) {
      /* Turn to look at the door as you draw level with it. This aims at where
       * the door actually is rather than leaning a fixed amount — standing
       * right beside one puts it nearly 60° off the corridor axis, so any fixed
       * angle small enough to look natural further out leaves it off-screen at
       * the moment you are about to walk through it. */
      const d = DOORS[nearest]
      const dz = Math.abs(baseZ - d.z)
      // commits harder now that arriving beside a door is not enough to enter
      // it — you have to be able to see the thing you are being asked to click
      const w = Math.pow(clamp01(1 - dz / PULL_RANGE), 1.25)
      const bearing = Math.atan2(-(d.x - x), -(d.z - baseZ))
      yaw = clamp(w * bearing, -1.15, 1.15)
    }

    /* ---- gait ---- */
    const moved = Math.hypot(baseZ - prevZ, x - prevX)
    nav.speed = damp(nav.speed, moved / Math.max(dt, 1e-4), SPEED_DAMP, dt)
    nav.walked += moved

    const sprinting = phase === 'walk' && (nav.speed > SPRINT_AT || (holdingRun && nav.speed > 0.6))
    if (sprinting !== state.running) set({ running: sprinting })

    nav.bobPhase += moved * (sprinting ? BOB_PER_M_RUN : BOB_PER_M_WALK)

    const gait = clamp01(nav.speed / (sprinting ? 6 : 2.4))
    // the walk through a doorway is a scripted move, not you walking — let the
    // bob fall away as it takes over, or the arrival wobbles
    // sitting is not walking: kill what is left of the head bob entirely
    const scripted = (1 - nav.roomT * 0.85) * (1 - nav.sitT)
    const amp = ((sprinting ? 0.03 : 0.012) + gait * (sprinting ? 0.062 : 0.036)) * scripted
    const bobY = Math.sin(nav.bobPhase) * amp
    const bobX = Math.sin(nav.bobPhase * 0.5) * amp * 0.8
    const roll = Math.sin(nav.bobPhase * 0.5) * gait * (sprinting ? 0.03 : 0.012) * scripted
    const breathe = Math.sin(t * 0.9) * 0.006 + Math.sin(t * 0.37) * 0.004

    // one footstep every half cycle of the bob
    const half = Math.floor(nav.bobPhase / Math.PI)
    if (half !== lastHalfStep.current) {
      if (gait > 0.06) {
        audio.footstep(0.4 + gait * 0.6, sprinting)
        stepParity.current++
        if (sprinting && stepParity.current % 2 === 0) audio.breath(stepParity.current % 4 === 0)
      }
      lastHalfStep.current = half
    }
    if (!sprinting && wasRunning.current) audio.breath(false)
    wasRunning.current = sprinting

    const eye = lerp(B.eye, SEAT.eye, nav.sitT)
    camera.position.set(x + bobX * 0.4, eye + bobY + breathe, baseZ)

    /* ---- close to a door: prompt only, never an automatic entry ---- */
    if (phase === 'walk') {
      const armed = nearest >= 0 && nearestDist < OPEN_RADIUS
      if (state.nearDoor !== (armed ? nearest : -1)) set({ nearDoor: armed ? nearest : -1 })
    }

    /* ---- the room gets audibly worse the closer you get to a door ---- */
    tensionClock.current += dt
    if (tensionClock.current > 0.1) {
      tensionClock.current = 0
      const near = nearest >= 0 ? clamp01(1 - nearestDist / PULL_RANGE) : 0
      audio.setTension(door ? 1 : near * near)
    }

    /* ---- look ---- */
    // sitting down without touching the mouse would otherwise keep whatever
    // head-turn you were standing with, leaving the screen off to one side
    if (state.seated) {
      targetLook.current.x = 0
      targetLook.current.y = 0
    }
    nav.lookX = damp(nav.lookX, targetLook.current.x, LOOK_DAMP, dt)
    nav.lookY = damp(nav.lookY, targetLook.current.y, LOOK_DAMP, dt)
    camera.rotation.y = yaw + nav.lookX
    camera.rotation.x = nav.lookY + Math.sin(t * 0.63) * 0.004
    camera.rotation.z = roll + Math.sin(t * 0.41) * 0.0025
  })

  return null
}

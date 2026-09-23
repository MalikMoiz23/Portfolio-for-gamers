import * as THREE from 'three'

/* ============================================================================
 * THE PROJECT DESKTOP
 * ----------------------------------------------------------------------------
 * The centre monitor in the PROJECTS room. A desktop with one icon per project;
 * clicking an icon opens that project's window, and the window's OPEN button
 * follows the project's href.
 *
 * Two halves that have to agree exactly:
 *   draw(state, t) paints the canvas
 *   hit(u, v)      says what is under a click, in the SAME layout
 * Everything positionable therefore comes from `layout()`, which both use. The
 * moment those two computed their rectangles separately, the clickable regions
 * drifted from the pixels under them.
 *
 * `u, v` arrive from the mesh's UV, so they are 0..1 across the panel with v
 * measured from the TOP (the caller flips three's bottom-up V).
 * ========================================================================== */

/* Ultrawide, and physically wider than the other panels. A 1024x600 desktop on
 * a 0.82m monitor a metre away renders about 250 screen pixels across, which
 * turns 17px body copy into 4px of mush. The panel carries its own size in
 * metres so the monitor is built to fit it — and it is deliberately a big
 * screen seen from close, because the projects have to be READABLE, not
 * plausible furniture. */
const W = 1280
const H = 560
export const PANEL = { w: 1.3, h: 0.568 }

const MONO = 'Consolas, "Cascadia Mono", "SF Mono", Menlo, monospace'
const SANS = '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif'

const C = {
  ink: '#e8eef8',
  dim: '#9aa8bd',
  faint: '#6b7889',
  panel: '#121824',
  panelHi: '#182131',
  line: '#26304180',
  bar: '#0b0f18',
}

const ICON_COLS = ['#5ce1ff', '#ff6ec7', '#7dffa4', '#c792ff', '#ffc46b']

/* ---- layout (shared by draw and hit) ------------------------------------- */

function layout(n) {
  const bar = { x: 0, y: H - 46, w: W, h: 46 }
  const icons = []
  for (let i = 0; i < n; i++) {
    icons.push({ x: 26, y: 70 + i * 102, w: 150, h: 92, i })
  }
  const taskbar = []
  const tw = 200
  for (let i = 0; i < n; i++) {
    taskbar.push({ x: 104 + i * (tw + 10), y: H - 38, w: tw, h: 30, i })
  }
  // the window takes almost the whole panel: reading a project is the job, and
  // the icons only have to stay reachable beside it
  const win = { x: 196, y: 52, w: W - 226, h: H - 116 }
  const close = { x: win.x + win.w - 48, y: win.y + 10, w: 34, h: 30 }
  const open = { x: win.x + 40, y: win.y + win.h - 76, w: 200, h: 48 }
  return { bar, icons, taskbar, win, close, open }
}

const inside = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h

/* ---- painting ------------------------------------------------------------ */

function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/)
  const lines = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > maxW && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

export function makeDesktop(projects, accent = '#ff3d81') {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  texture.generateMipmaps = false
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter

  const L = layout(projects.length)

  const wallpaper = () => {
    const g = ctx.createLinearGradient(0, 0, W, H)
    g.addColorStop(0, '#070b13')
    g.addColorStop(0.55, '#0c1220')
    g.addColorStop(1, '#141024')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)

    // a faint grid, so the background is not a flat gradient
    ctx.strokeStyle = 'rgba(255,255,255,0.022)'
    ctx.lineWidth = 1
    for (let x = 0; x < W; x += 48) {
      ctx.beginPath()
      ctx.moveTo(x + 0.5, 0)
      ctx.lineTo(x + 0.5, H)
      ctx.stroke()
    }
    for (let y = 0; y < H; y += 48) {
      ctx.beginPath()
      ctx.moveTo(0, y + 0.5)
      ctx.lineTo(W, y + 0.5)
      ctx.stroke()
    }

    const glow = ctx.createRadialGradient(W * 0.78, H * 0.2, 0, W * 0.78, H * 0.2, W * 0.5)
    glow.addColorStop(0, `${accent}1e`)
    glow.addColorStop(1, `${accent}00`)
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, W, H)
  }

  const topBar = (t) => {
    ctx.fillStyle = C.bar
    ctx.fillRect(0, 0, W, 40)
    ctx.fillStyle = accent
    ctx.fillRect(0, 40, W, 2)
    ctx.font = `bold 19px ${MONO}`
    ctx.fillStyle = accent
    ctx.fillText('PROJECTS', 24, 27)
    ctx.font = `16px ${MONO}`
    ctx.fillStyle = C.faint
    ctx.fillText(`${projects.length} items`, 152, 27)

    const secs = Math.floor(t) % 60
    const mins = 34 + (Math.floor(t / 60) % 26)
    ctx.textAlign = 'right'
    ctx.fillStyle = C.dim
    ctx.fillText(`09:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`, W - 24, 27)
    ctx.textAlign = 'left'
  }

  const icon = (r, p, active) => {
    const col = ICON_COLS[r.i % ICON_COLS.length]
    roundRect(ctx, r.x, r.y, r.w, r.h, 8)
    ctx.fillStyle = active ? C.panelHi : 'rgba(255,255,255,0.035)'
    ctx.fill()
    ctx.strokeStyle = active ? col : C.line
    ctx.lineWidth = active ? 2 : 1
    ctx.stroke()

    // a folder glyph rather than a letter — letters at this size turn to mush
    const cx = r.x + r.w / 2
    ctx.fillStyle = col
    ctx.globalAlpha = 0.92
    roundRect(ctx, cx - 25, r.y + 14, 50, 34, 5)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = '#0b0f18'
    ctx.fillRect(cx - 18, r.y + 21, 36, 4)
    ctx.fillRect(cx - 18, r.y + 31, 27, 4)

    ctx.font = `14px ${MONO}`
    ctx.fillStyle = active ? C.ink : C.dim
    ctx.textAlign = 'center'
    const name = (p.title ?? '').slice(0, 15)
    ctx.fillText(name, cx, r.y + 72)
    ctx.textAlign = 'left'
  }

  const taskbar = (open) => {
    ctx.fillStyle = C.bar
    ctx.fillRect(L.bar.x, L.bar.y, L.bar.w, L.bar.h)
    ctx.fillStyle = C.line
    ctx.fillRect(0, L.bar.y, W, 1)

    ctx.fillStyle = accent
    roundRect(ctx, 22, L.bar.y + 10, 64, 26, 5)
    ctx.fill()
    ctx.font = `bold 14px ${MONO}`
    ctx.fillStyle = '#0b0f18'
    ctx.textAlign = 'center'
    ctx.fillText('MENU', 54, L.bar.y + 29)
    ctx.textAlign = 'left'

    L.taskbar.forEach((r, i) => {
      const on = i === open
      roundRect(ctx, r.x, r.y, r.w, r.h, 4)
      ctx.fillStyle = on ? C.panelHi : 'rgba(255,255,255,0.04)'
      ctx.fill()
      if (on) {
        ctx.fillStyle = accent
        ctx.fillRect(r.x, r.y + r.h - 2, r.w, 2)
      }
      ctx.font = `14px ${MONO}`
      ctx.fillStyle = on ? C.ink : C.faint
      ctx.fillText((projects[i].title ?? '').slice(0, 18), r.x + 12, r.y + 21)
    })
  }

  const window_ = (p, t) => {
    const { win } = L
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    roundRect(ctx, win.x + 8, win.y + 10, win.w, win.h, 8)
    ctx.fill()

    roundRect(ctx, win.x, win.y, win.w, win.h, 8)
    ctx.fillStyle = C.panel
    ctx.fill()
    ctx.strokeStyle = `${accent}55`
    ctx.lineWidth = 1
    ctx.stroke()

    // title bar
    ctx.save()
    roundRect(ctx, win.x, win.y, win.w, 52, 8)
    ctx.clip()
    ctx.fillStyle = '#0d1220'
    ctx.fillRect(win.x, win.y, win.w, 52)
    ctx.restore()
    ctx.fillStyle = accent
    ctx.fillRect(win.x, win.y + 52, win.w, 1.5)

    ctx.font = `bold 25px ${MONO}`
    ctx.fillStyle = C.ink
    ctx.fillText(p.title ?? '', win.x + 26, win.y + 35)
    if (p.meta) {
      ctx.font = `17px ${MONO}`
      ctx.fillStyle = C.faint
      ctx.fillText(p.meta, win.x + 42 + ctx.measureText(p.title ?? '').width, win.y + 35)
    }

    // close button
    const cb = L.close
    ctx.strokeStyle = C.dim
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(cb.x + 11, cb.y + 9)
    ctx.lineTo(cb.x + 23, cb.y + 21)
    ctx.moveTo(cb.x + 23, cb.y + 9)
    ctx.lineTo(cb.x + 11, cb.y + 21)
    ctx.stroke()

    let y = win.y + 106
    ctx.font = `24px ${SANS}`
    ctx.fillStyle = C.dim
    for (const line of wrap(ctx, p.body ?? '', win.w - 90)) {
      ctx.fillText(line, win.x + 40, y)
      y += 36
    }

    if (p.tags?.length) {
      y += 26
      ctx.font = `16px ${MONO}`
      let tx = win.x + 40
      for (const tag of p.tags) {
        const tw = ctx.measureText(tag).width + 30
        roundRect(ctx, tx, y - 20, tw, 32, 5)
        ctx.fillStyle = `${accent}22`
        ctx.fill()
        ctx.strokeStyle = `${accent}55`
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.fillStyle = accent
        ctx.fillText(tag, tx + 15, y + 3)
        tx += tw + 10
      }
    }

    /* A preview pane. Without it the window was a title, three lines and a
     * button floating in 200px of empty panel, which reads as an unfinished
     * layout rather than as an app. Abstract on purpose: a fake screenshot of a
     * real product would be a lie, a diagram is just furniture. */
    const pv = { x: win.x + 40, y: y + 34, w: win.w - 80, h: win.y + win.h - y - 132 }
    if (pv.h > 60) {
      roundRect(ctx, pv.x, pv.y, pv.w, pv.h, 6)
      ctx.fillStyle = 'rgba(255,255,255,0.028)'
      ctx.fill()
      ctx.strokeStyle = C.line
      ctx.lineWidth = 1
      ctx.stroke()

      ctx.save()
      roundRect(ctx, pv.x, pv.y, pv.w, pv.h, 6)
      ctx.clip()
      // a seeded skyline, stable per project so it does not shimmer on redraw
      let h = 0
      for (let i = 0; i < (p.title ?? '').length; i++) h = (h * 31 + p.title.charCodeAt(i)) & 0xffff
      const rnd = () => ((h = (h * 1103515245 + 12345) & 0x7fffffff) >>> 12) / 524288
      const n = 26
      const bw = pv.w / n
      for (let i = 0; i < n; i++) {
        const bh = (0.18 + rnd() * 0.72) * pv.h
        ctx.fillStyle = i % 5 === 0 ? `${accent}66` : `rgba(255,255,255,${0.05 + rnd() * 0.06})`
        ctx.fillRect(pv.x + i * bw + 2, pv.y + pv.h - bh, bw - 4, bh)
      }
      ctx.strokeStyle = `${accent}88`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const yy = pv.y + pv.h * (0.25 + Math.sin(i * 0.6 + h * 0.001) * 0.16)
        i ? ctx.lineTo(pv.x + i * bw + bw / 2, yy) : ctx.moveTo(pv.x + i * bw + bw / 2, yy)
      }
      ctx.stroke()
      ctx.restore()
    }

    // OPEN button, disabled when the project has no href
    const ob = L.open
    const live = !!p.href
    roundRect(ctx, ob.x, ob.y, ob.w, ob.h, 5)
    ctx.fillStyle = live ? `${accent}26` : 'rgba(255,255,255,0.03)'
    ctx.fill()
    ctx.strokeStyle = live ? accent : C.line
    ctx.lineWidth = 1.4
    ctx.stroke()
    ctx.font = `bold 18px ${MONO}`
    ctx.fillStyle = live ? accent : C.faint
    ctx.textAlign = 'center'
    ctx.fillText(live ? 'OPEN  →' : 'NO LINK', ob.x + ob.w / 2, ob.y + 31)
    ctx.textAlign = 'left'

    // caret, so the window reads as live rather than as a screenshot
    if (Math.floor(t * 1.6) % 2 === 0) {
      ctx.fillStyle = `${accent}aa`
      ctx.fillRect(win.x + win.w - 34, win.y + win.h - 30, 9, 15)
    }
  }

  /* Shown until something is open. It points at the icon rail rather than
   * floating in the middle of the wallpaper — an instruction that does not
   * indicate what to click is just a caption. */
  const hint = (t) => {
    const cx = W / 2 + 60
    const cy = H / 2 - 20
    ctx.textAlign = 'center'

    ctx.font = `bold 34px ${MONO}`
    ctx.fillStyle = C.ink
    ctx.globalAlpha = 0.85 + Math.sin(t * 1.8) * 0.15
    ctx.fillText('PICK A PROJECT', cx, cy)
    ctx.globalAlpha = 1

    ctx.font = `21px ${SANS}`
    ctx.fillStyle = C.dim
    ctx.fillText('Click any of the four on the left to read about it,', cx, cy + 42)
    ctx.fillText('then OPEN to visit the real thing.', cx, cy + 72)

    // an arrow back toward the icon rail, pulsing
    const ax = L.icons[0] ? L.icons[0].x + L.icons[0].w + 24 : 200
    const ay = cy - 10
    const nudge = Math.sin(t * 2.2) * 8
    ctx.strokeStyle = accent
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.globalAlpha = 0.75
    ctx.beginPath()
    ctx.moveTo(ax + 150 + nudge, ay)
    ctx.lineTo(ax + nudge, ay)
    ctx.moveTo(ax + 22 + nudge, ay - 14)
    ctx.lineTo(ax + nudge, ay)
    ctx.lineTo(ax + 22 + nudge, ay + 14)
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.textAlign = 'left'
  }

  const draw = (open, t) => {
    wallpaper()
    topBar(t)
    L.icons.forEach((r, i) => icon(r, projects[i], i === open))
    if (open >= 0 && projects[open]) window_(projects[open], t)
    else hint(t)
    taskbar(open)

    // panel glass: scanlines and a corner falloff
    ctx.globalAlpha = 0.04
    ctx.fillStyle = '#000'
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1)
    ctx.globalAlpha = 1
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95)
    v.addColorStop(0, 'rgba(0,0,0,0)')
    v.addColorStop(1, 'rgba(0,0,0,0.38)')
    ctx.fillStyle = v
    ctx.fillRect(0, 0, W, H)

    texture.needsUpdate = true
  }

  /* Returns what a click at (u, v) means, or null for dead space. The caller
   * decides what to do with it — this module never touches the store. */
  const hit = (u, v, open) => {
    const x = u * W
    const y = v * H

    if (open >= 0 && projects[open]) {
      if (inside(L.close, x, y)) return { kind: 'close' }
      if (inside(L.open, x, y)) {
        return projects[open].href ? { kind: 'link', href: projects[open].href } : { kind: 'none' }
      }
      // anywhere else on the window swallows the click, so a stray press on the
      // body does not close the thing you are reading
      if (inside(L.win, x, y)) return { kind: 'none' }
    }
    for (const r of L.icons) if (inside(r, x, y)) return { kind: 'open', index: r.i }
    for (const r of L.taskbar) if (inside(r, x, y)) return { kind: 'open', index: r.i }
    return null
  }

  draw(-1, 0)
  // w/h are the panel's size in metres; the Monitor builds itself to fit
  return { canvas, texture, draw, hit, w: PANEL.w, h: PANEL.h, glow: '#3a2a52', fps: 5 }
}

import * as THREE from 'three'

/* ============================================================================
 * LIVE SCREENS
 * ----------------------------------------------------------------------------
 * The monitors on the battlestation are canvases, repainted on a timer and
 * uploaded to the GPU as textures. Three faces: an editor, a terminal and a
 * telemetry panel.
 *
 * Repaint cost is the whole story here. A 512x320 canvas re-uploaded at 60fps
 * for three screens is ~118 MB/s of texture traffic for content the eye reads
 * as "code is scrolling". Every screen therefore declares its own `fps` and
 * the caller staggers them, so at most one upload lands per frame.
 * ========================================================================== */

const W = 512
const H = 320

const MONO = 'Consolas, "Cascadia Mono", "SF Mono", Menlo, monospace'

/* One neon syntax palette shared by every screen, so three different panels
 * still read as one machine. */
const C = {
  bg: '#080b10',
  chrome: '#0d1219',
  gutter: '#2b3444',
  line: '#151c26',
  plain: '#c3cede',
  dim: '#5d6b7e',
  kw: '#ff6ec7',
  str: '#7dffa4',
  num: '#ffc46b',
  fn: '#5ce1ff',
  type: '#c792ff',
  comment: '#465468',
  ok: '#39ff9e',
  warn: '#ffcb6b',
  err: '#ff3d81',
  cyan: '#00e5ff',
}

function newCanvas() {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  return c
}

function newTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  t.generateMipmaps = false
  t.minFilter = THREE.LinearFilter
  t.magFilter = THREE.LinearFilter
  return t
}

/* Scanlines and a corner falloff. Without them a canvas reads as a sticker
 * rather than as a panel that is actually emitting. */
function glassOver(ctx) {
  ctx.globalAlpha = 0.055
  ctx.fillStyle = '#000000'
  for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1)
  ctx.globalAlpha = 1

  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.92)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.42)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}

/* ---- editor -------------------------------------------------------------- */

const TOKEN =
  /(\/\/[^\n]*)|('[^']*'|"[^"]*"|`[^`]*`)|\b(0x[\da-fA-F]+|\d+\.?\d*)\b|\b(const|let|var|function|return|import|export|from|default|if|else|for|of|in|await|async|new|class|extends|null|true|false|this)\b|\b([A-Z][\w$]*)\b|([A-Za-z_$][\w$]*)(?=\s*\()/g

function tokenize(line) {
  const out = []
  let last = 0
  TOKEN.lastIndex = 0
  let m
  while ((m = TOKEN.exec(line))) {
    if (m.index > last) out.push([line.slice(last, m.index), C.plain])
    const color = m[1] ? C.comment : m[2] ? C.str : m[3] ? C.num : m[4] ? C.kw : m[5] ? C.type : C.fn
    out.push([m[0], color])
    last = m.index + m[0].length
  }
  if (last < line.length) out.push([line.slice(last), C.plain])
  return out
}

const CODE = [
  "import { useFrame } from '@react-three/fiber'",
  "import { damp, clamp01 } from './util'",
  '',
  '// the room only exists while you are standing in it',
  'export function Room({ door, accent }) {',
  '  const glow = useRef()',
  '  const strips = useMemo(() => buildStrips(door), [door])',
  '',
  '  useFrame((s, dt) => {',
  '    const t = s.clock.elapsedTime',
  '    const pulse = 0.82 + Math.sin(t * 1.7) * 0.18',
  '    glow.current.intensity = damp(',
  '      glow.current.intensity,',
  '      pulse * 14,',
  '      6,',
  '      dt,',
  '    )',
  '  })',
  '',
  '  return (',
  '    <group position={door.origin}>',
  '      <Shell accent={accent} />',
  '      <Boards room={door.room} />',
  '      <Battlestation live />',
  '    </group>',
  '  )',
  '}',
  '',
  'const FRAME_BUDGET = 16.6 // ms, never negotiate',
  '',
  'async function bake(recipes) {',
  '  for (const [key, make] of recipes) {',
  '    MAT[key] = await nextFrame(make)',
  '  }',
  '  return MAT',
  '}',
]

export function makeEditorScreen() {
  const canvas = newCanvas()
  const ctx = canvas.getContext('2d')
  const texture = newTexture(canvas)

  const LH = 11.5
  const TOP = 36
  const GUT = 30
  const rows = Math.floor((H - TOP - 14) / LH)

  const draw = (t) => {
    ctx.fillStyle = C.bg
    ctx.fillRect(0, 0, W, H)

    // title bar and tabs
    ctx.fillStyle = C.chrome
    ctx.fillRect(0, 0, W, 22)
    ctx.fillStyle = '#0a0e14'
    ctx.fillRect(0, 22, W, 1)
    ;[
      ['#ff5f57', 12],
      ['#febc2e', 24],
      ['#28c840', 36],
    ].forEach(([col, x]) => {
      ctx.fillStyle = col
      ctx.beginPath()
      ctx.arc(x, 11, 3.6, 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.font = `9px ${MONO}`
    ctx.fillStyle = C.dim
    ctx.fillText('Room.jsx — portfolio', 56, 14)

    ctx.fillStyle = '#10161f'
    ctx.fillRect(0, 23, W, 13)
    ctx.fillStyle = C.cyan
    ctx.fillRect(8, 23, 74, 1.5)
    ctx.font = `8.5px ${MONO}`
    ctx.fillStyle = C.plain
    ctx.fillText('Room.jsx', 14, 33)
    ctx.fillStyle = C.dim
    ctx.fillText('screens.js', 92, 33)
    ctx.fillText('content.js', 160, 33)

    // slow scroll through the file, one line every ~1.4s
    const off = Math.floor(t / 1.4) % CODE.length
    const active = 4

    for (let i = 0; i < rows; i++) {
      const src = CODE[(off + i) % CODE.length]
      const y = TOP + i * LH + 8

      if (i === active) {
        ctx.fillStyle = C.line
        ctx.fillRect(GUT - 4, y - 8.5, W - GUT - 26, LH)
      }

      ctx.font = `9px ${MONO}`
      ctx.textAlign = 'right'
      ctx.fillStyle = i === active ? C.plain : C.gutter
      ctx.fillText(String(((off + i) % CODE.length) + 1).padStart(3, ' '), GUT - 10, y)
      ctx.textAlign = 'left'

      let x = GUT
      ctx.font = `9.5px ${MONO}`
      for (const [text, color] of tokenize(src)) {
        ctx.fillStyle = color
        ctx.fillText(text, x, y)
        x += ctx.measureText(text).width
      }

      if (i === active && Math.floor(t * 1.8) % 2 === 0) {
        ctx.fillStyle = C.cyan
        ctx.fillRect(x + 1, y - 7.5, 1.6, 9)
      }
    }

    // minimap: the same file, too small to read, which is the point
    ctx.globalAlpha = 0.38
    for (let i = 0; i < CODE.length; i++) {
      const src = CODE[i]
      if (!src) continue
      const y = TOP + i * 5.6
      if (y > H - 20) break
      ctx.fillStyle = src.trimStart().startsWith('//') ? C.comment : C.gutter
      ctx.fillRect(W - 22, y, Math.min(18, src.length * 0.34), 2)
    }
    ctx.globalAlpha = 1

    // status bar
    ctx.fillStyle = '#0b1119'
    ctx.fillRect(0, H - 13, W, 13)
    ctx.fillStyle = C.cyan
    ctx.fillRect(0, H - 13, 3, 13)
    ctx.font = `8px ${MONO}`
    ctx.fillStyle = C.dim
    ctx.fillText(`main*  ·  Ln ${off + active + 1}, Col 24  ·  JSX  ·  UTF-8`, 10, H - 4)
    ctx.fillStyle = C.ok
    ctx.textAlign = 'right'
    ctx.fillText('0 problems', W - 10, H - 4)
    ctx.textAlign = 'left'

    glassOver(ctx)
    texture.needsUpdate = true
  }

  return { canvas, texture, draw, glow: '#2f6ea8', fps: 6 }
}

/* ---- terminal ------------------------------------------------------------ */

const LOG = [
  ['$', 'npm run dev', C.plain],
  ['', 'VITE v7.3.6  ready in 612 ms', C.ok],
  ['', '', C.dim],
  ['→', 'Local:   http://localhost:5173/', C.cyan],
  ['→', 'Network: http://192.168.1.185:5173/', C.cyan],
  ['', '', C.dim],
  ['', '[vite] hmr update /src/scene/Room.jsx', C.dim],
  ['', '[bake] wall      512²  ok   38ms', C.dim],
  ['', '[bake] floor     512²  ok   41ms', C.dim],
  ['', '[bake] steel     256²  ok   12ms', C.dim],
  ['', 'draw calls 141  ·  tris 84.2k  ·  16.1 ms', C.warn],
  ['$', 'npm test -- --run', C.plain],
  ['', '✓ layout      12 passed', C.ok],
  ['', '✓ board       27 passed', C.ok],
  ['', '✓ screens      9 passed', C.ok],
  ['', 'Test Files  3 passed (3)', C.ok],
  ['', 'Duration    1.42s', C.dim],
  ['$', 'git commit -m "neon pass"', C.plain],
  ['', '[main 7f3a91c] neon pass', C.dim],
  ['', ' 9 files changed, 612 insertions(+)', C.dim],
  ['$', '', C.plain],
]

export function makeTerminalScreen() {
  const canvas = newCanvas()
  const ctx = canvas.getContext('2d')
  const texture = newTexture(canvas)

  const LH = 12
  const TOP = 34
  const rows = Math.floor((H - TOP - 10) / LH)
  const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

  const draw = (t) => {
    ctx.fillStyle = '#04070a'
    ctx.fillRect(0, 0, W, H)

    ctx.fillStyle = C.chrome
    ctx.fillRect(0, 0, W, 22)
    ctx.fillStyle = C.ok
    ctx.fillRect(0, 22, W, 1)
    ctx.font = `9px ${MONO}`
    ctx.fillStyle = C.dim
    ctx.textAlign = 'center'
    ctx.fillText('zsh — portfolio — 132×34', W / 2, 14)
    ctx.textAlign = 'left'

    // lines reveal one at a time, then the whole log scrolls
    const revealed = Math.floor(t * 1.6)
    const start = Math.max(0, revealed - rows + 1)

    for (let i = 0; i < rows; i++) {
      const idx = start + i
      if (idx > revealed) break
      const entry = LOG[idx % LOG.length]
      if (!entry) continue
      const [mark, text, color] = entry
      const y = TOP + i * LH

      let x = 10
      if (mark === '$') {
        ctx.font = `9.5px ${MONO}`
        ctx.fillStyle = C.ok
        ctx.fillText('moiz', x, y)
        x += ctx.measureText('moiz').width
        ctx.fillStyle = C.dim
        ctx.fillText(':', x, y)
        x += ctx.measureText(':').width
        ctx.fillStyle = C.cyan
        ctx.fillText('~/portfolio', x, y)
        x += ctx.measureText('~/portfolio').width
        ctx.fillStyle = C.kw
        ctx.fillText(' $ ', x, y)
        x += ctx.measureText(' $ ').width
      } else if (mark) {
        ctx.font = `9.5px ${MONO}`
        ctx.fillStyle = C.ok
        ctx.fillText(mark, x, y)
        x += 12
      } else {
        x = 22
      }

      ctx.font = `9.5px ${MONO}`
      ctx.fillStyle = color
      ctx.fillText(text, x, y)

      // caret on the last line that has been revealed
      if (idx === revealed && Math.floor(t * 2.2) % 2 === 0) {
        ctx.fillStyle = C.ok
        ctx.fillRect(x + ctx.measureText(text).width + 2, y - 7.5, 5, 9)
      }
    }

    // a job that never finishes, pinned to the bottom
    ctx.fillStyle = '#070c10'
    ctx.fillRect(0, H - 16, W, 16)
    ctx.font = `9.5px ${MONO}`
    ctx.fillStyle = C.warn
    ctx.fillText(SPIN[Math.floor(t * 9) % SPIN.length], 10, H - 5)
    ctx.fillStyle = C.dim
    ctx.fillText('watching 41 files for changes', 24, H - 5)

    glassOver(ctx)
    texture.needsUpdate = true
  }

  return { canvas, texture, draw, glow: '#1f7a4d', fps: 9 }
}

/* ---- telemetry ----------------------------------------------------------- */

export function makeStatsScreen() {
  const canvas = newCanvas()
  const ctx = canvas.getContext('2d')
  const texture = newTexture(canvas)

  // one rolling history per trace, filled in as the screen ticks
  const N = 96
  const traces = [
    { label: 'CPU', color: C.cyan, data: new Array(N).fill(0.3), f: (t) => 0.42 + Math.sin(t * 1.3) * 0.2 + Math.sin(t * 7.1) * 0.08 },
    { label: 'GPU', color: C.kw, data: new Array(N).fill(0.5), f: (t) => 0.61 + Math.sin(t * 0.8 + 2) * 0.16 + Math.sin(t * 5.3) * 0.07 },
    { label: 'NET', color: C.ok, data: new Array(N).fill(0.1), f: (t) => 0.22 + Math.abs(Math.sin(t * 2.1)) * 0.5 },
  ]

  const bars = [
    { label: 'MEM', v: 0.58, color: C.type },
    { label: 'VRAM', v: 0.41, color: C.cyan },
    { label: 'DISK', v: 0.73, color: C.warn },
    { label: 'TEMP', v: 0.36, color: C.ok },
  ]

  const push = (t) => {
    for (const tr of traces) {
      tr.data.push(Math.max(0.02, Math.min(1, tr.f(t))))
      if (tr.data.length > N) tr.data.shift()
    }
  }

  const trace = (tr, x, y, w, h) => {
    ctx.strokeStyle = '#141b25'
    ctx.lineWidth = 1
    for (let i = 1; i < 4; i++) {
      ctx.beginPath()
      ctx.moveTo(x, y + (h / 4) * i)
      ctx.lineTo(x + w, y + (h / 4) * i)
      ctx.stroke()
    }

    const step = w / (N - 1)
    const pt = (i) => [x + i * step, y + h - tr.data[i] * h]

    // filled area under the trace, so three graphs do not read as three wires
    ctx.beginPath()
    ctx.moveTo(x, y + h)
    for (let i = 0; i < N; i++) ctx.lineTo(...pt(i))
    ctx.lineTo(x + w, y + h)
    ctx.closePath()
    const g = ctx.createLinearGradient(0, y, 0, y + h)
    g.addColorStop(0, `${tr.color}44`)
    g.addColorStop(1, `${tr.color}00`)
    ctx.fillStyle = g
    ctx.fill()

    ctx.beginPath()
    for (let i = 0; i < N; i++) (i ? ctx.lineTo : ctx.moveTo).apply(ctx, pt(i))
    ctx.strokeStyle = tr.color
    ctx.lineWidth = 1.4
    ctx.stroke()

    const [hx, hy] = pt(N - 1)
    ctx.fillStyle = tr.color
    ctx.beginPath()
    ctx.arc(hx, hy, 2, 0, Math.PI * 2)
    ctx.fill()

    ctx.font = `8px ${MONO}`
    ctx.fillStyle = C.dim
    ctx.fillText(tr.label, x + 3, y + 9)
    ctx.fillStyle = tr.color
    ctx.textAlign = 'right'
    ctx.fillText(`${Math.round(tr.data[N - 1] * 100)}%`, x + w - 3, y + 9)
    ctx.textAlign = 'left'
  }

  const draw = (t) => {
    push(t)

    ctx.fillStyle = C.bg
    ctx.fillRect(0, 0, W, H)

    ctx.fillStyle = C.chrome
    ctx.fillRect(0, 0, W, 24)
    ctx.fillStyle = C.cyan
    ctx.fillRect(0, 24, W, 1)
    ctx.font = `bold 10px ${MONO}`
    ctx.fillStyle = C.cyan
    ctx.fillText('SYSTEM', 12, 15)
    ctx.font = `9px ${MONO}`
    ctx.fillStyle = C.dim
    ctx.fillText('uptime 14d 06:22  ·  load 1.84', 74, 15)
    ctx.fillStyle = C.ok
    ctx.textAlign = 'right'
    ctx.fillText('● ONLINE', W - 12, 15)
    ctx.textAlign = 'left'

    const gx = 12
    const gw = W - 24
    const gh = 58
    traces.forEach((tr, i) => trace(tr, gx, 34 + i * (gh + 8), gw, gh))

    // the four gauges along the bottom
    const by = 34 + 3 * (gh + 8) + 6
    const bw = (W - 24 - 3 * 8) / 4
    bars.forEach((b, i) => {
      const x = 12 + i * (bw + 8)
      const v = Math.max(0.05, Math.min(0.97, b.v + Math.sin(t * 0.9 + i * 1.7) * 0.08))
      ctx.fillStyle = '#111823'
      ctx.fillRect(x, by + 12, bw, 6)
      ctx.fillStyle = b.color
      ctx.fillRect(x, by + 12, bw * v, 6)
      ctx.font = `8px ${MONO}`
      ctx.fillStyle = C.dim
      ctx.fillText(b.label, x, by + 7)
      ctx.fillStyle = b.color
      ctx.textAlign = 'right'
      ctx.fillText(`${Math.round(v * 100)}`, x + bw, by + 7)
      ctx.textAlign = 'left'
    })

    glassOver(ctx)
    texture.needsUpdate = true
  }

  return { canvas, texture, draw, glow: '#2a5f8f', fps: 8 }
}

/* ---- laptop ------------------------------------------------------------- */

/* Smaller and quieter than the three main panels — it is off to the side and
 * only ever seen at an angle, so it gets a cheap repaint and big type. */
export function makeLaptopScreen() {
  const canvas = newCanvas()
  const ctx = canvas.getContext('2d')
  const texture = newTexture(canvas)

  const draw = (t) => {
    ctx.fillStyle = '#060a0e'
    ctx.fillRect(0, 0, W, H)

    // a slow wave of "network activity" as a bar chart
    ctx.fillStyle = C.chrome
    ctx.fillRect(0, 0, W, 26)
    ctx.font = `bold 11px ${MONO}`
    ctx.fillStyle = C.kw
    ctx.fillText('DEPLOY', 14, 17)
    ctx.font = `9px ${MONO}`
    ctx.fillStyle = C.dim
    ctx.fillText('atlas-console · production', 80, 17)

    const n = 34
    const bw = (W - 28) / n
    for (let i = 0; i < n; i++) {
      const v = 0.2 + Math.abs(Math.sin(t * 0.7 + i * 0.35)) * 0.7
      const h = v * 150
      ctx.fillStyle = i === n - 1 ? C.ok : `${C.kw}66`
      ctx.fillRect(14 + i * bw, 200 - h, bw - 2, h)
    }

    ctx.fillStyle = '#141b25'
    ctx.fillRect(14, 202, W - 28, 1)

    ctx.font = `9.5px ${MONO}`
    const lines = [
      ['build', 'passed', C.ok],
      ['tests', '48 / 48', C.ok],
      ['bundle', '212 kB gzip', C.warn],
      ['deployed', `${Math.floor(t) % 60}s ago`, C.dim],
    ]
    lines.forEach(([k, v, col], i) => {
      const y = 226 + i * 18
      ctx.fillStyle = C.dim
      ctx.fillText(k, 16, y)
      ctx.fillStyle = col
      ctx.textAlign = 'right'
      ctx.fillText(v, W - 16, y)
      ctx.textAlign = 'left'
    })

    glassOver(ctx)
    texture.needsUpdate = true
  }

  return { canvas, texture, draw, glow: '#6a3f8f', fps: 5 }
}

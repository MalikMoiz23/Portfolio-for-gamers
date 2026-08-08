import * as THREE from 'three'
import { rng } from './scene/util'

/* ============================================================================
 * WALL BOARDS
 * ----------------------------------------------------------------------------
 * Turns a room's content blocks into printed boards that hang on the wall.
 *
 * Two passes. First every block is measured into atomic items; then the items
 * are packed into fixed-height columns. If the content needs more columns than
 * the wall has, the type scale drops and it packs again, until it fits. That is
 * why a long PROJECTS list and a three-line ABOUT both come out looking
 * deliberate instead of one overflowing and the other stranded.
 *
 * Anything with an href also emits a hotspot in board pixels, so Room.jsx can
 * float an invisible clickable quad exactly over it. Without that, putting the
 * contact details on a wall would mean nobody could click them.
 * ========================================================================== */

/* Courier New was the wrong call — its letterforms are thin, widely spaced and
 * read as a fax rather than as signage. Consolas and Cascadia are far tighter
 * and hold up at the sizes these boards use. */
const MONO = 'Consolas, "Cascadia Mono", "SF Mono", Menlo, "DejaVu Sans Mono", monospace'
const SANS = '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif'

const INK = '#ccd1ca'
const DIM = '#8a918a'
const FAINT = '#616861'
const BG = '#0b0d0c'
const RULE = '#272c29'

/* Draw the board bigger than it needs to be and let the GPU downsample. Costs
 * memory, buys crisp type when you walk right up to a board. */
const SS = 1.5

/* One spacing unit. Every gap below is a multiple of it, so the vertical rhythm
 * stays consistent instead of being a pile of arbitrary numbers. */
const U = 8

/* Canvas letter-spacing is Chrome 99+; harmless where it is missing. */
function tracking(ctx, px) {
  try {
    ctx.letterSpacing = `${px}px`
  } catch {
    /* older engine, spacing just stays default */
  }
}

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

/* ---- measuring ----------------------------------------------------------- */

/* Every item knows its own height and how to draw itself at a given y. Keeping
 * them atomic is what stops a card being sliced in half across two boards. */
function buildItems(m, room, index, total, W, s) {
  const items = []
  const push = (h, draw) => items.push({ h, draw })
  const gap = (h) => push(h * s, () => {})

  const F = {
    title: `bold ${Math.round(60 * s)}px ${MONO}`,
    sub: `${Math.round(23 * s)}px ${SANS}`,
    eyebrow: `${Math.round(16 * s)}px ${MONO}`,
    body: `${Math.round(25 * s)}px ${SANS}`,
    bullet: `${Math.round(25 * s)}px ${SANS}`,
    cardTitle: `bold ${Math.round(25 * s)}px ${MONO}`,
    cardMeta: `${Math.round(17 * s)}px ${MONO}`,
    cardBody: `${Math.round(23 * s)}px ${SANS}`,
    tag: `${Math.round(16 * s)}px ${MONO}`,
    barLabel: `${Math.round(24 * s)}px ${SANS}`,
    when: `${Math.round(17 * s)}px ${MONO}`,
    what: `${Math.round(27 * s)}px ${SANS}`,
    where: `${Math.round(22 * s)}px ${SANS}`,
    small: `${Math.round(22 * s)}px ${SANS}`,
    linkLabel: `${Math.round(17 * s)}px ${MONO}`,
    linkValue: `${Math.round(27 * s)}px ${SANS}`,
  }
  const LH = Math.round(36 * s)

  /* header, first column only */
  push(U * 3 * s, (c, x, y) => {
    c.font = F.eyebrow
    c.fillStyle = FAINT
    tracking(c, 3 * s)
    c.fillText(`ROOM ${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, x, y + 16 * s)
    tracking(c, 0)
  })
  gap(U * 2.5)
  push(66 * s, (c, x, y) => {
    c.font = F.title
    c.fillStyle = room.accent
    tracking(c, 4 * s)
    c.fillText(room.title, x, y + 54 * s)
    tracking(c, 0)
  })
  if (room.subtitle) {
    push(U * 4 * s, (c, x, y) => {
      c.font = F.sub
      c.fillStyle = DIM
      c.fillText(room.subtitle, x, y + 24 * s)
    })
  }
  gap(U * 1.5)
  push(U * 2 * s, (c, x, y) => {
    c.fillStyle = room.accent
    c.globalAlpha = 0.85
    c.fillRect(x, y + U * s, 78 * s, 2 * s)
    c.globalAlpha = 1
  })
  gap(U * 3)

  for (const b of room.blocks ?? []) {
    switch (b.kind) {
      case 'text': {
        m.font = F.body
        for (const line of wrap(m, b.body, W)) {
          push(LH, (c, x, y) => {
            c.font = F.body
            c.fillStyle = INK
            c.fillText(line, x, y + LH * 0.74)
          })
        }
        gap(22)
        break
      }

      case 'list': {
        for (const it of b.items ?? []) {
          m.font = F.bullet
          const lines = wrap(m, it, W - 30 * s)
          push(lines.length * LH + 16 * s, (c, x, y) => {
            c.font = F.bullet
            c.fillStyle = room.accent
            c.fillText('▸', x, y + LH * 0.74)
            c.fillStyle = INK
            lines.forEach((l, i) => c.fillText(l, x + 30 * s, y + LH * 0.74 + i * LH))
          })
          push(1, (c, x, y) => {
            c.fillStyle = RULE
            c.fillRect(x, y, W, 1)
          })
          gap(10)
        }
        gap(14)
        break
      }

      case 'cards': {
        for (const card of b.items ?? []) {
          m.font = F.cardBody
          const padX = U * 3 * s
          const padY = U * 2.75 * s
          const bodyLines = card.body ? wrap(m, card.body, W - padX * 2) : []
          const h =
            padY * 2 +
            30 * s +
            bodyLines.length * (30 * s) +
            (card.tags?.length ? U * 5 * s : 0) +
            (card.href ? U * 4 * s : 0)
          push(h, (c, x, y) => {
            c.fillStyle = 'rgba(255,255,255,0.022)'
            c.strokeStyle = RULE
            c.lineWidth = 1
            c.beginPath()
            c.roundRect(x + 0.5, y + 0.5, W - 1, h - 1, 3 * s)
            c.fill()
            c.stroke()
            // accent spine down the left edge
            c.fillStyle = room.accent
            c.globalAlpha = 0.8
            c.fillRect(x, y + 2 * s, 3 * s, h - 4 * s)
            c.globalAlpha = 1

            let yy = y + padY + 22 * s
            c.font = F.cardTitle
            c.fillStyle = INK
            tracking(c, 1 * s)
            c.fillText(card.title ?? '', x + padX, yy)
            tracking(c, 0)
            if (card.meta) {
              c.font = F.cardMeta
              c.fillStyle = FAINT
              c.textAlign = 'right'
              c.fillText(card.meta, x + W - padX, yy)
              c.textAlign = 'left'
            }
            c.font = F.cardBody
            c.fillStyle = DIM
            bodyLines.forEach((l) => {
              yy += 30 * s
              c.fillText(l, x + padX, yy)
            })
            if (card.tags?.length) {
              yy += U * 4.5 * s
              c.font = F.tag
              let tx = x + padX
              for (const tag of card.tags) {
                const tw = c.measureText(tag).width + U * 2.5 * s
                c.fillStyle = room.accent
                c.globalAlpha = 0.13
                c.beginPath()
                c.roundRect(tx, yy - 15 * s, tw, 23 * s, 2.5 * s)
                c.fill()
                c.globalAlpha = 1
                c.fillStyle = room.accent
                c.fillText(tag, tx + U * 1.25 * s, yy)
                tx += tw + U * s
              }
            }
            if (card.href) {
              yy += U * 3.75 * s
              c.font = F.cardMeta
              c.fillStyle = FAINT
              tracking(c, 2 * s)
              c.fillText('OPEN', x + padX, yy)
              tracking(c, 0)
              c.fillText('→', x + padX + c.measureText('OPEN').width + U * 2 * s, yy)
            }
          })
          if (card.href) items[items.length - 1].href = card.href
          gap(U * 1.75)
        }
        gap(U)
        break
      }

      case 'bars': {
        for (const bar of b.items ?? []) {
          const v = Math.max(0, Math.min(100, bar.value ?? 0))
          push(U * 6.5 * s, (c, x, y) => {
            c.font = F.barLabel
            c.fillStyle = INK
            c.fillText(bar.label ?? '', x, y + 22 * s)
            c.font = F.when
            c.fillStyle = FAINT
            c.textAlign = 'right'
            c.fillText(String(v), x + W, y + 22 * s)
            c.textAlign = 'left'
            const trackY = y + U * 4.5 * s
            const th = 5 * s
            c.fillStyle = '#1b201d'
            c.beginPath()
            c.roundRect(x, trackY, W, th, th / 2)
            c.fill()
            c.fillStyle = room.accent
            c.globalAlpha = 0.92
            c.beginPath()
            c.roundRect(x, trackY, Math.max(th, W * (v / 100)), th, th / 2)
            c.fill()
            c.globalAlpha = 1
          })
          gap(U * 1.5)
        }
        gap(U * 2)
        break
      }

      case 'timeline': {
        for (const t of b.items ?? []) {
          m.font = F.small
          const bodyLines = t.body ? wrap(m, t.body, W - 34 * s) : []
          const h = 92 * s + bodyLines.length * 28 * s
          push(h, (c, x, y) => {
            c.fillStyle = RULE
            c.fillRect(x + 5 * s, y, 1, h)
            c.fillStyle = room.accent
            c.beginPath()
            c.arc(x + 5.5 * s, y + 16 * s, 5 * s, 0, Math.PI * 2)
            c.fill()
            const tx = x + 28 * s
            c.font = F.when
            c.fillStyle = FAINT
            c.fillText(t.when ?? '', tx, y + 20 * s)
            c.font = F.what
            c.fillStyle = INK
            c.fillText(t.what ?? '', tx, y + 52 * s)
            c.font = F.where
            c.fillStyle = DIM
            c.fillText(t.where ?? '', tx, y + 80 * s)
            c.font = F.small
            c.fillStyle = FAINT
            bodyLines.forEach((l, i) => c.fillText(l, tx, y + 106 * s + i * 28 * s))
          })
          gap(10)
        }
        gap(10)
        break
      }

      case 'links': {
        for (const l of b.items ?? []) {
          const h = U * 8 * s
          push(h, (c, x, y) => {
            c.font = F.linkLabel
            c.fillStyle = FAINT
            tracking(c, 2.5 * s)
            c.fillText(String(l.label ?? '').toUpperCase(), x, y + 19 * s)
            tracking(c, 0)
            c.font = F.linkValue
            c.fillStyle = room.accent
            c.fillText(l.value ?? '', x, y + U * 6.25 * s)
            // underline only under the value, so it reads as a link
            const vw = c.measureText(l.value ?? '').width
            c.globalAlpha = 0.3
            c.fillRect(x, y + U * 6.9 * s, vw, 1 * s)
            c.globalAlpha = 1
            c.fillStyle = RULE
            c.fillRect(x, y + h - 1, W, 1)
          })
          if (l.href) items[items.length - 1].href = l.href
          gap(U * 1.5)
        }
        gap(U * 1.5)
        break
      }

      default:
        break
    }
  }

  return items
}

/* Greedy pack into fixed-height columns. */
function pack(items, colH) {
  const cols = [[]]
  let y = 0
  for (const it of items) {
    if (y + it.h > colH && cols[cols.length - 1].length) {
      cols.push([])
      y = 0
    }
    cols[cols.length - 1].push({ ...it, y })
    y += it.h
  }
  return cols
}

/* ---- rendering ----------------------------------------------------------- */

function paint(col, { w, h, pad, accent, seed, page, pages }) {
  const c = document.createElement('canvas')
  c.width = Math.round(w * SS)
  c.height = Math.round(h * SS)
  const ctx = c.getContext('2d')
  // draw in layout units and let the extra pixels do their job unnoticed
  ctx.scale(SS, SS)

  ctx.fillStyle = BG
  ctx.fillRect(0, 0, w, h)

  // paper tooth, so a flat fill does not read as a flat fill
  const r = rng(seed)
  for (let i = 0; i < 5200; i++) {
    ctx.fillStyle = `rgba(255,255,255,${r() * 0.014})`
    ctx.fillRect(r() * w, r() * h, 1, 1)
  }
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(0,0,0,${r() * 0.05})`
    ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2)
  }

  ctx.fillStyle = accent
  ctx.fillRect(0, 0, w, 3)

  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  for (const it of col) it.draw(ctx, pad, pad + it.y)

  // footer rule and sheet number, so a multi-board wall reads as a set
  ctx.fillStyle = RULE
  ctx.fillRect(pad, h - pad + U * 1.5, w - pad * 2, 1)
  if (pages > 1) {
    ctx.font = `15px ${MONO}`
    ctx.fillStyle = FAINT
    tracking(ctx, 2)
    ctx.textAlign = 'right'
    ctx.fillText(`${page + 1} / ${pages}`, w - pad, h - pad + U * 4.5)
    ctx.textAlign = 'left'
    tracking(ctx, 0)
  }

  // grime creeping in from the edges
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.28, w / 2, h / 2, h * 0.78)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.5)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.needsUpdate = true
  return t
}

/* Wide-and-few before narrow-and-many. A three-line ABOUT gets one big board
 * with big type; a long PROJECTS list spreads across three. Picking the widest
 * layout the content still fits in is what keeps both looking deliberate. */
const LAYOUTS = [
  { cols: 1, w: 1000, h: 1080 },
  { cols: 2, w: 800, h: 1120 },
  { cols: 3, w: 700, h: 1150 },
]

const PAD = 54
const MAX_GROW = 2.3

function usedHeight(packed) {
  const last = packed[packed.length - 1]
  if (!last || !last.length) return 0
  const item = last[last.length - 1]
  return item.y + item.h
}

/* Returns one entry per board: its texture and pixel size, plus any clickable
 * regions expressed as fractions of the board, so the caller can place quads
 * without knowing anything about pixels. */
export function makeRoomBoards(room, index, total) {
  const meas = document.createElement('canvas').getContext('2d')
  const build = (L, s) => pack(buildItems(meas, room, index, total, L.w - PAD * 2, s), L.h - PAD * 2)

  let layout = null
  let packed = null
  let scale = 1

  for (const cand of LAYOUTS) {
    const p = build(cand, 1)
    if (p.length <= cand.cols) {
      layout = cand
      packed = p
      break
    }
  }

  if (!packed) {
    // longer than three full boards — shrink the type until it fits
    layout = LAYOUTS[LAYOUTS.length - 1]
    packed = build(layout, scale)
    for (let i = 0; i < 14 && packed.length > layout.cols; i++) {
      scale *= 0.92
      packed = build(layout, scale)
    }
  } else {
    // room to spare — grow the type so the board is not mostly empty
    const avail = layout.h - PAD * 2
    for (let i = 0; i < 20; i++) {
      if (scale >= MAX_GROW || usedHeight(packed) > avail * 0.88) break
      const next = scale * 1.05
      const p = build(layout, next)
      if (p.length > layout.cols) break
      scale = next
      packed = p
    }
  }

  /* A single board that is only half full looks like a mistake. Trim it down to
   * what the content actually needs and let it come out landscape, rather than
   * hanging a tall board with dead space under the last line. The aspect cap
   * stops three lines of text becoming a letterbox. */
  const { w } = layout
  let h = layout.h
  if (packed.length === 1) {
    const wanted = Math.round(PAD * 2 + usedHeight(packed) + 14)
    h = Math.max(Math.round(w / 1.62), Math.min(layout.h, wanted))
  }

  const sheets = packed.slice(0, layout.cols)
  return sheets.map((col, i) => ({
    texture: paint(col, {
      w,
      h,
      pad: PAD,
      accent: room.accent,
      seed: 900 + index * 31 + i,
      page: i,
      pages: sheets.length,
    }),
    w,
    h,
    hotspots: col
      .filter((it) => it.href)
      .map((it) => ({
        href: it.href,
        u: PAD / w,
        v: (PAD + it.y) / h,
        uw: (w - PAD * 2) / w,
        vh: it.h / h,
      })),
  }))
}

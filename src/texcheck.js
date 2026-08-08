/* Dev-only companion to texcheck.html. Bakes every material and blits each of
 * its maps onto a visible canvas so the recipes in textures.js can be judged
 * directly instead of by walking the corridor and squinting. */
import { buildTextures, MAT } from './textures'

const out = document.getElementById('out')

function show(title, set) {
  const h = document.createElement('h2')
  h.textContent = title
  out.appendChild(h)
  const row = document.createElement('div')
  row.className = 'row'
  out.appendChild(row)

  for (const key of ['map', 'normalMap', 'roughnessMap']) {
    const t = set[key]
    if (!t) continue
    const src = t.image
    const fig = document.createElement('figure')
    const c = document.createElement('canvas')
    c.width = src.width
    c.height = src.height
    c.getContext('2d').drawImage(src, 0, 0)
    const cap = document.createElement('figcaption')
    cap.textContent = `${key} — ${src.width}px`
    fig.append(c, cap)
    row.appendChild(fig)
  }

  // 2x2 tiled preview of the albedo, to check the seams actually line up
  const src = set.map.image
  const fig = document.createElement('figure')
  const c = document.createElement('canvas')
  c.width = c.height = src.width
  const ctx = c.getContext('2d')
  const h2 = src.width / 2
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) ctx.drawImage(src, x * h2, y * h2, h2, h2)
  const cap = document.createElement('figcaption')
  cap.textContent = 'tiled 2x2 — check for seams'
  fig.append(c, cap)
  row.appendChild(fig)
}

buildTextures(() => {}).then(() => {
  for (const key of Object.keys(MAT)) show(key, MAT[key])
})

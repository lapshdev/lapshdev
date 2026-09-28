import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import opentype from 'opentype.js'
import sharp from 'sharp'
import { siDiscord, siInstagram, siSteam, siYoutube } from 'simple-icons'

const OUT = new URL('../assets/', import.meta.url)
const CACHE = new URL('./.cache/', import.meta.url)
const FRIEREN = new URL('./art/frieren.png', import.meta.url)

const C = {
  light: '#f3efff',
  gold: '#e3cf9f',
  goldDeep: '#b8964f',
  lavender: '#b8b2dc',
  bloom: '#8fb2e6',
  rose: '#c7788a',
  parchment: '#fbf9f4',
  ink: '#252a44',
  inkSoft: '#4a4f6a',
  muted: '#7b7f96',
}

const n = (v) => Math.round(v * 10) / 10

function random(seed) {
  let s = seed
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function cached(name, load) {
  const file = new URL(name, CACHE)
  try {
    return await readFile(file)
  } catch {
    const buffer = await load()
    await mkdir(CACHE, { recursive: true })
    await writeFile(file, buffer)
    return buffer
  }
}

async function download(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${response.status} ${url}`)
  return Buffer.from(await response.arrayBuffer())
}

async function googleFont(spec, text = '') {
  const key = text ? `-${createHash('sha1').update(text).digest('hex').slice(0, 10)}` : ''
  return cached(`${spec.replace(/[^a-z0-9]+/gi, '-')}${key}.ttf`, async () => {
    const query = text ? `&text=${encodeURIComponent(text)}` : ''
    const css = (await download(`https://fonts.googleapis.com/css2?family=${spec}${query}`)).toString()
    const url = css.match(/src: url\((.+?)\)/)?.[1]
    if (!url) throw new Error(`Font not found: ${spec}`)
    return download(url)
  })
}

const usage = new Map()

async function loadFont(alias, spec, sample = '') {
  const buffer = await googleFont(spec, sample)
  const ot = opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength))
  return { alias: `lp-${alias}`, spec, ot }
}

async function fontFaces(snapshot) {
  const faces = await Promise.all(
    [...snapshot].map(async ([font, chars]) => {
      const subset = await googleFont(font.spec, [...chars].sort().join(''))
      return `@font-face{font-family:${font.alias};src:url(data:font/ttf;base64,${subset.toString('base64')}) format('truetype')}`
    }),
  )
  return faces.join('')
}

function takeUsage() {
  const snapshot = new Map(usage)
  usage.clear()
  return snapshot
}

async function devicon(name, variant = 'original') {
  const svg = await cached(`devicon-${name}-${variant}.svg`, () =>
    download(`https://cdn.jsdelivr.net/gh/devicons/devicon/icons/${name}/${name}-${variant}.svg`),
  )
  return `data:image/svg+xml;base64,${svg.toString('base64')}`
}

function inlineIcon(body) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

const ABLETON =
  'M1 6h1.7v12H1zM4.3 6H6v12H4.3zM7.6 6h1.7v12H7.6zM10.9 6h1.7v12h-1.7zM14 6h9v1.7h-9zM14 9.4h9v1.7h-9zM14 12.9h9v1.7h-9zM14 16.3h9V18h-9z'
const CRESCENT = 'M14.5 2.5a9.5 9.5 0 1 0 7 16A8 8 0 0 1 14.5 2.5zM19 3l.9 2.1L22 6l-2.1.9L19 9l-.9-2.1L16 6l2.1-.9z'

function attrs(values) {
  return Object.entries(values)
    .filter(([, v]) => v != null)
    .map(([k, v]) => ` ${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}="${v}"`)
    .join('')
}

function measure({ ot }, str, size, tracking = 0) {
  const scale = size / ot.unitsPerEm
  const glyphs = ot.stringToGlyphs(str)
  let x = 0
  glyphs.forEach((glyph, i) => {
    x += glyph.advanceWidth * scale + tracking
    if (glyphs[i + 1] && !tracking) x += ot.getKerningValue(glyph, glyphs[i + 1]) * scale
  })
  return glyphs.length ? x - tracking : 0
}

const escape = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function text(font, str, { x = 0, y = 0, size, anchor = 'start', tracking = 0, ...rest }) {
  if (!usage.has(font)) usage.set(font, new Set())
  for (const ch of str) usage.get(font).add(ch)
  const width = measure(font, str, size, tracking)
  const start = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x
  const spacing = tracking ? ` letter-spacing="${tracking}"` : ''
  return `<text x="${n(start)}" y="${n(y)}" font-family="${font.alias}" font-size="${size}"${spacing}${attrs(rest)}>${escape(str)}</text>`
}

function wrap(font, str, size, max) {
  const lines = []
  let line = ''
  for (const word of str.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (line && measure(font, next, size) > max) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

function sparkle(x, y, size, rest = {}) {
  const r = size / 2
  const d = `M${n(x)} ${n(y - r)}Q${n(x)} ${n(y)} ${n(x + r)} ${n(y)}Q${n(x)} ${n(y)} ${n(x)} ${n(y + r)}Q${n(x)} ${n(y)} ${n(x - r)} ${n(y)}Q${n(x)} ${n(y)} ${n(x)} ${n(y - r)}Z`
  return `<path d="${d}"${attrs(rest)}/>`
}

function diamond(x, y, size, fill) {
  return `<rect x="${n(x - size / 2)}" y="${n(y - size / 2)}" width="${size}" height="${size}" transform="rotate(45 ${n(x)} ${n(y)})" fill="${fill}"/>`
}

const METEOR_ANGLE = Math.PI * 0.22
const METEOR_DX = Math.cos(METEOR_ANGLE)
const METEOR_DY = Math.sin(METEOR_ANGLE)
const METEOR_TRAVEL = 380

const BASE_STYLE = `
.tw{animation:tw 4s ease-in-out infinite}
@keyframes tw{0%,100%{opacity:.25}50%{opacity:1}}
.gl{animation:gl 3.6s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
@keyframes gl{0%,100%{opacity:.15;transform:scale(.5) rotate(0)}50%{opacity:1;transform:scale(1) rotate(45deg)}}
.mt{opacity:0;animation:mt 11s linear infinite}
@keyframes mt{0%{opacity:0;transform:translate(0,0)}1.5%{opacity:1}9%{opacity:0;transform:translate(${n(-METEOR_DX * METEOR_TRAVEL)}px,${n(METEOR_DY * METEOR_TRAVEL)}px)}100%{opacity:0;transform:translate(${n(-METEOR_DX * METEOR_TRAVEL)}px,${n(METEOR_DY * METEOR_TRAVEL)}px)}}
.halo{animation:halo 7s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
@keyframes halo{0%,100%{opacity:.75;transform:scale(.96)}50%{opacity:1;transform:scale(1.05)}}
.spin{animation:spin 200s linear infinite}
.spin-rev{animation:spin 140s linear infinite reverse}
@keyframes spin{to{transform:rotate(360deg)}}
.pt{animation:pt 14s linear infinite;transform-box:fill-box;transform-origin:center}
.bob{animation:bob 6s ease-in-out infinite}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
.blink{animation:blink 1s steps(1) infinite}
@keyframes blink{50%{opacity:0}}
.flick{animation:flick 1.3s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 100%}
@keyframes flick{0%,100%{transform:scale(1,1) skewX(0)}30%{transform:scale(.92,1.08) skewX(2deg)}60%{transform:scale(1.05,.94) skewX(-2deg)}}
.spark{opacity:0;animation:spark 2.6s ease-out infinite}
@keyframes spark{0%{opacity:0;transform:translate(0,0)}15%{opacity:1}100%{opacity:0;transform:translate(6px,-70px)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.mt,.spark{opacity:0}}
`

function petalStyle(height) {
  return `@keyframes pt{0%{transform:translate(0,0) rotate(0)}100%{transform:translate(-220px,${height + 60}px) rotate(720deg)}}`
}

const COMMON_DEFS = `
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4b5388"/><stop offset=".38" stop-color="#1b2246"/><stop offset=".72" stop-color="#10152e"/><stop offset="1" stop-color="#0a0e22"/></linearGradient>
<linearGradient id="deep" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#252c5c"/><stop offset=".45" stop-color="#161c3c"/><stop offset="1" stop-color="#0b0f25"/></linearGradient>
<radialGradient id="dusk" cx=".5" cy="0" r=".75"><stop offset="0" stop-color="#e8b4c4" stop-opacity=".3"/><stop offset="1" stop-color="#e8b4c4" stop-opacity="0"/></radialGradient>
<linearGradient id="meteor" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#fffaeb"/><stop offset=".2" stop-color="#e3cf9f" stop-opacity=".6"/><stop offset="1" stop-color="#b8b2dc" stop-opacity="0"/></linearGradient>
<radialGradient id="halo"><stop offset="0" stop-color="#fff6dc" stop-opacity=".3"/><stop offset=".4" stop-color="#b8b2dc" stop-opacity=".1"/><stop offset=".7" stop-color="#b8b2dc" stop-opacity="0"/></radialGradient>
<radialGradient id="moonFill" cx=".38" cy=".38" r=".7"><stop offset="0" stop-color="#fffdf3"/><stop offset=".55" stop-color="#efe6cf"/><stop offset="1" stop-color="#d9cfb4"/></radialGradient>
<radialGradient id="warm"><stop offset="0" stop-color="#e3cf9f" stop-opacity=".35"/><stop offset="1" stop-color="#e3cf9f" stop-opacity="0"/></radialGradient>
<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="glow" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur in="SourceGraphic" stdDeviation="9" result="b"/><feColorMatrix in="b" values="0 0 0 0 .89 0 0 0 0 .81 0 0 0 0 .62 0 0 0 .6 0"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="bloomGlow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<g id="fl"><circle cx="0" cy="-2.6" r="2.1"/><circle cx="2.5" cy="-.8" r="2.1"/><circle cx="1.5" cy="2.1" r="2.1"/><circle cx="-1.5" cy="2.1" r="2.1"/><circle cx="-2.5" cy="-.8" r="2.1"/><circle r="1.2" fill="#f6e7b8"/></g>
`

function svg({ width, height, title, defs = '', style = '', body, card = true }) {
  const content = card
    ? `<g clip-path="url(#card)">${body}</g><rect x="10.5" y="10.5" width="${width - 21}" height="${height - 21}" rx="16" fill="none" stroke="${C.gold}" stroke-opacity=".22"/><rect x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="24" fill="none" stroke="${C.gold}" stroke-opacity=".3"/>`
    : body
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><title>${title}</title><defs>${COMMON_DEFS}<clipPath id="card"><rect width="${width}" height="${height}" rx="24"/></clipPath>${defs}</defs><style>/*FONTS*/${BASE_STYLE}${style}</style>${content}</svg>`
}

function stars({ seed, count, width, height, twinkle = 0.14 }) {
  const rand = random(seed)
  return Array.from({ length: count }, () => {
    const x = rand() * width
    const y = Math.pow(rand(), 1.4) * height
    const r = rand() * 1.2 + 0.3
    const o = (rand() * 0.6 + 0.3) * (1 - (y / height) * 0.55)
    const tw = rand() < twinkle
    const motion = tw ? ` class="tw" style="animation-duration:${n(3 + rand() * 4)}s;animation-delay:-${n(rand() * 6)}s"` : ''
    return `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="#f3efff" fill-opacity="${n(o * 100) / 100}"${motion}/>`
  }).join('')
}

function glints(list) {
  return list
    .map(
      ([x, y, s, delay]) =>
        sparkle(x, y, s, { fill: '#fffaf0', class: 'gl', style: `animation-delay:-${delay}s` }),
    )
    .join('')
}

function meteors(list) {
  return list
    .map(({ x, y, len, w = 1.6, delay = 0, dur = 11 }) => {
      const x2 = x + METEOR_DX * len
      const y2 = y - METEOR_DY * len
      return `<g class="mt" style="animation-delay:${delay}s;animation-duration:${dur}s"><line x1="${n(x)}" y1="${n(y)}" x2="${n(x2)}" y2="${n(y2)}" stroke="url(#meteor)" stroke-width="${w}" stroke-linecap="round"/><circle cx="${n(x)}" cy="${n(y)}" r="${n(w + 0.5)}" fill="#fffcf0"/></g>`
    })
    .join('')
}

function moon(cx, cy, r) {
  return `<circle class="halo" cx="${cx}" cy="${cy}" r="${n(r * 3.4)}" fill="url(#halo)"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#moonFill)" filter="url(#soft)"/><circle cx="${n(cx - r * 0.3)}" cy="${n(cy + r * 0.2)}" r="${n(r * 0.16)}" fill="#d9cfb4" fill-opacity=".35"/><circle cx="${n(cx + r * 0.25)}" cy="${n(cy - r * 0.3)}" r="${n(r * 0.1)}" fill="#d9cfb4" fill-opacity=".3"/>`
}

function petals({ seed, count, width, height }) {
  const rand = random(seed)
  return Array.from({ length: count }, () => {
    const x = rand() * (width + 220)
    const dur = 10 + rand() * 9
    return `<ellipse class="pt" cx="${n(x)}" cy="-20" rx="${n(3 + rand() * 2)}" ry="${n(1.4 + rand())}" fill="#fdfbff" fill-opacity="${n(0.55 + rand() * 0.35)}" style="animation-duration:${n(dur)}s;animation-delay:-${n(rand() * dur)}s"/>`
  }).join('')
}

function hill({ width, height, base, amp, seed, points = 6, fill, opacity = 1 }) {
  const rand = random(seed)
  const pts = Array.from({ length: points + 1 }, (_, i) => [(width / points) * i, base - rand() * amp])
  let d = `M0 ${height}L${n(pts[0][0])} ${n(pts[0][1])}`
  for (let i = 0; i < points; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += `C${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(p2[0])} ${n(p2[1])}`
  }
  d += `L${width} ${height}Z`
  const at = (x) => {
    const i = Math.min(points - 1, Math.floor(x / (width / points)))
    const t = (x - pts[i][0]) / (width / points)
    return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t
  }
  return { path: `<path d="${d}" fill="${fill}" fill-opacity="${opacity}"/>`, at }
}

function flowers({ seed, count, width, at, depth = 30, scale = [0.7, 1.4], glow = 0.18, avoid }) {
  const rand = random(seed)
  const plain = []
  const glowing = []
  for (let i = 0; i < count; i++) {
    const x = rand() * width
    const y = at(x) + 5 + rand() * depth
    const s = scale[0] + rand() * (scale[1] - scale[0])
    const lit = rand() < glow
    const delay = n(rand() * 6)
    if (avoid && avoid(x, y)) continue
    const tone = rand() < 0.2 ? '#b9cff3' : C.bloom
    const use = `<use href="#fl" transform="translate(${n(x)} ${n(y)}) scale(${n(s)})" fill="${tone}"${lit ? ` class="tw" style="animation-delay:-${delay}s"` : ''}/>`
    ;(lit ? glowing : plain).push(use)
  }
  return `<g fill-opacity=".85">${plain.join('')}</g><g filter="url(#bloomGlow)">${glowing.join('')}</g>`
}

function polygon(points, radius, rotation = 0) {
  return Array.from({ length: points }, (_, i) => {
    const a = ((Math.PI * 2) / points) * i + rotation
    return `${n(200 + Math.cos(a) * radius)},${n(200 + Math.sin(a) * radius)}`
  }).join(' ')
}

function magicCircle({ cx, cy, size, color = C.gold, opacity = 0.2, strokeWidth = 1.2, spin = 'spin' }) {
  const k = size / 400
  const ticks = Array.from({ length: 24 }, (_, i) => {
    const a = ((Math.PI * 2) / 24) * i
    const r2 = i % 2 === 0 ? 184 : 177
    return `<line x1="${n(200 + Math.cos(a) * 170)}" y1="${n(200 + Math.sin(a) * 170)}" x2="${n(200 + Math.cos(a) * r2)}" y2="${n(200 + Math.sin(a) * r2)}"/>`
  }).join('')
  const nodes = Array.from({ length: 6 }, (_, i) => {
    const a = ((Math.PI * 2) / 6) * i - Math.PI / 2
    return `<circle cx="${n(200 + Math.cos(a) * 120)}" cy="${n(200 + Math.sin(a) * 120)}" r="6"/>`
  }).join('')
  const petalsRing = Array.from(
    { length: 6 },
    (_, i) => `<ellipse cx="200" cy="172" rx="10" ry="26" transform="rotate(${i * 60} 200 200)"/>`,
  ).join('')
  return `<g class="${spin}" style="transform-origin:${cx}px ${cy}px" opacity="${opacity}"><g transform="translate(${n(cx - size / 2)} ${n(cy - size / 2)}) scale(${n(k * 1000) / 1000})" fill="none" stroke="${color}" stroke-width="${n(strokeWidth / k)}"><circle cx="200" cy="200" r="198"/><circle cx="200" cy="200" r="184"/><circle cx="200" cy="200" r="166" stroke-dasharray="2 7"/>${ticks}<polygon points="${polygon(4, 156)}"/><polygon points="${polygon(4, 156, Math.PI / 4)}"/><circle cx="200" cy="200" r="106"/><polygon points="${polygon(3, 120, -Math.PI / 2)}" opacity=".7"/><polygon points="${polygon(3, 120, Math.PI / 2)}" opacity=".7"/>${nodes}<circle cx="200" cy="200" r="62"/><circle cx="200" cy="200" r="56" stroke-dasharray="1 4"/>${petalsRing}</g></g>`
}

function kicker(font, label, { x, y, anchor = 'middle', color = C.gold, size = 13, tracking = 5, lines = true }) {
  const width = measure(font, label, size, tracking)
  const start = anchor === 'middle' ? x - width / 2 : x
  const mid = y - size * 0.36
  const out = [text(font, label, { x: start, y, size, tracking, fill: color })]
  if (lines && anchor === 'middle') {
    out.push(
      `<line x1="${n(start - 70)}" y1="${n(mid)}" x2="${n(start - 22)}" y2="${n(mid)}" stroke="${color}" stroke-opacity=".5"/>`,
      `<line x1="${n(start + width + 22)}" y1="${n(mid)}" x2="${n(start + width + 70)}" y2="${n(mid)}" stroke="${color}" stroke-opacity=".5"/>`,
      sparkle(start - 12, mid, 10, { fill: color }),
      sparkle(start + width + 12, mid, 10, { fill: color }),
    )
  }
  return out.join('')
}

function typing(lines, { font, size, y, cx, fill, cycle = 5.5 }) {
  const total = cycle * lines.length
  const k = (s) => n((s / total) * 10000) / 10000
  const keyTimes = `0;${k(1.9)};${k(cycle - 0.9)};${k(cycle - 0.35)};1`
  return lines
    .map((line, i) => {
      const w = measure(font, line, size)
      const x0 = cx - w / 2
      const timing = `dur="${total}s" begin="${n(i * cycle)}s" repeatCount="indefinite"`
      return `<clipPath id="type${i}"><rect x="${n(x0 - 4)}" y="${n(y - size * 1.1)}" width="0" height="${n(size * 1.6)}"><animate attributeName="width" values="0;${n(w + 8)};${n(w + 8)};0;0" keyTimes="${keyTimes}" ${timing}/></rect></clipPath><g clip-path="url(#type${i})">${text(font, line, { x: cx, y, size, anchor: 'middle', fill })}</g><g class="blink"><rect x="${n(x0)}" y="${n(y - size * 0.82)}" width="1.8" height="${n(size * 1.02)}" fill="${C.gold}" opacity="0"><animate attributeName="x" values="${n(x0)};${n(x0 + w + 4)};${n(x0 + w + 4)};${n(x0)};${n(x0)}" keyTimes="${keyTimes}" ${timing}/><animate attributeName="opacity" values="1;0" keyTimes="0;${k(cycle - 0.3)}" calcMode="discrete" ${timing}/></rect></g>`
    })
    .join('')
}

const RUNES = {
  isa: 'M5 0V16',
  kenaz: 'M8 2L3 8L8 14',
  laguz: 'M3 0V16M3 0L8 5',
  ansuz: 'M3 0V16M3 0L8 4M3 5L8 9',
  sowilo: 'M7 0L3 6L7 10L3 16',
  fehu: 'M3 0V16M3 3L8 0M3 7L8 4',
}

function header(f) {
  const W = 1200
  const H = 460
  const back = hill({ width: W, height: H, base: 392, amp: 34, seed: 3, points: 5, fill: '#1e2550', opacity: 0.95 })
  const mid = hill({ width: W, height: H, base: 418, amp: 26, seed: 9, points: 6, fill: '#141a3a' })
  const front = hill({ width: W, height: H, base: 446, amp: 18, seed: 21, points: 7, fill: '#0c1028' })
  const roles = ['MULTIMEDIA ENGINEER', 'MUSICIAN', 'WEB MAGE']
  const roleSize = 15
  const roleTracking = 5
  const gap = 34
  const roleWidths = roles.map((r) => measure(f.labelLight, r, roleSize, roleTracking))
  const total = roleWidths.reduce((a, b) => a + b, 0) + gap * (roles.length - 1)
  let rx = W / 2 - total / 2
  const roleMarks = roles
    .map((role, i) => {
      const out = text(f.labelLight, role, { x: rx, y: 272, size: roleSize, tracking: roleTracking, fill: C.lavender })
      rx += roleWidths[i]
      const sep = i < roles.length - 1 ? diamond(rx + gap / 2, 266.5, 5, C.gold) : ''
      rx += gap
      return out + sep
    })
    .join('')

  const body = `
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<rect width="${W}" height="${H}" fill="url(#dusk)"/>
${stars({ seed: 7, count: 300, width: W, height: 400 })}
${meteors([
  { x: 760, y: 70, len: 170, delay: 1 },
  { x: 380, y: 40, len: 130, w: 1.2, delay: 4.5 },
  { x: 1120, y: 150, len: 150, delay: 8 },
  { x: 560, y: 120, len: 110, w: 1.1, delay: 6.2, dur: 13 },
])}
${moon(1040, 104, 42)}
<ellipse cx="600" cy="205" rx="330" ry="150" fill="url(#warm)" opacity=".5"/>
${magicCircle({ cx: 600, cy: 205, size: 400, opacity: 0.16 })}
${magicCircle({ cx: 600, cy: 205, size: 250, opacity: 0.1, spin: 'spin-rev' })}
${glints([
  [180, 90, 16, 0],
  [300, 210, 10, 1.2],
  [930, 250, 12, 2.1],
  [860, 70, 9, 0.6],
  [120, 280, 11, 2.8],
  [1110, 300, 10, 1.7],
])}
${kicker(f.label, 'BEYOND JOURNEY’S END', { x: 600, y: 116, size: 13, tracking: 6 })}
<g filter="url(#glow)">${text(f.display, 'Lapushel', { x: 600, y: 226, size: 128, anchor: 'middle', fill: 'url(#title)' })}</g>
${roleMarks}
${typing(
  [
    'A travelling mage who weaves interfaces, games and music.',
    'Multimedia Computer Engineering · Santiago, Chile',
    'Probably brewing a V60 right now…',
  ],
  { font: f.body, size: 23, y: 322, cx: 600, fill: C.light },
)}
${back.path}
${flowers({ seed: 5, count: 50, width: W, at: back.at, depth: 18, scale: [0.5, 0.9], glow: 0.1 })}
${mid.path}
${flowers({ seed: 8, count: 70, width: W, at: mid.at, depth: 22, scale: [0.7, 1.2] })}
${front.path}
${flowers({ seed: 13, count: 60, width: W, at: front.at, depth: 16, scale: [1, 1.6], glow: 0.25 })}
${petals({ seed: 4, count: 16, width: W, height: H })}
`
  return svg({
    width: W,
    height: H,
    title: 'Lapushel, multimedia engineer, musician and web mage',
    defs: `<linearGradient id="title" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset=".6" stop-color="#f3efff"/><stop offset="1" stop-color="#e3cf9f"/></linearGradient>`,
    style: petalStyle(H),
    body,
  })
}

function prologue(f) {
  const W = 1200
  const H = 470
  const statement =
    'Long before I wrote code, harmony cast its spell on me in a youth orchestra. Today I am a multimedia engineer who weaves interfaces, games and music together, one small spell at a time.'
  const lines = wrap(f.displayUpright, statement, 27, 640)
  const statementSvg = lines
    .map((line, i) => text(f.displayUpright, line, { x: 72, y: 196 + i * 38, size: 27, fill: C.light, fillOpacity: 0.88 }))
    .join('')

  const traits = [
    ['ISTP', 'isa'],
    ['Santiago, CL', 'kenaz'],
    ['Musician', 'laguz'],
    ['Self-taught', 'ansuz'],
    ['Coffee addict', 'sowilo'],
  ]
  let px = 72
  const pills = traits
    .map(([label, rune]) => {
      const tw = measure(f.label, label.toUpperCase(), 11, 2.5)
      const w = tw + 48
      const out = `<g><rect x="${n(px)}" y="382" width="${n(w)}" height="36" rx="18" fill="#f3efff" fill-opacity=".04" stroke="${C.gold}" stroke-opacity=".35"/><path d="${RUNES[rune]}" transform="translate(${n(px + 16)} 392)" fill="none" stroke="${C.gold}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>${text(f.label, label.toUpperCase(), { x: px + 36, y: 404, size: 11, tracking: 2.5, fill: C.light, fillOpacity: 0.85 })}</g>`
      px += w + 8
      return out
    })
    .join('')

  const stats = [
    ['7', 'PROGRAMMING TONGUES'],
    ['9+', 'CREATIVE TOOLS'],
    ['∞', 'CUPS OF COFFEE'],
  ]
  const statsSvg = stats
    .map(([value, label], i) => {
      const y = 150 + i * 112
      const font = f.displayUpright.ot.charToGlyphIndex(value[0]) ? f.displayUpright : f.bodyUpright
      return `${text(font, value, { x: 994, y, size: 66, anchor: 'middle', fill: C.gold })}${text(f.label, label, { x: 994, y: y + 34, size: 11, anchor: 'middle', tracking: 4, fill: C.lavender })}`
    })
    .join('')

  const body = `
<rect width="${W}" height="${H}" fill="url(#deep)"/>
<rect width="${W}" height="${H}" fill="url(#dusk)" opacity=".6"/>
${stars({ seed: 17, count: 110, width: W, height: H, twinkle: 0.2 })}
${magicCircle({ cx: 994, cy: 235, size: 400, opacity: 0.08 })}
${glints([
  [760, 60, 12, 0.4],
  [1130, 420, 10, 1.9],
  [640, 440, 9, 2.6],
])}
${kicker(f.label, 'CHAPTER I · PROLOGUE', { x: 72, y: 82, anchor: 'start', size: 12, tracking: 5 })}
${text(f.display, 'About the traveller', { x: 70, y: 140, size: 50, fill: C.light })}
${statementSvg}
${pills}
<line x1="846" y1="70" x2="846" y2="400" stroke="${C.gold}" stroke-opacity=".25"/>
${sparkle(846, 235, 14, { fill: C.gold })}
${statsSvg}
`
  return svg({ width: W, height: H, title: 'Chapter I, Prologue: about the traveller', body })
}

async function grimoire(f) {
  const W = 1200
  const H = 700
  const left = {
    school: 'TRANSLATION MAGIC',
    title: 'Tongues I speak',
    numeral: 'i',
    items: [
      ['C', await devicon('c')],
      ['C++', await devicon('cplusplus')],
      ['C#', await devicon('csharp')],
      ['Java', await devicon('java')],
      ['JavaScript', await devicon('javascript')],
      ['Python', await devicon('python')],
      ['HTML', await devicon('html5')],
      ['CSS', await devicon('css3')],
    ],
  }
  const right = {
    school: 'SUMMONING MAGIC',
    title: 'Arcane tools',
    numeral: 'ii',
    items: [
      ['React', await devicon('react')],
      ['Next.js', await devicon('nextjs')],
      ['Node.js', await devicon('nodejs')],
      ['Git', await devicon('git')],
      ['Docker', await devicon('docker')],
      ['AWS', await devicon('amazonwebservices', 'original-wordmark')],
      ['Unity', await devicon('unity')],
      ['Ableton', inlineIcon(`<path fill="${C.ink}" d="${ABLETON}"/>`)],
    ],
  }
  const top = 196
  const bottom = 616
  const page = (data, x0, w, seedDelay) => {
    const cx = x0 + w / 2
    const cols = 4
    const cell = (w - 80) / cols
    const tiles = data.items
      .map(([label, href], i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        const x = x0 + 40 + cell * col + cell / 2
        const y = 380 + row * 118
        return `<g class="bob" style="animation-delay:-${n(seedDelay + i * 0.7)}s"><circle cx="${n(x)}" cy="${y}" r="32" fill="#fffdf8" stroke="${C.goldDeep}" stroke-opacity=".4"/><circle cx="${n(x)}" cy="${y}" r="37" fill="none" stroke="${C.goldDeep}" stroke-opacity=".18" stroke-dasharray="2 4"/><image href="${href}" x="${n(x - 18)}" y="${y - 18}" width="36" height="36"/></g>${text(f.labelLight, label.toUpperCase(), { x, y: y + 60, size: 10.5, anchor: 'middle', tracking: 2, fill: C.inkSoft })}`
      })
      .join('')
    return `
<rect x="${n(x0 + 18)}" y="${top + 18}" width="${n(w - 36)}" height="${bottom - top - 36}" fill="none" stroke="${C.goldDeep}" stroke-opacity=".45"/>
<rect x="${n(x0 + 24)}" y="${top + 24}" width="${n(w - 48)}" height="${bottom - top - 48}" fill="none" stroke="${C.goldDeep}" stroke-opacity=".2"/>
${[
  [x0 + 18, top + 18],
  [x0 + w - 18, top + 18],
  [x0 + 18, bottom - 18],
  [x0 + w - 18, bottom - 18],
]
  .map(([x, y]) => sparkle(x, y, 12, { fill: C.goldDeep }))
  .join('')}
${text(f.label, data.school, { x: cx, y: 250, size: 11, anchor: 'middle', tracking: 4, fill: C.goldDeep })}
${text(f.display, data.title, { x: cx, y: 290, size: 34, anchor: 'middle', fill: C.ink })}
<line x1="${n(cx - 60)}" y1="308" x2="${n(cx - 12)}" y2="308" stroke="${C.goldDeep}" stroke-opacity=".5"/>
<line x1="${n(cx + 12)}" y1="308" x2="${n(cx + 60)}" y2="308" stroke="${C.goldDeep}" stroke-opacity=".5"/>
${sparkle(cx, 308, 10, { fill: C.goldDeep })}
${tiles}
${text(f.display, `— ${data.numeral} —`, { x: cx, y: 588, size: 16, anchor: 'middle', fill: C.muted })}`
  }

  const body = `
<rect width="${W}" height="${H}" fill="url(#deep)"/>
<rect width="${W}" height="${H}" fill="url(#dusk)" opacity=".5"/>
${stars({ seed: 29, count: 120, width: W, height: H, twinkle: 0.2 })}
${glints([
  [90, 120, 14, 0.2],
  [1110, 90, 12, 1.4],
  [70, 560, 10, 2.2],
  [1140, 600, 11, 0.9],
])}
${kicker(f.label, 'CHAPTER II · GRIMOIRE', { x: 600, y: 76, size: 12, tracking: 5 })}
${text(f.display, 'Spells I have learned', { x: 600, y: 134, size: 48, anchor: 'middle', fill: C.light })}
<ellipse cx="600" cy="630" rx="470" ry="26" fill="#000" fill-opacity=".35" filter="url(#soft)"/>
<rect x="114" y="${top - 16}" width="972" height="${bottom - top + 34}" rx="16" fill="url(#leather)" stroke="${C.gold}" stroke-opacity=".55"/>
<rect x="122" y="${top - 8}" width="956" height="${bottom - top + 18}" rx="11" fill="none" stroke="${C.gold}" stroke-opacity=".3"/>
<path d="M136 ${top + 6}H598V${bottom + 6}H140Z" fill="#d9ceb4"/>
<path d="M602 ${top + 6}H1064L1060 ${bottom + 6}H602Z" fill="#d9ceb4"/>
<path d="M132 ${top + 3}H598V${bottom + 3}H134Z" fill="#e6dcc4"/>
<path d="M602 ${top + 3}H1068L1066 ${bottom + 3}H602Z" fill="#e6dcc4"/>
<rect x="130" y="${top}" width="470" height="${bottom - top}" fill="url(#pageL)"/>
<rect x="600" y="${top}" width="470" height="${bottom - top}" fill="url(#pageR)"/>
<rect x="560" y="${top}" width="80" height="${bottom - top}" fill="url(#spine)"/>
${page(left, 130, 470, 0)}
${page(right, 600, 470, 3)}
<path d="M622 ${top - 18}H646V${bottom + 44}L634 ${bottom + 32}L622 ${bottom + 44}Z" fill="${C.rose}"/>
<path d="M622 ${top - 18}H628V${bottom + 38}L622 ${bottom + 44}Z" fill="#000" fill-opacity=".15"/>
${glints([
  [180, 230, 10, 0.5],
  [1020, 560, 12, 1.8],
  [600, 180, 12, 2.9],
])}
`
  return svg({
    width: W,
    height: H,
    title: 'Chapter II, Grimoire: C, C++, C#, Java, JavaScript, Python, HTML, CSS, React, Next.js, Node.js, Git, Docker, AWS, Unity and Ableton',
    defs: `
<linearGradient id="leather" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#352d66"/><stop offset=".5" stop-color="#241e4a"/><stop offset="1" stop-color="#1a1638"/></linearGradient>
<linearGradient id="pageL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f4eee0"/><stop offset=".15" stop-color="#fbf9f4"/><stop offset=".85" stop-color="#f6f1e6"/><stop offset="1" stop-color="#e2d8c2"/></linearGradient>
<linearGradient id="pageR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#f4eee0"/><stop offset=".15" stop-color="#fbf9f4"/><stop offset=".85" stop-color="#f6f1e6"/><stop offset="1" stop-color="#e2d8c2"/></linearGradient>
<linearGradient id="spine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6b5a3a" stop-opacity="0"/><stop offset=".5" stop-color="#6b5a3a" stop-opacity=".35"/><stop offset="1" stop-color="#6b5a3a" stop-opacity="0"/></linearGradient>`,
    body,
  })
}

function banner(f, { chapter, title, subtitle, seed, extra = '', aria }) {
  const W = 1200
  const H = 200
  const body = `
<rect width="${W}" height="${H}" fill="url(#deep)"/>
<rect width="${W}" height="${H}" fill="url(#dusk)" opacity=".7"/>
${stars({ seed, count: 90, width: W, height: H, twinkle: 0.2 })}
${magicCircle({ cx: 600, cy: 100, size: 330, opacity: 0.08 })}
${kicker(f.label, chapter, { x: 600, y: 66, size: 12, tracking: 5 })}
${text(f.display, title, { x: 600, y: 122, size: 46, anchor: 'middle', fill: C.light })}
${text(f.body, subtitle, { x: 600, y: 158, size: 19, anchor: 'middle', fill: C.lavender })}
${extra}
`
  return svg({ width: W, height: H, title: aria, body })
}

function campfire(cx, base) {
  const flame = (w, h, fill, delay, dx = 0) =>
    `<path class="flick" style="animation-delay:-${delay}s" d="M${n(cx + dx)} ${n(base - h)}C${n(cx + dx + w * 0.2)} ${n(base - h * 0.62)} ${n(cx + dx + w * 0.55)} ${n(base - h * 0.5)} ${n(cx + dx + w * 0.5)} ${n(base - h * 0.2)}C${n(cx + dx + w * 0.48)} ${n(base)} ${n(cx + dx - w * 0.48)} ${n(base)} ${n(cx + dx - w * 0.5)} ${n(base - h * 0.2)}C${n(cx + dx - w * 0.52)} ${n(base - h * 0.5)} ${n(cx + dx - w * 0.15)} ${n(base - h * 0.55)} ${n(cx + dx)} ${n(base - h)}Z" fill="${fill}"/>`
  const sparks = [
    [-6, 0],
    [4, 0.9],
    [-2, 1.7],
    [8, 0.4],
    [-9, 2.1],
  ]
    .map(
      ([dx, delay]) =>
        `<circle class="spark" style="animation-delay:-${delay}s" cx="${cx + dx}" cy="${base - 40}" r="1.4" fill="#ffd89a"/>`,
    )
    .join('')
  return `<circle cx="${cx}" cy="${base - 18}" r="70" fill="url(#warm)"/>
<rect x="${cx - 34}" y="${base - 6}" width="68" height="9" rx="4.5" fill="#5a3d2b" transform="rotate(-12 ${cx} ${base})"/>
<rect x="${cx - 34}" y="${base - 6}" width="68" height="9" rx="4.5" fill="#6b4a33" transform="rotate(12 ${cx} ${base})"/>
${flame(34, 58, '#c7788a', 0)}
${flame(26, 46, '#e8a86a', 0.4, 3)}
${flame(16, 30, '#ffe3a3', 0.8, 1)}
${sparks}`
}

function notice(f, data, index, icons) {
  const W = 260
  const H = 350
  const numerals = ['I', 'II', 'III', 'IV', 'V']
  const tilt = [-2.4, 1.8, -1.3, 2.2, -1.8][index]
  const rand = random(40 + index)
  const pts = []
  const x0 = 22
  const y0 = 34
  const w = 216
  const h = 290
  for (let i = 0; i <= w; i += 12) pts.push([x0 + i, y0 + rand() * 4])
  for (let j = 12; j <= h; j += 16) pts.push([x0 + w - rand() * 2, y0 + j])
  for (let i = w - 12; i >= 0; i -= 12) pts.push([x0 + i, y0 + h - rand() * 4])
  for (let j = h - 16; j > 0; j -= 16) pts.push([x0 + rand() * 2, y0 + j])
  const poly = pts.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')
  const cx = x0 + w / 2
  const rewardLines = wrap(f.body, data.reward, 16, 136)
  const body = `
<g transform="rotate(${tilt} ${W / 2} ${H / 2})">
<polygon points="${poly}" fill="url(#paper)" filter="url(#drop)"/>
<rect x="${x0 + 12}" y="${y0 + 14}" width="${w - 24}" height="${h - 28}" fill="none" stroke="${C.goldDeep}" stroke-opacity=".35" stroke-dasharray="3 4"/>
${text(f.label, `QUEST ${numerals[index]}`, { x: cx, y: 90, size: 10.5, anchor: 'middle', tracking: 4, fill: C.goldDeep })}
<circle cx="${cx}" cy="134" r="30" fill="${data.wax}" fill-opacity=".1"/>
<g transform="translate(${cx - 19} 115) scale(${n((38 / 24) * 1000) / 1000})"><path d="${icons[data.id]}" fill="${data.wax}"/></g>
${text(f.display, data.title, { x: cx, y: 204, size: 34, anchor: 'middle', fill: C.ink })}
${text(f.bodyUpright, data.handle, { x: cx, y: 230, size: 15, anchor: 'middle', fill: C.inkSoft })}
<line x1="${cx - 44}" y1="250" x2="${cx - 10}" y2="250" stroke="${C.goldDeep}" stroke-opacity=".5"/>
<line x1="${cx + 10}" y1="250" x2="${cx + 44}" y2="250" stroke="${C.goldDeep}" stroke-opacity=".5"/>
${diamond(cx, 250, 5, C.goldDeep)}
${text(f.label, 'REWARD', { x: cx, y: 272, size: 9, anchor: 'middle', tracking: 3, fill: C.muted })}
${rewardLines.map((line, i) => text(f.body, line, { x: cx, y: 293 + i * 18, size: 16, anchor: 'middle', fill: C.ink })).join('')}
<circle cx="${cx}" cy="${y0 + 8}" r="9" fill="#000" fill-opacity=".25" transform="translate(2 3)"/>
<circle cx="${cx}" cy="${y0 + 8}" r="9" fill="url(#pin)"/>
<circle cx="${cx - 3}" cy="${y0 + 5}" r="2.6" fill="#fffaf0" fill-opacity=".8"/>
<circle cx="${x0 + w - 10}" cy="${y0 + h - 8}" r="19" fill="#000" fill-opacity=".2" transform="translate(1 3)"/>
<circle cx="${x0 + w - 10}" cy="${y0 + h - 8}" r="19" fill="${data.wax}"/>
<circle cx="${x0 + w - 10}" cy="${y0 + h - 8}" r="14" fill="none" stroke="#fff" stroke-opacity=".25"/>
${sparkle(x0 + w - 10, y0 + h - 8, 14, { fill: '#fff', fillOpacity: 0.55 })}
</g>`
  return svg({
    width: W,
    height: H,
    card: false,
    title: `${data.title}: ${data.handle}`,
    defs: `
<linearGradient id="paper" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#fdf9ef"/><stop offset="1" stop-color="#efe4cc"/></linearGradient>
<radialGradient id="pin" cx=".35" cy=".35"><stop offset="0" stop-color="#fff1c9"/><stop offset=".6" stop-color="#e3cf9f"/><stop offset="1" stop-color="#9c7a36"/></radialGradient>
<filter id="drop" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#0a0e22" flood-opacity=".35"/></filter>`,
    body,
  })
}

async function epilogue(f) {
  const W = 1200
  const H = 520
  const frieren = await sharp(await readFile(FRIEREN)).resize({ height: 800 }).webp({ quality: 84 }).toBuffer()
  const fh = 400
  const fw = n((fh * 387) / 1024)
  const fx = 880
  const back = hill({ width: W, height: H, base: 452, amp: 36, seed: 31, points: 5, fill: '#1e2550', opacity: 0.95 })
  const mid = hill({ width: W, height: H, base: 478, amp: 22, seed: 37, points: 6, fill: '#141a3a' })
  const front = hill({ width: W, height: H, base: 506, amp: 14, seed: 43, points: 7, fill: '#0c1028' })
  const body = `
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<rect width="${W}" height="${H}" fill="url(#dusk)"/>
${stars({ seed: 53, count: 320, width: W, height: 460 })}
${meteors([
  { x: 700, y: 60, len: 180, delay: 0.5, dur: 9 },
  { x: 1000, y: 40, len: 140, w: 1.3, delay: 2.4, dur: 9 },
  { x: 520, y: 110, len: 120, w: 1.1, delay: 4.1, dur: 9 },
  { x: 1150, y: 140, len: 160, delay: 5.8, dur: 9 },
  { x: 860, y: 20, len: 110, w: 1.1, delay: 7.3, dur: 9 },
  { x: 330, y: 60, len: 130, w: 1.2, delay: 8.2, dur: 9 },
])}
${moon(1080, 96, 38)}
${glints([
  [640, 200, 14, 0.3],
  [1120, 260, 10, 1.6],
  [760, 120, 9, 2.4],
  [420, 300, 11, 1.1],
])}
${back.path}
${flowers({ seed: 61, count: 60, width: W, at: back.at, depth: 18, scale: [0.5, 0.9], glow: 0.12 })}
<ellipse cx="${fx}" cy="${H - 120}" rx="170" ry="190" fill="url(#warm)" opacity=".6"/>
${mid.path}
${flowers({ seed: 67, count: 90, width: W, at: mid.at, depth: 22, scale: [0.7, 1.2], glow: 0.2 })}
<image href="data:image/webp;base64,${frieren.toString('base64')}" x="${n(fx - fw / 2)}" y="${H - 28 - fh}" width="${fw}" height="${fh}" filter="url(#figure)"/>
${front.path}
${flowers({ seed: 71, count: 80, width: W, at: front.at, depth: 14, scale: [1, 1.7], glow: 0.3 })}
${petals({ seed: 12, count: 18, width: W, height: H })}
${kicker(f.label, 'CHAPTER V · EPILOGUE', { x: 96, y: 150, anchor: 'start', size: 12, tracking: 5 })}
<g filter="url(#glow)">
${text(f.display, 'Thanks for walking', { x: 92, y: 222, size: 58, fill: C.light })}
${text(f.display, 'with me, traveller.', { x: 92, y: 284, size: 58, fill: C.light })}
</g>
${text(f.jp, '旅の続き', { x: 96, y: 334, size: 20, fill: C.lavender })}
${diamond(196, 327, 5, C.gold)}
${text(f.label, 'THE JOURNEY CONTINUES', { x: 214, y: 333, size: 11, tracking: 4, fill: C.lavender })}
<rect x="96" y="364" width="210" height="42" rx="21" fill="${C.gold}" fill-opacity=".12" stroke="${C.gold}" stroke-opacity=".55"/>
${text(f.label, 'LAPUSHEL.DEV', { x: 186, y: 390, size: 12, anchor: 'middle', tracking: 4, fill: C.gold })}
<path d="M270 391L280 381M273 380.5H280.5V388" fill="none" stroke="${C.gold}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
`
  return svg({
    width: W,
    height: H,
    title: 'Epilogue: Frieren holding blue flowers under the meteor shower. Thanks for walking with me, traveller.',
    defs: `<filter id="figure" x="-30%" y="-10%" width="160%" height="120%"><feDropShadow dx="0" dy="0" stdDeviation="10" flood-color="#e3cf9f" flood-opacity=".25"/></filter>`,
    style: petalStyle(H),
    body,
  })
}

const QUESTS = [
  { id: 'portfolio', title: 'Portfolio', handle: 'lapushel.dev', reward: 'A journey told in scroll', wax: '#57508c' },
  { id: 'youtube', title: 'YouTube', handle: 'La Pucelle', reward: 'Music and side quests', wax: '#9e4459' },
  { id: 'discord', title: 'Discord', handle: 'Join the party', reward: 'A seat by the campfire', wax: '#4a5fa8' },
  { id: 'instagram', title: 'Instagram', handle: '@lapushel', reward: 'Snapshots of the road', wax: '#9c7a36' },
  { id: 'steam', title: 'Steam', handle: 'lapushel_', reward: 'A co-op companion', wax: '#3d7a69' },
]

const fonts = {
  display: await loadFont('display', 'Cormorant+Garamond:ital,wght@1,500'),
  displayUpright: await loadFont('display-upright', 'Cormorant+Garamond:wght@500'),
  label: await loadFont('label', 'Cinzel:wght@600'),
  labelLight: await loadFont('label-light', 'Cinzel:wght@400'),
  body: await loadFont('body', 'EB+Garamond:ital,wght@1,400'),
  bodyUpright: await loadFont('body-upright', 'EB+Garamond:wght@400'),
  jp: await loadFont('jp', 'Shippori+Mincho:wght@400', '旅の続き'),
}

const icons = {
  portfolio: CRESCENT,
  youtube: siYoutube.path,
  discord: siDiscord.path,
  instagram: siInstagram.path,
  steam: siSteam.path,
}

const builds = {
  'header.svg': () => header(fonts),
  'prologue.svg': () => prologue(fonts),
  'grimoire.svg': () => grimoire(fonts),
  'guild.svg': () =>
    banner(fonts, {
      chapter: 'CHAPTER III · ADVENTURERS’ GUILD',
      title: 'Where to find me',
      subtitle: 'Pick a notice from the board and come say hi.',
      seed: 83,
      aria: 'Chapter III, Adventurers’ guild: where to find me',
    }),
  ...Object.fromEntries(QUESTS.map((quest, i) => [`quest-${quest.id}.svg`, () => notice(fonts, quest, i, icons)])),
  'campfire.svg': () =>
    banner(fonts, {
      chapter: 'CHAPTER IV · CAMPFIRE',
      title: 'Resting by the fire',
      subtitle: 'What the traveller is up to right now.',
      seed: 89,
      aria: 'Chapter IV, Campfire: what I am up to right now',
      extra: campfire(150, 160) + campfire(1050, 160),
    }),
  'epilogue.svg': () => epilogue(fonts),
}

await mkdir(OUT, { recursive: true })
for (const [name, build] of Object.entries(builds)) {
  const markup = await build()
  const content = markup.replace('/*FONTS*/', await fontFaces(takeUsage()))
  await writeFile(new URL(name, OUT), content)
  console.log(`${name.padEnd(22)} ${(Buffer.byteLength(content) / 1024).toFixed(1)} KB`)
}

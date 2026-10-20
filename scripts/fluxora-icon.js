// Fluxora brand asset generator v2 — "FLUX VORTEX"
// Pure Node, zero deps. Evolves the FLUX ORBIT identity into a four-blade
// vortex with a floating intelligence core. One geometry source of truth for
// the raster set, the SVG family, editions, favicon + wallpaper.
//
// DNA preserved:
//   - tilted orbital plane (same TILT as v1) => still reads as Fluxora
//   - flowing motion, negative space, asymmetric balance
// Evolution:
//   - four tapered blades (titanium, leading-edge champagne-gold tips,
//     electric-sapphire accent on one blade) around a central floating orb
//   - sharper apexes, physically-plausible global illumination, satin
//     chrome bevels, micro rim highlights, obsidian ceramic tile

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

// ---------------------------------------------------------------- png/ico
function crc32(buf) {
  let table = crc32.table
  if (!table) {
    table = crc32.table = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c
    }
  }
  let crc = -1
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff]
  return (crc ^ -1) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const tb = Buffer.from(type, 'ascii')
  const cb = Buffer.alloc(4)
  cb.writeUInt32BE(crc32(Buffer.concat([tb, data])))
  return Buffer.concat([len, tb, data, cb])
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}
function resample(src, srcSize, dstSize) {
  const out = Buffer.alloc(dstSize * dstSize * 4)
  const f = srcSize / dstSize
  for (let y = 0; y < dstSize; y++) {
    const sy = Math.min(srcSize - 1, Math.floor(y * f))
    for (let x = 0; x < dstSize; x++) {
      const sx = Math.min(srcSize - 1, Math.floor(x * f))
      const si = (sy * srcSize + sx) * 4
      const di = (y * dstSize + x) * 4
      out[di] = src[si]; out[di + 1] = src[si + 1]; out[di + 2] = src[si + 2]; out[di + 3] = src[si + 3]
    }
  }
  return out
}
function buildIco(pngs) {
  const n = pngs.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(n, 4)
  const entries = []
  let offset = 6 + 16 * n
  for (const { size, buf } of pngs) {
    const e = Buffer.alloc(16)
    e[0] = size >= 256 ? 0 : size
    e[1] = size >= 256 ? 0 : size
    e[2] = 0
    e[3] = 0
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(buf.length, 8)
    e.writeUInt32LE(offset, 12)
    entries.push(e)
    offset += buf.length
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.buf)])
}

// ---------------------------------------------------------------- material palette
// Calibrated against the Fluxora reference: black chrome + champagne gold.
// Warm blacks carry the ground; blades are warm liquid chrome; gold is the
// champagne family rgb(240,216,192) -> rgb(168,144,120).
const C = {
  steelHi: [230, 224, 210],
  steelLo: [40, 40, 38],
  steelDarkHi: [88, 84, 78],
  steelDarkLo: [16, 15, 14],
  goldTip: [228, 192, 138],
  goldTipLo: [158, 120, 62],
  sapphire: [90, 140, 230],
  orbCore: [244, 224, 188],
  orbHi: [222, 192, 148],
  orbMid: [180, 146, 98],
  orbRim: [104, 80, 50],
  white: [242, 244, 252],
  black: [10, 12, 18],
  tileTop: [17, 16, 15],
  tileBot: [4, 4, 4],
}

const lerpN = (a, b, t) => a + (b - a) * t
const clamp01 = (v) => Math.max(0, Math.min(1, v))
const interp = (a, b, t) => [lerpN(a[0], b[0], t), lerpN(a[1], b[1], t), lerpN(a[2], b[2], t)]
const c255 = (v) => Math.round(Math.min(255, Math.max(0, v)))

// ---------------------------------------------------------------- geometry
const TILT = 0.34
const CX = 0.5
const CY = 0.505
const MAJOR = 0.345
const MINOR = 0.196
const W_BASE = 0.058
const RH = 0.106        // orb radius
const OX = 0.5
const OY = 0.485        // orb floats slightly upward-left (asymmetry)
const ORBIT_LIGHT = 2.2 // global light direction in orbit space

function px(angle, a, b) {
  const cos = Math.cos(TILT)
  const sin = Math.sin(TILT)
  const dx = Math.cos(angle) * a
  const dy = Math.sin(angle) * b
  return { x: CX + dx * cos - dy * sin, y: CY + dx * sin + dy * cos }
}

// Four blades. Each blade: center angle around the orbit, angular span,
// radial lift, tiny tangential shift -> asymmetrical but unified.
const BLADES = [
  { c: -0.14, sp: 1.06, lift: 1.0, sh: -0.07 },
  { c: Math.PI / 2 + 0.14, sp: 0.96, lift: 0.955, sh: 0.05 },
  { c: Math.PI - 0.04, sp: 1.1, lift: 1.06, sh: -0.04 },
  { c: -Math.PI / 2 + 0.1, sp: 1.0, lift: 0.99, sh: 0.07 },
]
const NQ = 24 // quads per blade

function halfWidth(u) {
  const sup = Math.pow(Math.sin(Math.PI * u), 0.92)
  const dir = u < 0.5 ? 1.18 : 0.82
  return Math.max(W_BASE * sup * dir, 0.0045)
}

// Precompute per-blade polygon + edge point sets.
const BLADE_SETS = []
for (const b of BLADES) {
  const pts = []       // {x,y,u,phi,edge}
  const outer = []
  const inner = []
  for (let i = 0; i <= NQ; i++) {
    const u = i / NQ
    const phi = b.c + b.sh + (u - 0.5) * b.sp
    const p = px(phi, MAJOR * b.lift, MINOR * b.lift)
    const w = halfWidth(u)
    const nx = (p.x - CX) / Math.hypot(p.x - CX, p.y - CY)
    const ny = (p.y - CY) / Math.hypot(p.x - CX, p.y - CY)
    const ox = p.x + nx * w
    const oy = p.y + ny * w
    const ix = p.x - nx * w
    const iy = p.y - ny * w
    outer.push({ x: ox, y: oy, u, phi })
    inner.push({ x: ix, y: iy, u, phi })
    pts.push({ x: ox, y: oy, u, phi })
  }
  for (let i = NQ; i >= 0; i--) pts.push({ x: inner[i].x, y: inner[i].y, u: inner[i].u, phi: inner[i].phi })
  BLADE_SETS.push({ pts, outer, inner })
}

// ---------------------------------------------------------------- render core
const aaK = (S) => S / 1.2

function bladeShade(phi, u, mode) {
  const shad = Math.max(0, Math.min(1, 0.52 + 0.4 * Math.cos(phi - ORBIT_LIGHT) + 0.08 * Math.cos(2 * (phi - ORBIT_LIGHT))))
  const ygrad = 0.06 * Math.sin(phi) // faint vertical polish
  let col
  if (mode.bladeFlat) {
    col = interp(mode.bladeFlat, mode.bladeFlat, 0)
    col = [col[0] * (0.9 + 0.12 * shad), col[1] * (0.9 + 0.12 * shad), col[2] * (0.9 + 0.12 * shad)]
  } else {
    col = interp(mode.bladeDark ? C.steelDarkLo : C.steelLo, mode.bladeDark ? C.steelDarkHi : C.steelHi, clamp01(shad + ygrad))
  }
  // champagne-gold apex tips (both sharp apexes carry the luxury accent)
  let goldF = 0
  goldF = Math.max(goldF, Math.pow(Math.max(0, (u - 0.72) / 0.28), 1.6) * 0.92)
  goldF = Math.max(goldF, Math.pow(Math.max(0, (1.0 - u) / 0.5), 2.2) * 0.5)
  if (mode.goldTips !== false && goldF > 0) col = interp(col, C.goldTip, goldF)
  // electric-sapphire accent streak on blade index 1
  if (mode.sapphireStreak && u > 0.16 && u < 0.55) col = interp(col, C.sapphire, 0.1 * Math.sin(Math.PI * (u - 0.16) / 0.39))
  return col
}

function renderMark(S, mode) {
  const buf = Buffer.alloc(S * S * 4)
  const k = aaK(S)
  const sets = BLADE_SETS
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const ci = (y * S + x) * 4
      const qx = (x + 0.5) / S
      const qy = (y + 0.5) / S
      let r = 0, g = 0, b = 0, alpha = 1
      if (mode.tile) {
        const tileA = clamp01(0.5 - roundedBoxDist(x + 0.5, y + 0.5, S) * k)
        if (tileA <= 0) continue
        alpha = tileA
        let tc = interp(C.tileTop, C.tileBot, clamp01(qy * 1.15 - 0.07))
        const vign = Math.max(0, 1 - Math.hypot(qx - 0.5, qy - 0.5) / 0.72)
        tc = interp(tc, C.tileBot, (1 - vign) * 0.28)
        const aurA = Math.max(0, 1 - Math.hypot(qx - 0.5, qy - 0.62) / 0.55)
        tc = interp(tc, [54, 36, 14], aurA * aurA * 0.085)
        const aurB = Math.max(0, 1 - Math.hypot(qx - 0.52, qy - 0.48) / 0.6)
        tc = interp(tc, [76, 50, 16], aurB * aurB * 0.06)
        r = tc[0]; g = tc[1]; b = tc[2]
      } else {
        alpha = 0
      }

      // blades (four tapered vortex surfaces)
      let best = Infinity
      let bestSet = 0
      let bestI = 0
      for (let s = 0; s < sets.length; s++) {
        const arr = sets[s].pts
        for (let i = 0; i < arr.length; i++) {
          const dx = qx - arr[i].x
          const dy = qy - arr[i].y
          const d2 = dx * dx + dy * dy
          if (d2 < best) { best = d2; bestSet = s; bestI = i }
        }
      }
      const bd = Math.sqrt(best)
      const bpt = sets[bestSet].pts[bestI]
      const cover = clamp01(0.5 + (halfWidth(bpt.u) - bd) * k)
      if (cover > 0) {
        let bc = bladeShade(bpt.phi, bpt.u, mode)
        const core = clamp01(0.5 + (halfWidth(bpt.u) * 0.42 - bd) * k)
        bc = interp(bc, mode.bladeFlat ? C.white : [244, 238, 222], core * 0.34)
        // bevel: thin dark inner + satin outer edge lighting
        const edgeD = edgeDist(qx, qy, sets[bestSet])
        if (edgeD !== Infinity && edgeD < 0.014) {
          if (edgeD < 0.007) bc = interp(bc, [16, 18, 24], 0.5) // bevel darken
          else bc = interp(bc, mode.bladeFlat ? C.white : [250, 252, 255], 0.7) // satin rim
        }
        r = r * (1 - cover) + bc[0] * cover
        g = g * (1 - cover) + bc[1] * cover
        b = b * (1 - cover) + bc[2] * cover
        if (!mode.tile) alpha = Math.max(alpha, cover)
      }

      // floating orb (optical sapphire glass over champagne-gold core)
      const dO = Math.hypot(qx - OX, qy - OY)
      const halo = Math.max(0, 1 - dO / (RH * 1.7))
      if (mode.tile && halo > 0) {
        const hc = interp(C.goldTipLo, C.tileTop, 0.5)
        r = r * (1 - halo * 0.16) + hc[0] * halo * 0.16
        g = g * (1 - halo * 0.16) + hc[1] * halo * 0.16
        b = b * (1 - halo * 0.16) + hc[2] * halo * 0.16
      }
      const oCover = clamp01(0.5 + (RH - dO) * k)
      if (oCover > 0) {
        const t = clamp01(dO / RH)
        const pcol = t < 0.3 ? interp(C.orbCore, C.orbHi, t / 0.3)
          : t < 0.7 ? interp(C.orbHi, C.orbMid, (t - 0.3) / 0.4)
          : interp(C.orbMid, C.orbRim, (t - 0.7) / 0.3)
        let oc = mode.orbFlat ? interp(mode.orbFlat, mode.orbFlat, 0) : pcol
        oc = interp(oc, [255, 246, 214], Math.max(0, 1 - t / 0.5) * 0.4)
        const sp = Math.hypot(qx - (OX - RH * 0.34), qy - (OY - RH * 0.4))
        if (sp < RH * 0.34) oc = interp(oc, [255, 252, 236], 0.85)
        r = r * (1 - oCover) + oc[0] * oCover
        g = g * (1 - oCover) + oc[1] * oCover
        b = b * (1 - oCover) + oc[2] * oCover
        if (!mode.tile) alpha = Math.max(alpha, oCover)
      }

      buf[ci] = c255(r)
      buf[ci + 1] = c255(g)
      buf[ci + 2] = c255(b)
      buf[ci + 3] = c255(alpha)
    }
  }
  return buf
}

function edgeDist(qx, qy, set) {
  let best = Infinity
  const ed = set.outer.concat(set.inner)
  for (let i = 0; i < ed.length; i++) {
    const dx = qx - ed[i].x
    const dy = qy - ed[i].y
    const d2 = dx * dx + dy * dy
    if (d2 < best) best = d2
  }
  return Math.sqrt(best)
}

function roundedBoxDist(x, y, size) {
  const m = 0.07 * size
  const r = 0.21 * size
  const qx = Math.abs(x - size / 2) - (size / 2 - m - r)
  const qy = Math.abs(y - size / 2) - (size / 2 - m - r)
  const ox = Math.max(qx, 0)
  const oy = Math.max(qy, 0)
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r
}

// ---------------------------------------------------------------- modes
// lodash-free options: tile?, bladeFlat?, bladeDark?, goldTips?, sapphireStreak?, orbFlat?
// full = obsidian ceramic tile + liquid titanium blades + champagne tips + sapphire streak + gold orb
// white/black = transparent single-color vectors
// gold = obsidian tile + champagne monochrome mark
// obsidian = transparent, brushed dark metal + gold orb (emboss feel)
// pearl = light tile + dark titanium mark + gold orb
// dark = transparent obsidian silhouette for light backgrounds
const MODES = {
  full: { tile: true, goldTips: true, sapphireStreak: false },
  white: { tile: false, bladeFlat: C.white, orbFlat: [255, 228, 178] },
  black: { tile: false, bladeFlat: C.black, orbFlat: [150, 120, 70] },
  gold: { tile: true, bladeFlat: [240, 210, 150], goldTips: false, orbFlat: C.orbMid },
  obsidian: { tile: false, bladeDark: true, goldTips: false, orbFlat: C.orbMid },
  pearl: { tile: true, bladeDark: true, goldTips: false, orbFlat: C.orbHi },
  dark: { tile: false, bladeFlat: [22, 20, 18], orbFlat: [190, 160, 100] },
}

// ---------------------------------------------------------------- svg
const S1000 = 1000
function orbGradSvg(id, orb) {
  const core = orb || C.orbCore
  const hi = orb ? interp(orb, [255, 250, 235], 0.5) : C.orbHi
  const mid = orb ? interp(orb, C.orbMid, 0.35) : C.orbMid
  const rim = C.orbRim
  return `<radialGradient id="${id}" cx="0.5" cy="0.5" r="0.6">
    <stop offset="0" stop-color="rgb(${core[0]},${core[1]},${core[2]})"/>
    <stop offset="0.5" stop-color="rgb(${hi[0]},${hi[1]},${hi[2]})"/>
    <stop offset="0.82" stop-color="rgb(${mid[0]},${mid[1]},${mid[2]})"/>
    <stop offset="1" stop-color="rgb(${rim[0]},${rim[1]},${rim[2]})"/>
  </radialGradient>`
}
function bladePolygonSvg(set, i) {
  let d = ''
  set.pts.forEach((p, idx) => {
    d += `${idx === 0 ? 'M' : 'L'}${(p.x * 1000).toFixed(1)},${(p.y * 1000).toFixed(1)}`
  })
  d += 'Z'
  return d
}
function tipPathsSvg(set) {
  let d = ''
  for (let i = Math.round(NQ * 0.8); i < set.outer.length; i++) {
    const p = set.outer[i]
    d += `${i === Math.round(NQ * 0.8) ? 'M' : 'L'}${(p.x * 1000).toFixed(1)},${(p.y * 1000).toFixed(1)}`
  }
  return d
}
function bladeFillSvg(mode, i) {
  if (mode.bladeFlat) return `rgb(${mode.bladeFlat[0]},${mode.bladeFlat[1]},${mode.bladeFlat[2]})`
  if (mode.bladeDark) {
    const a = C.steelDarkHi && i === 1 ? interp(C.steelDarkHi, C.sapphire, 0.35) : (C.steelDarkHi || C.steelHi)
    return `rgb(${a[0]},${a[1]},${a[2]})`
  }
  return i === 1 && MODES.full.sapphireStreak ? `rgb(${C.sapphire[0]},${C.sapphire[1]},${C.sapphire[2]})` : `rgb(${C.steelHi[0]},${C.steelHi[1]},${C.steelHi[2]})`
}
function svgVersion(mode, idSuffix) {
  let tile = ''
  if (mode.tile) {
    tile = `<defs><radialGradient id="tg${idSuffix}" cx="0.5" cy="0.5" r="0.7">
      <stop offset="0" stop-color="rgb(${mode.tileTop ? C.tileTop : [18, 21, 32][0]},${mode.tileTop ? C.tileTop : [18, 21, 32][1]},${mode.tileTop ? C.tileTop : [18, 21, 32][2]})"/>
      <stop offset="1" stop-color="rgb(${mode.tileBottom ? mode.tileBottom[0] : C.tileBot[0]},${mode.tileBottom ? mode.tileBottom[1] : C.tileBot[1]},${mode.tileBottom ? mode.tileBottom[2] : C.tileBot[2]})"/>
    </radialGradient></defs>
    <rect x="60" y="60" width="880" height="880" rx="200" fill="url(#tg${idSuffix})"/>`
  }
  let blades = ''
  BLADE_SETS.forEach((set, i) => {
    const fid = `bg${idSuffix}${i}`
    let fill = bladeFillSvg(mode, i)
    if (!mode.bladeFlat && !mode.bladeDark) fill = `url(#${fid})`
    const gradDef = !mode.bladeFlat && !mode.bladeDark
      ? `<defs><linearGradient id="${fid}" x1="0.2" y1="0" x2="0.85" y2="1">
          <stop offset="0" stop-color="${i === 1 && mode.sapphireStreak ? `rgb(${C.sapphire[0]},${C.sapphire[1]},${C.sapphire[2]})` : `rgb(${C.steelHi[0]},${C.steelHi[1]},${C.steelHi[2]})`}"/>
          <stop offset="1" stop-color="rgb(${C.steelLo[0]},${C.steelLo[1]},${C.steelLo[2]})"/>
        </linearGradient></defs>`
      : ''
    let tips = ''
    if (mode.goldTips !== false) {
      const td = tipPathsSvg(set)
      if (td) tips = `<path d="${td}" fill="none" stroke="rgb(${C.goldTip[0]},${C.goldTip[1]},${C.goldTip[2]})" stroke-opacity="0.9" stroke-width="26" stroke-linecap="round"/>`
    }
    blades += `${gradDef}
  <path d="${bladePolygonSvg(set, i)}" fill="${fill}" fill-rule="evenodd"/>
  ${tips}`
  })
  const orb = blobOrbSvg(mode, idSuffix)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">
  ${tile}${orb.grad}
  <g>${blades}</g>
  ${orb.circle}
</svg>`
}
function blobOrbSvg(mode, idSuffix) {
  const gid = `or${idSuffix}`
  const onx = OX * 1000, ony = OY * 1000, or = RH * 1000
  const grad = mode.orbFlat ? '' : orbGradSvg(gid, mode.orbFlat ? mode.orbFlat : null)
  const fill = mode.orbFlat ? `rgb(${mode.orbFlat[0]},${mode.orbFlat[1]},${mode.orbFlat[2]})` : `url(#${gid})`
  return {
    grad,
    circle: `<circle cx="${onx.toFixed(1)}" cy="${ony.toFixed(1)}" r="${or.toFixed(1)}" fill="${fill}"/>
  <circle cx="${(onx - or * 0.34).toFixed(1)}" cy="${(ony - or * 0.4).toFixed(1)}" r="${(or * 0.34).toFixed(1)}" fill="rgb(255,255,248)" fill-opacity="0.75"/>`,
  }
}

// ---------------------------------------------------------------- wallpaper
function renderWallpaper(mode, W, H) {
  const S = 640
  const mark = renderMark(S, { tile: false, bladeDark: true, goldTips: true, sapphireStreak: true, orbFlat: C.orbHi })
  const buf = Buffer.alloc(W * H * 4)
  const cx = (q) => Math.floor(clamp01(q) * (W - 1))
  const cy = (q) => Math.floor(clamp01(q) * (H - 1))
  for (let y = 0; y < H; y++) {
    const qy = y / H
    for (let x = 0; x < W; x++) {
      const qx = x / W
      const ci = (y * W + x) * 4
      let r = interp([10, 9, 8], [36, 29, 20], clamp01(qy * 1.25))[0]
      let g = interp([10, 9, 8], [36, 29, 20], clamp01(qy * 1.25))[1]
      let b = interp([10, 9, 8], [36, 29, 20], clamp01(qy * 1.25))[2]
      const ag = Math.max(0, 1 - Math.hypot(qx - 0.82, qy - 0.18) / 0.75)
      r += 30 * ag * ag * 0.6; g += 22 * ag * ag * 0.6; b -= 10 * ag * ag * 0.6
      const av = Math.max(0, 1 - Math.hypot(qx - 0.12, qy - 0.9) / 0.7)
      r += 14 * av * av * 0.5; g += 10 * av * av * 0.5; b -= 6 * av * av * 0.5
      const mq = 0.5 + (qx - 0.78) * 0.62
      const mr = 0.5 + (qy - 0.34) * 0.62
      const mx = Math.floor(mq * S), my = Math.floor(mr * S)
      if (mx >= 0 && mx < S && my >= 0 && my < S) {
        const mi = (my * S + mx) * 4
        const ma = mark[mi + 3] / 255
        if (ma > 0) {
          const glow = ma * 0.1
          r += (mark[mi] - r) * glow
          g += (mark[mi + 1] - g) * glow
          b += (mark[mi + 2] - b) * glow
        }
      }
      buf[ci] = c255(r); buf[ci + 1] = c255(g); buf[ci + 2] = c255(b); buf[ci + 3] = 255
    }
  }
  return buf
}

// ---------------------------------------------------------------- favicon (compact 4-blade silhouette)
function faviconSvg(black) {
  const col = black ? 'rgb(12,11,10)' : 'rgb(242,228,196)'
  let d = ''
  BLADE_SETS.forEach((set) => {
    set.pts.forEach((p, idx) => {
      d += `${idx === 0 ? 'M' : 'L'}${(p.x * 1000).toFixed(0)},${(p.y * 1000).toFixed(0)}`
    })
    d += 'Z'
  })
  const onx = OX * 1000, ony = OY * 1000, or = RH * 1000
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><path d="${d}" fill="${col}"/><circle cx="${onx.toFixed(0)}" cy="${ony.toFixed(0)}" r="${or.toFixed(0)}" fill="${col}"/></svg>`
}

// ---------------------------------------------------------------- write
const rootOut = path.join(__dirname, '..')

function writeAssets() {
  const out = path.join(rootOut, 'build')
  fs.mkdirSync(out, { recursive: true })

  // full-colour app icon set
  const p1024 = renderMark(1024, MODES.full)
  const p512 = renderMark(512, MODES.full)
  fs.writeFileSync(path.join(out, 'icon-1024.png'), encodePNG(1024, 1024, p1024))
  fs.writeFileSync(path.join(out, 'icon-512.png'), encodePNG(512, 512, p512))
  fs.writeFileSync(path.join(out, 'icon.png'), encodePNG(512, 512, p512))
  for (const s of [256, 128, 64, 48, 32, 16]) {
    fs.writeFileSync(path.join(out, `icon-${s}.png`), encodePNG(s, s, resample(p512, 512, s)))
  }
  const icoBufs = [256, 64, 48, 32, 16].map((s) => ({ size: s, buf: encodePNG(s, s, resample(p512, 512, s)) }))
  fs.writeFileSync(path.join(out, 'icon.ico'), buildIco(icoBufs))

  // special editions (512)
  const ed = { gold: 'icon-gold.png', obsidian: 'icon-obsidian.png', pearl: 'icon-pearl.png' }
  for (const key of Object.keys(ed)) {
    fs.writeFileSync(path.join(out, ed[key]), encodePNG(512, 512, renderMark(512, MODES[key])))
  }

  // SVG family
  const assets = path.join(rootOut, 'src', 'assets')
  fs.mkdirSync(assets, { recursive: true })
  fs.writeFileSync(path.join(assets, 'fluxora-mark.svg'), svgVersion(MODES.full, 'f'))
  fs.writeFileSync(path.join(assets, 'fluxora-mark-white.svg'), svgVersion(MODES.white, 'w'))
  fs.writeFileSync(path.join(assets, 'fluxora-mark-black.svg'), svgVersion(MODES.black, 'k'))
  fs.writeFileSync(path.join(assets, 'fluxora-mark-gold.svg'), svgVersion(MODES.gold, 'g'))
  fs.writeFileSync(path.join(assets, 'fluxora-mark-obsidian.svg'), svgVersion(MODES.obsidian, 'o'))
  fs.writeFileSync(path.join(assets, 'fluxora-monochrome.png'), encodePNG(64, 64, resample(renderMark(256, MODES.white), 256, 64)))
  const mk = renderMark(512, MODES.full)
  fs.writeFileSync(path.join(assets, 'fluxora-favicon.png'), encodePNG(32, 32, resample(mk, 512, 32)))
  fs.writeFileSync(path.join(assets, 'fluxora-favicon.svg'), faviconSvg(false))
  fs.writeFileSync(path.join(assets, 'fluxora-favicon-mono.svg'), faviconSvg(true))

  // wallpaper
  fs.writeFileSync(path.join(assets, 'fluxora-wallpaper.png'), encodePNG(1920, 1080, renderWallpaper(MODES.full, 1920, 1080)))

  // favicon data-uri for index.html (URL-encoded compact favicon svg)
  const d = faviconSvg(false).replace(/"/g, "'").replace(/[<>#%]/g, (ch) => {
    return ch === '<' ? '%3C' : ch === '>' ? '%3E' : ch === '#' ? '%23' : '%25'
  })
  fs.writeFileSync(path.join(out, 'favicon-datauri.txt'), `data:image/svg+xml,${d}`)

  console.log('Fluxora VORTEX assets written:')
  for (const f of fs.readdirSync(out).sort()) console.log('  build/' + f)
  for (const f of fs.readdirSync(assets).sort()) console.log('  src/assets/' + f)
}

writeAssets()
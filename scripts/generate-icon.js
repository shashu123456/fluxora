const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const SIZE = 512

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
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
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

function hex(h) {
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  const cx = Math.max(x0 + r, Math.min(x, x1 - r))
  const cy = Math.max(y0 + r, Math.min(y, y1 - r))
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= r * r
}

function inCircle(x, y, cx, cy, r) {
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= r * r
}

function inTriangle(px, py, a, b, c) {
  const sign = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
  const d1 = sign([px, py], a, b)
  const d2 = sign([px, py], b, c)
  const d3 = sign([px, py], c, a)
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}

const top = hex('1b1433')
const bottom = hex('0a0a12')
const accentA = hex('7c3aed')
const accentB = hex('06b6d4')

const RGBA = Buffer.alloc(SIZE * SIZE * 4)
const MARGIN = 26
const RECT_R = 118

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const px = y * SIZE * 4 + x * 4
    let r, g, b, a = 0
    if (inRoundedRect(x, y, MARGIN, MARGIN, SIZE - MARGIN, SIZE - MARGIN, RECT_R)) {
      const t = y / SIZE
      const base = lerp(top, bottom, t)
      // subtle diagonal accent wash from top-left
      const glow = lerp(accentA, accentB, (x + y) / (SIZE * 2))
      r = base[0] * 0.72 + glow[0] * 0.28
      g = base[1] * 0.72 + glow[1] * 0.28
      b = base[2] * 0.72 + glow[2] * 0.28
      a = 255
    }
    if (a === 0) continue
    RGBA[px] = Math.round(r)
    RGBA[px + 1] = Math.round(g)
    RGBA[px + 2] = Math.round(b)
    RGBA[px + 3] = 255
  }
}

// Chat bubble body (white, slight warm tint)
const BX0 = 131, BY0 = 148, BX1 = 381, BY1 = 356
const BUB_R = 66
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const px = y * SIZE * 4 + x * 4
    if (RGBA[px + 3] === 0) continue
    const body = inRoundedRect(x, y, BX0, BY0, BX1, BY1, BUB_R)
    const tail = inTriangle(x, y, [BX0 + 30, BY1 - 8], [BX0 + 92, BY1 - 34], [BX0 + 108, BY1 + 14])
    if (body || tail) {
      RGBA[px] = 246
      RGBA[px + 1] = 246
      RGBA[px + 2] = 252
      RGBA[px + 3] = 255
    }
  }
}

// Accent ring on bubble top edge + typing dots
const dots = [
  { x: 186, y: 258 },
  { x: 256, y: 258 },
  { x: 326, y: 258 },
  { x: 256, y: 186 },
  { x: 256, y: 330 },
]
const dotDark = hex('171226')
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const px = y * SIZE * 4 + x * 4
    if (RGBA[px + 3] === 0) continue
    for (const d of dots) {
      if (inCircle(x, y, d.x, d.y, 22)) {
        const edge = inCircle(x, y, d.x, d.y, 26) && !inCircle(x, y, d.x, d.y, 23)
        if (d.y === 186 && edge) {
          // gradient arc accent on top dot
          const tx = (x - d.x) / 26
          const grad = lerp(accentA, accentB, tx * 0.5 + 0.25)
          RGBA[px] = Math.round(grad[0])
          RGBA[px + 1] = Math.round(grad[1])
          RGBA[px + 2] = Math.round(grad[2])
        } else if (!(d.y === 186)) {
          RGBA[px] = dotDark[0]
          RGBA[px + 1] = dotDark[1]
          RGBA[px + 2] = dotDark[2]
        }
      }
    }
  }
}

const outDir = path.join(__dirname, '..', 'build')
fs.mkdirSync(outDir, { recursive: true })
const png512 = encodePNG(SIZE, SIZE, RGBA)

// downscale-free single-size ICO (256 -> embedded PNG resizing; ICO with 256 PNG entry)
let png256 = png512
if (false) png256 = png512 // keep 512 for png; ICO entry below uses resized bitmap via 256

// Simple nearest-neighbor downscale to 256 for the ICO's PNG entry
function resample(src, srcSize, dstSize) {
  const out = Buffer.alloc(dstSize * dstSize * 4)
  const f = srcSize / dstSize
  for (let y = 0; y < dstSize; y++) {
    const sy = Math.floor(y * f)
    for (let x = 0; x < dstSize; x++) {
      const sx = Math.floor(x * f)
      const si = (sy * srcSize + sx) * 4
      const di = (y * dstSize + x) * 4
      out[di] = src[si]
      out[di + 1] = src[si + 1]
      out[di + 2] = src[si + 2]
      out[di + 3] = src[si + 3]
    }
  }
  return out
}

png256 = encodePNG(256, 256, resample(RGBA, SIZE, 256))

const icoHeader = Buffer.alloc(6)
icoHeader.writeUInt16LE(0, 0)
icoHeader.writeUInt16LE(1, 2)
icoHeader.writeUInt16LE(1, 4)

const entry = Buffer.alloc(16)
entry[0] = 0
entry[1] = 0
entry[2] = 0
entry[3] = 0
entry.writeUInt16LE(1, 4)
entry.writeUInt16LE(32, 6)
entry.writeUInt32LE(png256.length, 8)
entry.writeUInt32LE(22, 12)

fs.writeFileSync(path.join(outDir, 'icon.png'), png512)
fs.writeFileSync(path.join(outDir, 'icon.ico'), Buffer.concat([icoHeader, entry, png256]))
console.log('Wrote build/icon.png (' + png512.length + ' bytes) and build/icon.ico (' + (Buffer.concat([icoHeader, entry, png256]).length) + ' bytes)')
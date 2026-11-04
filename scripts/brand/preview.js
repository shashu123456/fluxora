// Brand QA contact sheet: renders the mark on dark/light, the app tile, and the
// small-size ladder so regressions in the geometry are visible immediately.
//
//   node scripts/brand/preview.js
//
// Writes docs/evidence/ui/brand-preview.png (contact sheet, not shipped in app).

const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const { buildMarkSvg } = require('./mark-svg')

const OUT = path.join(__dirname, '../../docs/evidence/ui')

async function render(svg, w, h = w, background) {
  const img = sharp(Buffer.from(svg))
  const meta = await img.metadata()
  const scale = w / meta.width
  const out = await img
    .resize({ width: w, height: h, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  if (background) {
    return sharp({ create: { width: w, height: h, channels: 4, background } })
      .composite([{ input: out }])
      .png()
      .toBuffer()
  }
  return out
}

function tileSvg(size = 1024, inset = 0.66, variant = 'metallic') {
  const inner = buildMarkSvg(variant)
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
  const offset = (1024 * (1 - inset)) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
    <defs>
      <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#141312"/>
        <stop offset="0.55" stop-color="#0B0B0A"/>
        <stop offset="1" stop-color="#050505"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.5" cy="0.4" r="0.52">
        <stop offset="0" stop-color="rgba(216,189,132,0.13)"/>
        <stop offset="0.62" stop-color="rgba(216,189,132,0.035)"/>
        <stop offset="1" stop-color="rgba(216,189,132,0)"/>
      </radialGradient>
    </defs>
    <rect width="1024" height="1024" rx="${1024 * 0.22}" fill="url(#tile)"/>
    <rect width="1024" height="1024" rx="${1024 * 0.22}" fill="url(#glow)"/>
    <g transform="translate(${offset} ${offset}) scale(${inset})">${inner}</g>
  </svg>`
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const dark = await render(buildMarkSvg('metallic'), 420, 420, { r: 10, g: 9, b: 9, alpha: 1 })
  const light = await render(buildMarkSvg('light'), 420, 420, { r: 245, g: 242, b: 236, alpha: 1 })
  const monoOnDark = await render(buildMarkSvg('mono'), 420, 420, { r: 12, g: 11, b: 10, alpha: 1 })
  const tile = await sharp(Buffer.from(tileSvg(420))).png().toBuffer()

  const ladder = []
  for (const s of [256, 128, 64, 48, 32, 24, 16]) {
    const variant = s <= 48 ? 'small' : 'metallic'
    const raw = await sharp(Buffer.from(tileSvg(1024, 0.66, variant))).resize(s, s).png().toBuffer()
    ladder.push({ s, raw })
  }

  const sheetW = 1760
  const sheetH = 980
  const composites = [
    { input: dark, left: 20, top: 20 },
    { input: light, left: 460, top: 20 },
    { input: monoOnDark, left: 900, top: 20 },
    { input: tile, left: 1340, top: 20 },
  ]
  let x = 20
  for (const { s, raw } of ladder) {
    const cell = await sharp({ create: { width: s + 24, height: s + 24, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: raw, left: 12, top: 12 }])
      .png()
      .toBuffer()
    composites.push({ input: cell, left: x, top: 470 })
    x += s + 40
  }

  await sharp({ create: { width: sheetW, height: sheetH, channels: 4, background: { r: 24, g: 23, b: 22, alpha: 1 } } })
    .composite(composites)
    .png()
    .toFile(path.join(OUT, 'brand-preview.png'))

  const meta = await sharp(path.join(OUT, 'brand-preview.png')).metadata()
  console.log('wrote docs/evidence/ui/brand-preview.png', meta.width + 'x' + meta.height)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

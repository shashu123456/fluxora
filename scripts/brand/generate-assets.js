// Fluxora brand asset generator.
//
// Single source of truth for every mark surface:
//   src/assets/fluxora-mark*.svg   — in-app mark (metallic / light / mono / flat)
//   build/icon*.png                — installer, window, taskbar, store art
//   build/icon.ico                 — Windows multi-size icon (16–256)
//   build/favicon-datauri.txt      — favicon data URI embedded in index.html
//   src/assets/fluxora-favicon.*   — favicon files
//
// Geometry comes from scripts/brand/mark-geometry.js; shading from
// scripts/brand/mark-svg.js. The SVG mark and the raster icons are rendered
// from that same geometry, so they cannot drift apart.
//
//   node scripts/brand/generate-assets.js
//
// Output is deterministic: no timestamps or random ids are embedded, so running
// the script twice produces byte-identical files (checked in docs/BRAND.md).

const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const { buildMarkSvg } = require('./mark-svg')

const ROOT = path.join(__dirname, '../..')
const BUILD = path.join(ROOT, 'build')
const ASSETS = path.join(ROOT, 'src/assets')

// Reference-derived brand constants (see docs/BRAND.md).
const TILE_INNER = ['#161514', '#0B0B0A', '#050505']
const TILE_GLOW = 'rgba(216,189,132,0.13)'

function stripSvg(svg) {
  return svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
}

/** App tile: obsidian rounded square with the mark centred inside it. */
function tileSvg(size, options = {}) {
  const { inset = 0.7, variant = 'metallic', radius = 0.22, flat = null } = options
  const inner = stripSvg(buildMarkSvg(variant))
  const offset = (1024 * (1 - inset)) / 2
  const defs = flat
    ? ''
    : `<defs>
        <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${TILE_INNER[0]}"/>
          <stop offset="0.55" stop-color="${TILE_INNER[1]}"/>
          <stop offset="1" stop-color="${TILE_INNER[2]}"/>
        </linearGradient>
        <radialGradient id="glow" cx="0.5" cy="0.4" r="0.52">
          <stop offset="0" stop-color="${TILE_GLOW}"/>
          <stop offset="0.62" stop-color="rgba(216,189,132,0.035)"/>
          <stop offset="1" stop-color="rgba(216,189,132,0)"/>
        </radialGradient>
      </defs>`
  const bg = flat
    ? `<rect width="1024" height="1024" rx="${1024 * radius}" fill="${flat}"/>`
    : `<rect width="1024" height="1024" rx="${1024 * radius}" fill="url(#tile)"/>
       <rect width="1024" height="1024" rx="${1024 * radius}" fill="url(#glow)"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${defs}${bg}<g transform="translate(${offset} ${offset}) scale(${inset})">${inner}</g></svg>`
}

async function renderTilePng(size, options = {}) {
  const variant = size <= 48 ? 'small' : options.variant || 'metallic'
  // Tiniest sizes gain from a little more breathing room around the mark.
  if (size <= 24 && options.inset === undefined) options = { ...options, inset: 0.6 }
  return sharp(Buffer.from(tileSvg(1024, { ...options, variant })))
    .resize(size, size, { fit: 'contain' })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

/** Windows .ico container with PNG-compressed entries (Vista and later). */
function buildIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)

  const dir = Buffer.alloc(16 * entries.length)
  let offset = 6 + dir.length
  entries.forEach((entry, i) => {
    const base = i * 16
    dir[base] = entry.size >= 256 ? 0 : entry.size
    dir[base + 1] = entry.size >= 256 ? 0 : entry.size
    dir[base + 2] = 0
    dir[base + 3] = 0
    dir.writeUInt16LE(1, base + 4)
    dir.writeUInt16LE(32, base + 6)
    dir.writeUInt32LE(entry.data.length, base + 8)
    dir.writeUInt32LE(offset, base + 12)
    offset += entry.data.length
  })

  return Buffer.concat([header, dir, ...entries.map((e) => e.data)])
}

function flatMarkSvg(fill) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><g fill="${fill}" color="${fill}">${stripSvg(buildMarkSvg('mono'))}</g></svg>`
}

async function writeSvgs() {
  fs.writeFileSync(path.join(ASSETS, 'fluxora-mark.svg'), buildMarkSvg('metallic'))
  // Optically bolded variant used at 16–40 px, where the thin taper disappears.
  fs.writeFileSync(path.join(ASSETS, 'fluxora-mark-small.svg'), buildMarkSvg('small'))
  fs.writeFileSync(path.join(ASSETS, 'fluxora-mark-light.svg'), buildMarkSvg('light'))
  fs.writeFileSync(path.join(ASSETS, 'fluxora-mark-mono.svg'), buildMarkSvg('mono'))
  fs.writeFileSync(path.join(ASSETS, 'fluxora-mark-obsidian.svg'), tileSvg(1024, { inset: 0.7 }))
  fs.writeFileSync(path.join(ASSETS, 'fluxora-mark-white.svg'), flatMarkSvg('#F6EEE2'))
  fs.writeFileSync(path.join(ASSETS, 'fluxora-mark-black.svg'), flatMarkSvg('#0B0B0A'))
}

async function writeIcons() {
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
  for (const size of sizes) {
    const png = await renderTilePng(size)
    fs.writeFileSync(path.join(BUILD, `icon-${size}.png`), png)
    // build/icon.png is the canonical 512 px app icon referenced by tooling.
    if (size === 512) fs.writeFileSync(path.join(BUILD, 'icon.png'), png)
  }

  const entries = []
  for (const size of [16, 24, 32, 48, 64, 128, 256]) {
    entries.push({ size, data: await renderTilePng(size) })
  }
  fs.writeFileSync(path.join(BUILD, 'icon.ico'), buildIco(entries))

  fs.writeFileSync(path.join(BUILD, 'icon-obsidian.png'), await renderTilePng(512, { inset: 0.74 }))
  fs.writeFileSync(
    path.join(BUILD, 'icon-pearl.png'),
    await sharp(Buffer.from(tileSvg(1024, { inset: 0.7, flat: '#EDE9E1' })))
      .resize(512, 512)
      .png({ compressionLevel: 9 })
      .toBuffer(),
  )
  fs.writeFileSync(
    path.join(BUILD, 'icon-gold.png'),
    await sharp(Buffer.from(tileSvg(1024, { inset: 0.7, flat: '#C9A227' })))
      .resize(512, 512)
      .png({ compressionLevel: 9 })
      .toBuffer(),
  )
}

async function writeFavicons() {
  const faviconSvg = tileSvg(64, { inset: 0.78, variant: 'small' })
  fs.writeFileSync(path.join(ASSETS, 'fluxora-favicon.svg'), faviconSvg)
  fs.writeFileSync(path.join(ASSETS, 'fluxora-favicon.png'), await renderTilePng(64))
  fs.writeFileSync(path.join(ASSETS, 'fluxora-favicon-mono.svg'), flatMarkSvg('#F6EEE2'))

  const encoded = faviconSvg
    .replace(/"/g, "'")
    .replace(/[<>#%]/g, (ch) => ({ '<': '%3C', '>': '%3E', '#': '%23', '%': '%25' })[ch])
    .replace(/\s+/g, ' ')
  fs.writeFileSync(path.join(BUILD, 'favicon-datauri.txt'), `data:image/svg+xml,${encoded}`)
}

async function main() {
  fs.mkdirSync(BUILD, { recursive: true })
  fs.mkdirSync(ASSETS, { recursive: true })
  await writeSvgs()
  await writeIcons()
  await writeFavicons()
  console.log('Fluxora brand assets regenerated:')
  console.log('  src/assets/fluxora-mark{.svg,-light,-mono,-obsidian,-white,-black}')
  console.log('  build/icon{.ico,.png} + icon-{16,24,32,48,64,128,256,512,1024}.png')
  console.log('  build/favicon-datauri.txt + src/assets/fluxora-favicon{.svg,.png,-mono.svg}')
}

main().catch((error) => {
  console.error('brand asset generation failed:', error)
  process.exit(1)
})

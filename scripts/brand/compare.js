// Side-by-side QA: reference mark crop vs. the generated mark.
//   node scripts/brand/compare.js
// Writes docs/evidence/ui/brand-compare.png for visual review.

const path = require('path')
const sharp = require('sharp')
const { buildMarkSvg } = require('./mark-svg')

const SRC = path.join(__dirname, '../../docs/brand/fluxora-reference.png')
const OUT = path.join(__dirname, '../../docs/evidence/ui')
const CELL = 420

// Hand-checked crop of the hero logo on the brand board (mark only, no copy).
const CROP = { left: 201, top: 14, width: 396, height: 382 }

async function main() {
  const reference = await sharp(SRC)
    .extract(CROP)
    .resize(CELL, CELL, { fit: 'cover' })
    .png()
    .toBuffer()

  const mine = await sharp(Buffer.from(buildMarkSvg('metallic')))
    .resize(CELL, CELL, { fit: 'contain', background: { r: 10, g: 9, b: 9, alpha: 1 } })
    .png()
    .toBuffer()

  const mineTile = await sharp({
    create: { width: CELL, height: CELL, channels: 4, background: { r: 10, g: 9, b: 9, alpha: 1 } },
  })
    .composite([{ input: mine }])
    .png()
    .toBuffer()

  const sheet = await sharp({
    create: { width: CELL * 2 + 60, height: CELL + 40, channels: 4, background: { r: 22, g: 21, b: 20, alpha: 1 } },
  })
    .composite([
      { input: reference, left: 20, top: 20 },
      { input: mineTile, left: CELL + 40, top: 20 },
    ])
    .png()
    .toFile(path.join(OUT, 'brand-compare.png'))

  console.log('wrote docs/evidence/ui/brand-compare.png', sheet.width + 'x' + sheet.height)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

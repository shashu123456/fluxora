// Fluxora mark SVG builder — renders the mark geometry as production SVG.
//
// Four variants share one geometry:
//   metallic — champagne/gunmetal on transparent, for dark surfaces (default UI)
//   light    — deeper bronze/graphite so the mark survives on light surfaces
//   small    — simplified high-contrast fill for 16–48 px icons
//   mono     — single currentColor silhouette for stamps and monochrome use
//
// No SVG filters are used: gradients and layered shapes only, so Electron's
// renderer and the raster pipeline (librsvg via sharp) agree exactly.

const G = require('./mark-geometry')

const { CENTER, SIZE, ORB_RADIUS, BLADE_LAYERS: L, rotate } = G

const PALETTE = {
  metallic: {
    metal: ['#040404', '#0E0C0A', '#262220', '#4E4740', '#8C8272', '#C9BCA0', '#F8EED6', '#D6C6A4'],
    shade: ['rgba(2,2,2,0.96)', 'rgba(6,5,4,0.6)', 'rgba(8,7,5,0)'],
    sheen: ['rgba(246,231,193,0)', 'rgba(252,240,208,0.28)', 'rgba(255,253,246,0.5)', 'rgba(246,231,193,0.1)'],
    hot: 'rgba(255,253,246,0.62)',
    rim: ['#FCEFD2', '#B98F4C'],
    bevel: 'rgba(3,2,2,0.62)',
    orb: ['#FFFFFF', '#EFE9DC', '#9E968A', '#4E4A42', '#232120', '#0A0A09'],
    orbRim: 'rgba(255,238,205,0.38)',
    orbHalo: ['rgba(4,4,4,0.94)', 'rgba(6,5,4,0.6)', 'rgba(8,6,5,0)'],
    specular: 'rgba(255,255,255,0.94)',
  },
  light: {
    metal: ['#17130F', '#2E2620', '#544839', '#82735F', '#B5A489', '#D8CBA9', '#EFE7D2', '#A2937B'],
    shade: ['rgba(0,0,0,0.8)', 'rgba(0,0,0,0.34)', 'rgba(0,0,0,0)'],
    sheen: ['rgba(255,252,242,0)', 'rgba(255,248,226,0.2)', 'rgba(255,252,244,0.55)', 'rgba(255,248,226,0.12)'],
    hot: 'rgba(255,250,232,0.55)',
    rim: ['#8A6E2E', '#3F3016'],
    bevel: 'rgba(0,0,0,0.55)',
    orb: ['#FFFFFF', '#F0E0BC', '#C4A672', '#84693F', '#42331F', '#171109'],
    orbRim: 'rgba(30,22,12,0.4)',
    orbHalo: ['rgba(255,255,255,0.9)', 'rgba(250,246,238,0.5)', 'rgba(250,246,238,0)'],
    specular: 'rgba(255,255,255,0.96)',
  },
  small: {
    metal: ['#C6B392', '#F6EDD9', '#D9C6A1'],
    orb: ['#FFFDF4', '#F3DFB4', '#B08E58'],
    rim: 'rgba(255,250,236,0.9)',
    orbRim: 'rgba(20,15,9,0.45)',
  },
}

function metalStops(p) {
  // 8 stops for the metal variants, 3 for the small variant.
  const stops = p.metal.length === 3 ? [0, 0.55, 1] : [0, 0.14, 0.34, 0.55, 0.74, 0.88, 0.97, 1]
  return p.metal.map((c, i) => `<stop offset="${stops[i]}" stop-color="${c}"/>`).join('')
}

function defs(variant) {
  if (variant === 'mono') return ''
  const p = PALETTE[variant]
  const ax = G.gradientAxis(0.52)
  const axisAttr = `gradientUnits="userSpaceOnUse" x1="${ax.x1.toFixed(2)}" y1="${ax.y1.toFixed(2)}" x2="${ax.x2.toFixed(2)}" y2="${ax.y2.toFixed(2)}"`

  if (variant === 'small') {
    return `
  <defs>
    <linearGradient id="fxBlade" ${axisAttr}>
      ${metalStops(p)}
    </linearGradient>
    <radialGradient id="fxOrb" cx="0.36" cy="0.32" r="0.72">
      <stop offset="0" stop-color="${p.orb[0]}"/>
      <stop offset="0.5" stop-color="${p.orb[1]}"/>
      <stop offset="1" stop-color="${p.orb[2]}"/>
    </radialGradient>
  </defs>`
  }

  return `
  <defs>
    <linearGradient id="fxBlade" ${axisAttr}>
      ${metalStops(p)}
    </linearGradient>
    <linearGradient id="fxBladeShade" ${axisAttr}>
      <stop offset="0" stop-color="${p.shade[0]}"/>
      <stop offset="0.42" stop-color="${p.shade[1]}"/>
      <stop offset="1" stop-color="${p.shade[2]}"/>
    </linearGradient>
    <linearGradient id="fxBladeSheen" ${axisAttr}>
      <stop offset="0" stop-color="${p.sheen[0]}"/>
      <stop offset="0.34" stop-color="${p.sheen[1]}"/>
      <stop offset="0.82" stop-color="${p.sheen[2]}"/>
      <stop offset="1" stop-color="${p.sheen[3]}"/>
    </linearGradient>
    <linearGradient id="fxBladeRim" ${axisAttr}>
      <stop offset="0" stop-color="${p.rim[1]}"/>
      <stop offset="0.55" stop-color="${p.rim[0]}"/>
      <stop offset="1" stop-color="${p.rim[1]}"/>
    </linearGradient>
    <radialGradient id="fxOrb" cx="0.35" cy="0.3" r="0.78">
      <stop offset="0" stop-color="${p.orb[0]}"/>
      <stop offset="0.16" stop-color="${p.orb[1]}"/>
      <stop offset="0.42" stop-color="${p.orb[2]}"/>
      <stop offset="0.66" stop-color="${p.orb[3]}"/>
      <stop offset="0.86" stop-color="${p.orb[4]}"/>
      <stop offset="1" stop-color="${p.orb[5]}"/>
    </radialGradient>
    <radialGradient id="fxOrbGlow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0.4" stop-color="${p.orbHalo[0]}"/>
      <stop offset="0.72" stop-color="${p.orbHalo[1]}"/>
      <stop offset="1" stop-color="${p.orbHalo[2]}"/>
    </radialGradient>
    <radialGradient id="fxSpecular" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${p.specular}"/>
      <stop offset="0.5" stop-color="rgba(255,250,238,0.5)"/>
      <stop offset="1" stop-color="rgba(255,250,238,0)"/>
    </radialGradient>
  </defs>`
}

function blade(variant) {
  if (variant === 'mono') {
    return `<path d="${L.body}" fill="currentColor"/>`
  }
  if (variant === 'small') {
    // Optical bolding: small raster sizes lose the thin taper, so the same
    // geometry is stroked to keep mass at 16–48 px.
    return `<path d="${L.body}" fill="url(#fxBlade)" stroke="url(#fxBlade)" stroke-width="14" stroke-linejoin="round"/>`
  }
  const p = PALETTE[variant]
  return `
      <path d="${L.body}" fill="url(#fxBlade)"/>
      <path d="${L.innerShade}" fill="url(#fxBladeShade)"/>
      <path d="${L.trailingLine}" fill="none" stroke="${p.bevel}" stroke-width="9" stroke-linecap="butt"/>
      <path d="${L.leadingLine}" fill="none" stroke="url(#fxBladeRim)" stroke-width="5" stroke-linecap="butt" opacity="0.85"/>`
}

function orb(variant) {
  if (variant === 'mono') {
    return `<circle cx="${CENTER}" cy="${CENTER}" r="${ORB_RADIUS}" fill="currentColor"/>`
  }
  if (variant === 'small') {
    return `<circle cx="${CENTER}" cy="${CENTER}" r="${ORB_RADIUS}" fill="url(#fxOrb)"/>
      <circle cx="${CENTER}" cy="${CENTER}" r="${ORB_RADIUS}" fill="none" stroke="${PALETTE.small.orbRim}" stroke-width="5"/>`
  }
  const p = PALETTE[variant]
  return `
      <circle cx="${CENTER}" cy="${CENTER}" r="${(ORB_RADIUS * 1.7).toFixed(2)}" fill="url(#fxOrbGlow)"/>
      <circle cx="${CENTER}" cy="${CENTER}" r="${ORB_RADIUS.toFixed(2)}" fill="url(#fxOrb)"/>
      <circle cx="${CENTER}" cy="${CENTER}" r="${ORB_RADIUS.toFixed(2)}" fill="none" stroke="${p.orbRim}" stroke-width="4"/>
      <ellipse cx="${(CENTER - ORB_RADIUS * 0.32).toFixed(2)}" cy="${(CENTER - ORB_RADIUS * 0.38).toFixed(2)}"
        rx="${(ORB_RADIUS * 0.3).toFixed(2)}" ry="${(ORB_RADIUS * 0.22).toFixed(2)}"
        fill="url(#fxSpecular)" opacity="0.95"/>`
}

function markGroup(variant) {
  return `
    <g>
      ${[0, 120, 240].map((deg) => `<g transform="${rotate(deg)}">${blade(variant)}</g>`).join('')}
      ${orb(variant)}
    </g>`
}

function buildMarkSvg(variant = 'metallic', opts = {}) {
  const { size = SIZE } = opts
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${size}" height="${size}" role="img" aria-label="Fluxora">${defs(variant)}${markGroup(variant)}
</svg>
`
}

module.exports = { buildMarkSvg, PALETTE, ORB_RADIUS, CENTER, SIZE }

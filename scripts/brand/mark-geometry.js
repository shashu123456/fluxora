// Fluxora mark geometry — single source of truth.
//
// The reference (docs/brand/fluxora-reference.png) is a three-blade vortex:
// three identical tapered blades at 120° rotational symmetry, sweeping
// clockwise from a thin root at the hub out to a needle-sharp tip on the mark's
// outer circle, around a polished metallic orb.
//
// Everything here is computed, not hand-waved: the blade outline is the region
// between two offset curves of a spiral centreline, so the taper, sweep and
// width profile are explicit parameters. scripts/fluxora-icon.js rasterises
// this same geometry, which keeps the app mark, favicon, installer icon and
// window icon identical by construction.
//
// Coordinate space: 1024 x 1024, centre (512, 512), outer radius 470.

const SIZE = 1024
const CENTER = SIZE / 2
const R_OUTER = 470

// Blade parameters (tuned against the reference image).
const BLADE = {
  // Radius where the blade root meets the hub, as a fraction of R_OUTER.
  rootRadius: 0.3,
  // Clockwise sweep from root to tip, in radians (SVG y-down => positive is clockwise).
  sweep: 2.34,
  // Radius growth exponent: >1 keeps the root thin before accelerating outward.
  radiusExponent: 1.35,
  // Angular easing: >1 makes the root hug the hub and the tip accelerate.
  angleExponent: 1.18,
  // Maximum blade half-width, as a fraction of R_OUTER.
  maxWidth: 0.28,
  // Width profile exponents (rise from the root, fall into the tip).
  widthRiseExponent: 1.05,
  widthFallExponent: 1.9,
  // Asymmetry: the leading edge is fuller than the trailing edge.
  leadingScale: 1.0,
  trailingScale: 0.45,
  // Orb radius, as a fraction of R_OUTER.
  orbRadius: 0.145,
}

function widthProfile(t, maxWidth) {
  // Sharp at both ends, widest around t ~ 0.53.
  const raw = Math.pow(t, BLADE.widthRiseExponent) * Math.pow(1 - t, BLADE.widthFallExponent)
  return raw * maxWidth
}

// Normalise the width profile so its peak equals BLADE.maxWidth exactly.
const peakWidth = (() => {
  let peak = 0
  for (let i = 0; i <= 2000; i++) {
    const t = i / 2000
    peak = Math.max(peak, Math.pow(t, BLADE.widthRiseExponent) * Math.pow(1 - t, BLADE.widthFallExponent))
  }
  return peak
})()

function point(t) {
  const r = (BLADE.rootRadius + (1 - BLADE.rootRadius) * Math.pow(t, BLADE.radiusExponent)) * R_OUTER
  const phi = BLADE.sweep * Math.pow(t, BLADE.angleExponent)
  return [Math.cos(phi) * r, Math.sin(phi) * r]
}

function normal(t) {
  const h = 1e-4
  const a = point(Math.max(0, t - h))
  const b = point(Math.min(1, t + h))
  const tx = b[0] - a[0]
  const ty = b[1] - a[1]
  const len = Math.hypot(tx, ty) || 1
  // Rotate the tangent +90° so +normal points to the leading (outer, convex) edge.
  return [-ty / len, tx / len]
}

function width(t) {
  return (widthProfile(t, 1) / peakWidth) * BLADE.maxWidth * R_OUTER
}

/**
 * Closed outline between two offsets of the centreline.
 * `inner` / `outer` are multiples of the local half-width:
 *   -1..1 spans trailing -> leading edge.
 */
function edgePath(inner, outer, samples = 92) {
  const leading = []
  const trailing = []
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const [px, py] = point(t)
    const [nx, ny] = normal(t)
    const w = width(t)
    leading.push([px + nx * w * outer, py + ny * w * outer])
    trailing.push([px + nx * w * inner, py + ny * w * inner])
  }
  const ring = leading.concat(trailing.reverse())
  const d = ring
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${(CENTER + x).toFixed(2)},${(CENTER + y).toFixed(2)}`)
    .join(' ')
  return `${d} Z`
}

/** Open path that follows one edge only (used for rim light and bevel strokes). */
function edgeLine(offset, samples = 92) {
  const pts = []
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const [px, py] = point(t)
    const [nx, ny] = normal(t)
    const w = width(t)
    pts.push([px + nx * w * offset, py + ny * w * offset])
  }
  return pts
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${(CENTER + x).toFixed(2)},${(CENTER + y).toFixed(2)}`)
    .join(' ')
}

// Blade layer definitions, shared by every renderer.
const BLADE_LAYERS = {
  body: edgePath(-BLADE.trailingScale, BLADE.leadingScale),
  // Dark occlusion down the trailing edge.
  innerShade: edgePath(-BLADE.trailingScale, -0.08),
  // Specular ribbon along the leading edge.
  sheen: edgePath(0.42, 0.94),
  // Tight hot line right at the leading edge.
  hotEdge: edgePath(0.86, 1.0),
  leadingLine: edgeLine(BLADE.leadingScale),
  trailingLine: edgeLine(-BLADE.trailingScale),
  centreLine: edgeLine(0.18),
}

function rotate(deg) {
  return `rotate(${deg} ${CENTER} ${CENTER})`
}

/**
 * Cross-blade gradient axis in unrotated user space: from the trailing edge to
 * the leading edge at parameter t. Used with gradientUnits="userSpaceOnUse"
 * inside the rotated blade group, so every blade is shaded across its own
 * width instead of across its bounding box.
 */
function gradientAxis(t = 0.52) {
  const [px, py] = point(t)
  const [nx, ny] = normal(t)
  const w = width(t)
  return {
    x1: CENTER + px + nx * w * -BLADE.trailingScale,
    y1: CENTER + py + ny * w * -BLADE.trailingScale,
    x2: CENTER + px + nx * w * BLADE.leadingScale,
    y2: CENTER + py + ny * w * BLADE.leadingScale,
  }
}

module.exports = {
  SIZE,
  CENTER,
  R_OUTER,
  BLADE,
  BLADE_LAYERS,
  ORB_RADIUS: BLADE.orbRadius * R_OUTER,
  rotate,
  point,
  width,
  gradientAxis,
}

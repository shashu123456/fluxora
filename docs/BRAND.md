# Fluxora Brand System

Canonical brand reference for the desktop app, packaging assets, and docs.
One geometry source, one palette, one regeneration command.

## 1. Reference

- Source image: `docs/brand/fluxora-reference.png` (1536 × 1024, committed for traceability)
- Original location: `C:\Users\kavitha\OneDrive\Desktop\fluxora.png`
- The reference is a rendered 3D brand board. The shipped mark is its flat-vector
  reduction: same silhouette, symmetry, taper, and palette — not a coloured copy of
  an older mark.

### What the reference establishes

| Property | Measured / observed |
|---|---|
| Construction | Three identical blades, 120° rotational symmetry, clockwise sweep |
| Blade profile | Thin root at the hub → widest around mid-length → needle-sharp tip on the outer circle |
| Hub | Polished metal orb, darker than the blades, seated in the negative space |
| Negative space | Three curved slivers between the blades; the gaps are as deliberate as the blades |
| Material | Chrome/gunmetal body, warm champagne specular on the leading edge |
| Wordmark | `FLUXORA` in wide-tracked light caps, mark centred above it |
| Tagline | Small caps, very wide tracking, muted warm grey |
| Backgrounds | Near-black obsidian; the mark is never placed on blue-grey |

### Extracted palette

Sampled from the reference's hero panel, grouped by luminance band:

| Token | Value | Use |
|---|---|---|
| Obsidian | `#0B0B0A` | App background, icon tile |
| Deep shadow | `#393029` | Metal shadow, separators |
| Gunmetal mid | `#A08F80` | Metal body |
| Champagne highlight | `#F6EEE2` | Specular, wordmark, mono mark |
| Gold | `#D9BD84` | Accents, focus, active nav |
| Gold deep | `#A8833F` | Gradient floor, hairlines |

Dark UI surfaces are warm-neutral (`hue 30`, low saturation), never the legacy
blue-grey (`hue 228`) that predated this brand pass.

## 2. The mark

Generated, never hand-drawn:

- `scripts/brand/mark-geometry.js` — blade spiral, width profile, offsets, orb radius
- `scripts/brand/mark-svg.js` — shading layers and variants
- `scripts/brand/generate-assets.js` — writes every SVG, PNG, ICO and favicon

The blade outline is the region between two offset curves of a spiral centreline,
so sweep, taper, asymmetry and hub gap are explicit numbers. Changing one number
updates the app mark, favicon, window icon, installer icon and store art together.

### Variants

| Variant | Asset | Use |
|---|---|---|
| `metallic` | `src/assets/fluxora-mark.svg` | Default; dark surfaces at ≥ 41 px |
| `small` | `src/assets/fluxora-mark-small.svg` | 16–40 px; optically bolded so the taper survives |
| `light` | `src/assets/fluxora-mark-light.svg` | Light surfaces |
| `mono` | `src/assets/fluxora-mark-mono.svg` | `currentColor` via CSS mask; stamps, disabled UI |

`FluxoraMark` picks `small` automatically at ≤ 40 px.

### Clear space and sizing

- Clear space: at least 25 % of the mark's height on every side.
- Minimum sizes: 16 px icon (tile), 20 px inline in UI chrome, 24 px standalone.
- Never stretch, rotate beyond the built-in 120° symmetry, recolour outside the
  palette, or place the metallic mark on a light surface — use `light` or `mono`.

### Small-size behaviour

| Size | Behaviour |
|---|---|
| 256 / 128 | Full metal gradients, orb specular readable |
| 64 / 48 | Gradients hold; blades separate cleanly |
| 32 | Optically bolded variant; reads as a three-blade pinwheel |
| 24 | Blades remain distinct; gaps soften |
| 16 | Abstract pinwheel (matches the reference's own 16 px behaviour) |

## 3. Icon and packaging assets

| Asset | Notes |
|---|---|
| `build/icon.ico` | Multi-size 16/24/32/48/64/128/256, PNG-compressed entries |
| `build/icon.png`, `build/icon-{16…1024}.png` | App, taskbar, About, store art |
| `build/icon-obsidian.png`, `icon-pearl.png`, `icon-gold.png` | Edition tiles from the reference board |
| `src/assets/fluxora-favicon.svg/.png`, `fluxora-favicon-mono.svg` | Renderer favicon |
| `build/favicon-datauri.txt` | Data-URI fallback for tooling |

`electron-builder.json` consumes `build/icon.ico`; `electron/main.ts` uses the same
file for the window icon when it exists.

## 4. Regeneration

```powershell
node scripts/brand/generate-assets.js
```

Deterministic: no timestamps or random ids are written, so two consecutive runs
produce byte-identical files. Verified by hashing `build/icon.ico`,
`build/icon.png`, `build/icon-16.png`, `build/icon-512.png` and
`src/assets/fluxora-mark.svg` across two runs.

Quality-control renders (not shipped):

```powershell
node scripts/brand/preview.js    # dark/light/mono/tile + 256→16 px ladder
node scripts/brand/compare.js    # reference crop beside the generated mark
```

Both write to `docs/evidence/ui/`.

## 5. Typography

The reference board specifies Inter. The application already ships Manrope (body)
and Sora (display) through `@fontsource`, so those remain the brand typefaces to
avoid adding a third family for the release gate. Wordmark treatment is caps with
`0.22em`–`0.28em` tracking, weight 500–600.

## 6. Do / Don't

| Do | Don't |
|---|---|
| Use `FluxoraMark` / `FluxoraLockup` | Inline the SVG geometry by hand |
| Keep the mark on obsidian or the `light`/`mono` variants for light surfaces | Recolour the metal to another hue |
| Regenerate icons with the script | Hand-edit `build/*.png` or `icon.ico` |
| Keep ≥ 25 % clear space | Crowd the mark against text or edges |
| Use the champagne/obsidian palette | Reintroduce blue-grey surfaces |

## 7. Known limitations

- The reference is a physically-based 3D render; the shipped mark is a flat-vector
  interpretation. Blade-on-blade reflections and depth of field are approximated
  with gradients, not reproduced.
- The brand board's `FLUXORA` uses Inter; the app uses Manrope/Sora (see §5).

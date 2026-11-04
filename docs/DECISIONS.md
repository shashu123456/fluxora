# Decisions

Ambiguous calls made during this work, with the reasoning and the alternative that
was rejected. Append-only.

---

## D-01 — Brand mark is generated geometry, not a traced bitmap

**Context.** The brief requires matching the reference's form, weight, curvature and
balance, and forbids merely recolouring the existing mark.

**Decision.** Rebuild the mark as parametric geometry: a spiral centreline per blade,
a width profile along it, three blades at 120°, and a hub orb. Emit SVG from that
description.

**Why.** A trace produces a one-off path that cannot be re-tuned or re-rendered at
other sizes, and the reference is a 3D render whose edges are shaded rather than
crisp. Named parameters (`sweep`, `radiusExponent`, `maxWidth`, `widthRise/Fall`,
`orbRadius`) let the shape be corrected numerically across review iterations instead
of nudging anchors by hand.

**Rejected.** Autotrace of the reference bitmap: no control, poor small-size output.

---

## D-02 — Gradients only; no SVG filters

**Context.** The reference is a physically-based render with specular highlights and
depth of field.

**Decision.** Approximate material with layered gradients in `gradientUnits="userSpaceOnUse"`,
plus rim/bevel strokes. No `feGaussianBlur`, `feSpecularLighting` or filter chains.

**Why.** The icon pipeline rasterises through librsvg (via `sharp`) while the app
renders through Chromium. Filters in that overlap are inconsistently supported and
would make the installer icon differ from the in-app mark.

**Rejected.** Filter-based specular; screen-space blur for the glow.

---

## D-03 — Deterministic, checked-in assets

**Decision.** `scripts/brand/generate-assets.js` writes every SVG/PNG/ICO/favicon and
is committed alongside its outputs. No timestamps or random IDs. ICO is assembled by
hand (PNG-compressed entries at 7 sizes) rather than via a dependency.

**Why.** Regeneration must be reviewable and diffable; "run this and hope" is not a
brand system. Verified by hashing outputs across two consecutive runs (identical).

**Rejected.** Generating icons at build time only (invisible to review, breaks on
tool upgrade); adding `png-to-ico`/`to-ico` as a dependency for one file.

---

## D-04 — `small` mark variant selected by size, thresholds in one place

**Decision.** `FluxoraMark` switches to the optically bolded `small` variant at
≤ 40 px; tiles at ≤ 24 px additionally get a 0.6 inset.

**Why.** At 32 px the fine taper closes up and blades fuse near the hub. The
threshold lives in one constant (`SMALL_MARK_MAX`) so call sites never choose
variants ad hoc.

**Trade-off.** Two geometry variants to maintain. Accepted: the alternative is one
mark that is either mushy at 16 px or heavy at 256 px.

---

## D-05 — Reference palette adopted; blue-grey removed from dark surfaces

**Decision.** Dark tokens re-hued from `228` to `30` (warm obsidian) at the **same
lightness**, so contrast and spacing metrics stay valid while the temperature
matches the reference.

**Why.** Holding lightness constant isolates the brand change from a contrast change
— measured ratios improved only slightly (muted 6.90 → 7.81) and never regressed.

**Rejected.** Re-picking lightness per surface: would have forced a full contrast
re-audit and produced visual drift beyond the brand pass.

---

## D-06 — `--fx-gold` kept as the accent name

**Decision.** Keep the existing `--fx-gold*` token names even though the family now
spans champagne → deep bronze.

**Why.** Renaming tokens would touch every component and inflate the diff for zero
user-visible gain, and would collide with the "no refactor" constraint of this pass.

---

## D-07 — Preference for removing duplicated copy over inventing new copy

**Context.** Mission Control repeated the brand ("Fluxora" title, "GOOD EVENING"
eyebrow, "Welcome to Fluxora" card, under an existing "GOOD EVENING" caption).

**Decision.** The `h1` falls back to the page's own name ("Mission Control") and the
card's duplicate eyebrow is dropped. No new marketing copy was written.

**Why.** The page already names itself in the title bar and sidebar; a workspace
name is meaningful in the `h1`, the brand name is not. Deleting the duplicate is a
smaller, safer change than authoring new strings.

---

## D-08 — "Before" evidence rebuilt from a side worktree

**Context.** A genuine before/after comparison was required, but the pre-brand
renderer no longer existed in the working tree.

**Decision.** Add `CAPTURE_PREFIX` to the harness, check out `7402cb1` into
`.before-worktree`, junction the existing `node_modules` (no second install), build,
swap `dist/`, capture as `before-*`, then restore.

**Why.** Real screenshots of the actual previous build beat mock-ups, and the
junction avoids a multi-minute reinstall inside this session.

**Caveat.** Electron's main process was the current one while capturing the
baseline, so `before-*` images carry the new window background colour. The renderer
— where every reviewed finding lives — is the old build.

---

## D-09 — Packaging stays unsigned and is labelled BLOCKED

**Decision.** Do not self-sign, do not fabricate a certificate, do not rename
`package.json`/`aiworkspace.db`/the app-data directory to dodge warnings. Build and
document every artifact as `NotSigned`.

**Why.** The brief forbids faking signing; a self-signed cert produces the same
SmartScreen warning while implying a trust chain that does not exist.

---

## D-10 — Mark never appears as a large background watermark

**Context.** The Chat empty state used the tiled mark at 520 px / 6 % opacity; after
the tile was rebuilt it rendered as a dark rounded rectangle with a cropped corner.
An untiled mono watermark was tried and read as a grey smudge.

**Decision.** Remove the watermark. Brand presence on that screen comes from the
34 px mark tile.

**Why.** A watermark must be legible as an object or invisible; at 520 px it was
neither. The reference board itself never uses the mark as a texture.

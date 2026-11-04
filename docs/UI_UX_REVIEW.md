# UI/UX Review

Scope: visual consistency, spacing, hierarchy, brand coherence, contrast and focus
visibility across every primary screen of the desktop app.

Constraint honoured: **no functional, behavioural or IPC changes.** Every edit in
this pass is presentation only (class names, tokens, copy that duplicated itself,
and one asset swap). No feature was added, removed, or rewired.

## 1. Method

Evidence was captured from the **real Electron app**, not a browser mock:

- Harness: `scripts/review/capture.js` launches the packaged-style build with a
  throwaway `--user-data-dir`, attaches over the Chrome DevTools Protocol, drives
  the app with its own `Ctrl+1…0` shortcuts, and writes full-window PNGs.
- Baseline (`before-*.png`) was produced by building commit `7402cb1` (pre-brand)
  in a side worktree and capturing with `CAPTURE_PREFIX=before`.
- Current (`after-*.png`) is the same harness against this branch.
- Both sets are 1440 × 900, same screen, same empty-state data.

Screens covered (all 11): Mission Control, Chat, Search, Workspace, Memory,
Prompts, Visualizations, Usage, Settings, Profile, command palette.

## 2. Findings and fixes

| # | Screen | Finding | Severity | Fix |
|---|---|---|---|---|
| 1 | All | Surfaces were blue-grey (`hue 228`) against a warm obsidian brand | High | Dark tokens re-hued to warm neutral (`hue 30`) at identical lightness (see `docs/DECISIONS.md` D-07) |
| 2 | All | The mark read as a thin gold `S`, not the reference's three-blade vortex | High | Mark rebuilt from computed geometry; see `docs/BRAND.md` |
| 3 | Chat | Empty state drew the **tiled** mark at 520 px and 6 % opacity — a large dark rounded rectangle with a cropped corner, reading as a smudge | High | Watermark removed; the empty state is now mark-tile + headline only |
| 4 | Mission Control | Brand headline repeated three times: page title "Fluxora", card eyebrow "GOOD EVENING", card title "Welcome to Fluxora", under an already-present "GOOD EVENING" caption | Medium | Page `h1` falls back to "Mission Control"; duplicated card eyebrow removed. One greeting, one headline |
| 5 | Settings | Full-width gold "Add Provider" dominated a form it only submits | Medium | Button is now content-width and sits beside "Test connection" |
| 6 | Settings | "Test connection" stretched full-width (`flex-1`) next to the now-compact button | Low | Same treatment; the pair wraps instead of stretching |
| 7 | All | Mark at 16–40 px lost its taper; blades fused near the hub | Medium | New `small` variant with optical bolding and extra inset ≤ 24 px, auto-selected by `FluxoraMark` |
| 8 | All | Favicon was a 10 KB inline data URI inside `index.html` | Low | Served from `src/assets/fluxora-favicon.svg` |

Deliberately **not** changed:

- **Repeated primary action** (Memory, Prompts: header button *and* empty-state
  button). Both routes perform the same action; the header keeps its permanent
  affordance while the empty state offers it in context. Removing either would
  remove a control, which this pass may not do.
- **Empty states with generous whitespace.** The void is intentional on a
  desktop tool with 900 px of vertical space; shrinking it would crowd the
  hierarchy rather than improve it.

## 3. Contrast (measured)

Ratios computed from the resolved HSL tokens with the WCAG relative-luminance
formula (not eyeballed):

| Pair | Before | After | Requirement |
|---|---|---|---|
| Foreground on background | — | **16.76 : 1** | AA 4.5, AAA 7 |
| Muted foreground on background | 6.90 : 1 | **7.81 : 1** | AA 4.5, AAA 7 |
| Muted foreground on card | — | **7.55 : 1** | AA 4.5 |
| Gold (`--fx-gold`) on background | — | **9.79 : 1** | AA 4.5 |
| Border on background | — | 1.53 : 1 | 3 : 1 for non-text *if* it is the only boundary |

All text pairs clear AAA. The border token at 1.53 : 1 is below the 3 : 1
non-text threshold, so field boundaries are **not** carried by the border alone:
fields sit on a distinct `--muted`/`--card` fill and every control has a
`focus-visible` ring in gold (9.79 : 1). This matches the upstream shadcn
defaults; recorded here rather than silently claimed as full 1.4.11 compliance.

## 4. Hierarchy and consistency

Applied across screens, verified in the after set:

- One page-header pattern: eyebrow (gold, tracked caps) → title → one-line
  description. Consistent on Mission Control, Memory, Usage, Profile, Prompts.
- One primary-action position per page (header right), one per empty state.
- Sidebar: constant 13 px nav labels, gold active pill with a left indicator,
  shortcut chips (`Ctrl 1`…) right-aligned and muted.
- Type scale: Sora for display titles, Manrope for body; no third family added.

## 5. Evidence

| File | Shows |
|---|---|
| `docs/evidence/ui/before-*.png` (11) | Pre-brand baseline from `7402cb1` |
| `docs/evidence/ui/after-*.png` (11) | Current build after this pass |
| `docs/evidence/ui/brand-preview.png` | Mark variants, dark/light/mono + 256→16 px ladder |
| `docs/evidence/ui/brand-compare.png` | Reference crop beside generated mark |
| `docs/evidence/ui/capture.log` | Harness output for the current set |

## 6. Not verified

- **Light theme screenshots.** Light tokens were updated (`hue 42/38/40`) and
  typecheck/build pass, but the light theme was not captured or contrast-audited
  in this pass — the app opens in dark. `NOT VERIFIED`.
- **Windows high-contrast / forced-colours mode.** `NOT VERIFIED`.
- **Screen-reader traversal order.** Focus rings and accessible names are present
  in markup; no assistive-technology session was run. `NOT VERIFIED`.
- **Reduced-motion behaviour.** `fx-enter`/transition tokens exist; no
  `prefers-reduced-motion` capture was performed. `NOT VERIFIED`.

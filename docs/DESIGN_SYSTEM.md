# Fluxora Design System

Source of truth for Fluxora's visual language: **Black Obsidian + Champagne Gold** (FLUX VORTEX v2). All tokens live in `src/index.css`; Tailwind mappings in `tailwind.config.js`.

## Brand

- **Mark**: FLUX VORTEX v2 — four tapered liquid-titanium blades around a champagne-gold floating orb. Generator: `scripts/fluxora-icon.js` (idempotent, zero deps) → regenerates every asset on re-run.
- **Wordmark**: class `fx-wordmark` — Sora 600, letter-spacing `0.22em`, champagne gradient text.
- **Voice**: precise, premium, quiet. No playful copy in system surfaces.

## Color

### Semantic tokens (shadcn-style, HSL triples)

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `--background` | `42 55% 96%` | `228 26% 4%` | Page canvas |
| `--foreground` | `38 30% 14%` | `40 18% 92%` | Primary text |
| `--card` | `40 40% 99%` | `227 28% 6%` | Surfaces |
| `--primary` | `36 55% 44%` | `40 56% 56%` | Gold actions |
| `--muted` / `--muted-foreground` | `40 30% 91%` / `38 12% 44%` | `227 24% 10%` / `40 12% 62%` | De-emphasis |
| `--border` / `--input` | `38 24% 86%` | `40 18% 18%` | Hairlines |
| `--destructive` | `0 72% 50%` | `0 68% 48%` | Errors only |
| `--sidebar` | `40 36% 95%` | `228 33% 4%` | Nav rail |

### Champagne palette (`fx-*`)

| Token | Light | Dark | Tailwind |
|---|---|---|---|
| `--fx-gold` | `40 56% 62%` | `40 60% 62%` | `text-fx-gold`, `bg-fx-gold` |
| `--fx-gold-bright` | `42 72% 76%` | `42 72% 76%` | `text-fx-gold-bright` |
| `--fx-gold-deep` | `36 45% 42%` | `36 48% 50%` | `text-fx-gold-deep` |
| `--fx-champagne` | `40 72% 82%` | `40 70% 84%` | `text-fx-champagne` |
| `--fx-glow` | `40 60% 56%` | `40 62% 58%` | (CSS only) |

Rules:

- Gold is an **accent**, never a large fill. Use it for focus, active state, and brand moments.
- Opacity recipe for gold surfaces: `hsl(var(--fx-gold) / 0.10–0.16)`.
- Dark is the default theme; light must never lose contrast on gold text (`--primary-foreground` flips accordingly).
- Destructive red stays reserved for failures — do not rebrand errors gold.

## Typography

| Role | Family | Usage |
|---|---|---|
| Display | **Sora** (`h1–h4`, `.font-display`) | Headings, wordmark; letter-spacing `-0.01em` |
| Body | **Manrope** (default) | UI, prose; letter-spacing `0.01em`, font-features `rlig/calt/ss01/cv05` |

- Base scale: 12px captions / 13–14px UI / 16–18px section titles / 20px+ page titles.
- Uppercase micro-labels: class `fx-caption` (10px, 600, tracking `0.12em`).
- Numerals in lists/stats: `tabular-nums`.

## Spacing & shape

- Radius scale derives from `--radius: 0.85rem` (lg/md/sm via Tailwind).
- Card padding: 16px (compact `px-4 py-3`); page padding: 24px (`p-6`).
- Dense lists use hairline separators (`border-border/60`), not heavy dividers.
- Scrollbars: 8px, transparent track, gold thumb on hover.

## Components

### Utility classes (`src/index.css`)

| Class | Purpose |
|---|---|
| `fx-aurora` | Ambient champagne radial-gradient page background (app root) |
| `fx-surface` / `fx-glass` | Layered premium panel / blurred translucent overlay |
| `fx-card` + `fx-hover-lift` | Standard card; hover lifts 1px with gold border glow |
| `fx-focus-gold` | Focus-within: gold border ring (`0 0 0 3px / 0.16`) |
| `fx-nav-item[data-active]` | Active nav: gold inset rail + dot + gradient wash |
| `fx-gradient-text` | Champagne gradient headline text |
| `fx-glow` / `fx-glow-soft` | Brand glow shadows for accent surfaces |
| `fx-divider-gradient` | 1px gold→champagne→transparent hairline |
| `fx-border-gradient` | Gradient border frame (padding-box/border-box trick) |
| `fx-composer-surface` | Chat composer glass panel |
| `fx-message-enter` | `fade-in 0.22s ease-out` message entrance |
| `fx-label` | Compact inline caption style (uppercase tracking, no padding) |
| `fx-row` | Hairline row with subtle hover treatment |
| `fx-reveal` | Staggered page entrance animation (`fx-reveal 0.28s`) |
| `fx-elevated` | Premium layered shadow for floating surfaces |

### Building blocks

- Primitives are shadcn/ui-style under `src/components/ui/` (Button, Card, Tabs, Dialog, Badge, …). Prefer them over bespoke markup.
- Icons: `lucide-react`, 16–18px in UI, gold-tinted only for primary/brand actions.
- Brand mark component: `src/components/brand/FluxoraMark.tsx` (size prop, never inline SVG manually).

## Motion

Tailwind animations (config): `fade-in`, `slide-in-up`, `glow-pulse` (2.6s), `drift` (6s), `shimmer` (2.4s), `stream-pulse` (1.2s LLM streaming).

- Interactive transitions: `0.15s ease` transforms, `0.2s ease` color/border.
- Respect reduced-motion: keep entrance animations ≤ 280ms, disable reveal/row animations when `prefers-reduced-motion: reduce`, no infinite motion except streaming/glow indicators.

## Layout conventions

- Frameless window: titlebar is `.app-drag`; every interactive region inside must carry `.app-no-drag`.
- App shell: `Sidebar` (248px / 48px collapsed) + `TitleBar` + `main` (`flex-1 overflow-hidden`).
- Views manage their own scroll (`ScrollArea` or `overflow-y-auto`); the shell never scrolls.
- Views are switched via `useUIStore().activeTab` (no router); lazy-loaded from `AppLayout.tsx`.

## Accessibility

- Minimum contrast: 4.5:1 body, 3:1 large text; gold on obsidian passes at display sizes — for body text use `--foreground`.
- Focus visible everywhere via `fx-focus-gold` / `ring`.
- Icon-only buttons require `aria-label` (see `RailButton` in `Sidebar.tsx`).
- Selection highlight: `hsl(var(--fx-gold) / 0.32)`.

## Do / Don't

- **Do** use `fx-card` + `fx-hover-lift` for interactive panels.
- **Do** keep new screens on `fx-aurora` background with 24px padding.
- **Don't** introduce hues outside champagne gold, obsidian blues, and semantic red/green.
- **Don't** hardcode hex colors in components — use `fx-*`/semantic tokens so theming keeps working.
- **Don't** add a second display font; Sora + Manrope only.

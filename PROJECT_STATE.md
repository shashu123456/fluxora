# PROJECT_STATE.md

## Completed Work

- [✓] Evolution milestone — Mission Control (workspace-first), Project Brain reasoning, Smart Context relevance scoring, Universal Search tokenized scoring + workspace boost, Coding Agent charter flow (11 stages with approval gate), premium design primitives (`.fx-label`, `.fx-row`, `.fx-reveal`, `.fx-elevated`).
- [✓] Workspace Intelligence engine — modular, reusable, independently testable analyzers:
  - [✓] `src/types/workspaceIntelligence.ts` — shared type contract (Profile, Health, Complexity, Development Insights, Repository, Risk Engine, `ScoredMetric { score, reasons }`).
  - [✓] `electron/services/intelligence/*.ts` — profile, health (8 dimensions), complexity, repo insights, risk engine, summary generator.
  - [✓] `electron/services/workspaceIntelligence.ts` — orchestrator with file cache (`.fluxora-intel/workspace-intel.json`) + `workspace_intelligence` DB table; invalidates when the index changes.
  - [✓] `tests/intelligence/analyzers.test.ts` — 21 tests over every analyzer.
- [✓] Intelligence Integration milestone — one intelligence layer reused everywhere:
  - [✓] `src/lib/intelligence/recommendations.ts` — deterministic recommendations, each with `why`, priority, impact, severity.
  - [✓] `src/lib/intelligence/evolution.ts` — Observation → Reasoning → Insight → Recommendation → Learning chain.
  - [✓] `src/lib/intelligence/timeline.ts` — intelligence diffs (indexed, health, risk, architecture, documentation, dependencies, repository, recommendation, learning) with stable event ids.
  - [✓] `src/lib/intelligence/ranking.ts` — intelligence-aware ranking boosts (health, architecture, repo activity, risk queries, brain importance).
  - [✓] `electron/services/intelligenceTimeline.ts` — `workspace_intelligence_timeline` table + record/list.
  - [✓] `electron/services/intelligenceEvolution.ts` — writes evolution steps into Project Brain (`source: 'intelligence'`); orchestrator evolves on every rebuild.
  - [✓] IPC `intelligence:get|rebuild|recommendations|timeline|evolve` + preload + typed `window.api.intelligence`.
  - [✓] `src/stores/intelligenceStore.ts` — single renderer owner of intelligence, recommendations and timeline (cache-first, in-process derivation).
  - [✓] Smart Context (`src/lib/contextBuilder.ts`) — intelligence-driven project context: summary, architecture, stack, relevant health dimensions, risks with reasons, repo state, complexity, missing docs/config, recommended next steps; heuristic fallback retained.
  - [✓] Mission Control (`src/components/home/DashboardView.tsx`) — operating center: health dial, signal strip, what to work on (with why), where risk lives, continue, health/architecture/project shape, intelligence changes, deep links.
  - [✓] Living intelligence panel (`src/components/workspace/WorkspaceIntelligence.tsx`) — expandable health/risk reasons, recommendations with why, evolution chain, strengths/weaknesses, timeline, provenance.
  - [✓] Coding Agent (`src/components/workspace/AgentWorkflow.tsx`) — Observe now reads architecture, health, complexity, top risks, docs/AI readiness and recommended focus, and the planning prompt adapts to them.
  - [✓] Universal Search (`electron/ipc/search.ts`) — results boosted by per-workspace intelligence and brain importance.
  - [✓] `src/components/visualizations/VisualizationsView.tsx` — "Intelligence" tab: health trend, architecture overview, project evolution, recent changes, repository activity.
  - [✓] `src/stores/workspaceStore.ts` — removed duplicate intelligence cache; invalidates `intelligenceStore` on index/delete.
  - [✓] `tests/intelligence/engines.test.ts` — 15 tests across recommendations, evolution, timeline and ranking.
- [✓] Premium Product Experience milestone — one unified design language across every surface:
  - [✓] Design language (`src/index.css`, `tailwind.config.js`) — motion tokens (`--fx-ease`, `--fx-ease-spring`, `--fx-dur-1..4`), elevation tokens (`--fx-shadow-soft/lift/float`), typography (`fx-display`, `fx-title`, `fx-heading`, `fx-prose-lead`, `fx-meta`, `fx-eyebrow`), page rhythm (`fx-page`, `fx-page-inner`, `fx-page-header`, `fx-section`, `fx-hairline`), surfaces (`fx-panel`, `fx-panel-quiet`, `fx-inset`), motion (`fx-enter`, `fx-enter-scale`, `fx-fade`, `fx-view-enter`, `fx-stagger`, `fx-press`), states (`fx-skeleton`, `fx-empty`, `fx-kbd`, `fx-chip`, `fx-caret`), global gold focus ring and full reduced-motion coverage.
  - [✓] Primitives (`src/components/ui/*`) — button (new `soft` variant, press feedback, gold focus), input, textarea, tabs, dialog, skeleton (shimmer), tooltip, card, dropdown menu, badge.
  - [✓] App shell — TitleBar rewritten (page breadcrumb, command trigger with mod+K, window controls); Sidebar rewritten (FluxoraLockup, tooltips, gold active states, shortcut chips, integrated chat list); AppLayout (skip link, Ctrl+B, palette store state, document title, keyed view transitions, branded loading fallback).
  - [✓] Command palette — dialog semantics, sticky groups, gold active inset, keyboard-chip footer, branded empty state and loading shimmer (Raycast-level polish).
  - [✓] `src/components/layout/PageHeader.tsx` — `PageHeader` / `PageShell` applied to Memory, Usage, Prompts, Visualizations and Settings for one consistent page identity.
  - [✓] Search rewritten as instant search (focused query surface, grouped results, branded empty states); Chat branded empty state, gold streaming caret and refined composer; Workspace toolbar/empty state unified; Mission Control and Workspace Intelligence already aligned.
  - [✓] Branding integrated through `FluxoraMark` / `FluxoraLockup` (sidebar, title bar, chat, palette, empty states, About); splash window already premium.
- [✓] Project Helios — Personal AI Operating System (local-first developer learning layer):
  - [✓] `src/types/developer.ts` — shared contract: `LearningEvent`, `DeveloperProfile`, `DeveloperInsight`, `WorkSession`, `SessionBriefing`, `PersonalizationProfile`, `RecommendationAffinity`.
  - [✓] Storage — `developer_events` + `work_sessions` tables and indexes in `electron/database/index.ts`.
  - [✓] `electron/services/developer/events.ts` — append/list/count events, latest-event cursor, pruned at 5000.
  - [✓] `electron/services/developer/sessions.ts` — automatic work sessions (start, idle checks, 15-minute timeout, flushed summary), `track()` counters.
  - [✓] `electron/services/developer/profile.ts` — inferred developer profile from indexes, chats, prompts, usage, terminal, files, searches, recommendations and themes; 60-second memo.
  - [✓] `electron/services/developer/insights.ts` — 5–8 evidence-backed insights (stack, provider, AI themes, active hours, recommendation affinity, documentation trend, thin tests).
  - [✓] `electron/services/developer/briefing.ts` — session briefing (greeting, since-label, activity lines, health/documentation deltas, suggested focus from weakest health dimension).
  - [✓] `electron/services/developer/personalization.ts` — learned system prompt (confidence-gated) + recommendation affinity.
  - [✓] `electron/services/developer/memory.ts` — Developer Memory separated from Project Memory (`scope: 'developer'`, `__developer__`).
  - [✓] `electron/ipc/developer.ts` + preload + `src/types/api.ts` — profile, insights, sessions, briefing, overview, personalization, affinity, track, memory CRUD, reset.
  - [✓] Automatic capture — workspace switches, chats, AI requests, prompts, searches, file opens, terminal commands, recommendation accept/ignore.
  - [✓] Personalization wired into Smart Context (`src/lib/contextBuilder.ts`, 700-char cap) and recommendation ranking (`src/lib/intelligence/recommendations.ts` + `intelligenceStore`).
  - [✓] `src/components/developer/ProfileView.tsx` — Profile page: inferred identity, how you work, learned insights, recent sessions, developer memory, privacy/reset.
  - [✓] `src/components/home/DashboardView.tsx` — Mission Control briefing card, accept/ignore affinity capture, dismissed recommendations.
  - [✓] `src/stores/developerStore.ts` — single renderer owner with cache-first loads and fire-and-forget tracking.
  - [✓] Navigation — Profile tab (`Ctrl+0`), sidebar/palette icons, lazy route.
  - [✓] Session lifecycle — tracking starts after database init; `before-quit` flushes the active session before closing the database.
- [✓] Release readiness audit — full-repository review completed against a two-week v1.0 ship target:
  - [✓] `docs/archive/RELEASE_READINESS_REPORT.md` — prioritized Critical/High/Medium/Low findings, evidence with file and line references, affected files, estimates, two-week execution plan, risk register, release gates and go/no-go recommendation.
  - [✓] Verdict: not release-ready. Critical blockers: backup/restore integrity; terminal approval bypass and unvalidated command execution; symlink-unsafe filesystem containment; reversible/plaintext API-key fallback; unsigned, unverified Windows packaging with stale build output.
- [✓] RC-1 — Filesystem security and containment (release blocker C3):
  - [✓] `electron/security-policy.ts` — canonical validation utilities: `validatePathInput`, `canonicalizePath` (realpath plus nearest-existing-ancestor fallback), `isCanonicalPathInsideRoot`, `canonicalRoots`, `assertPathInsideRoots` (writes), `assertPathAllowed` (reads plus explicitly trusted dialog paths). Trusted paths are canonicalized at insertion; `sanitizeFileName` now rejects `.`, `..`, `/` and `\`.
  - [✓] `electron/ipc/workspace.ts` — every path-taking handler validates input, resolves canonical paths and operates only on the returned safe path: read/write/create/rename/delete, file type/stats, list/search, workspace create/update, folder/file pickers. File tree and search skip symlinks escaping the canonical workspace root. Removed dead unguarded `readFilesForAttach`.
  - [✓] `electron/ipc/tools.ts` — PDF, image, OCR and file-detection handlers use canonical read paths.
  - [✓] `electron/ipc/workspaceIndex.ts` — canonical workspace root; skips symlinks while walking; all package/config/README/git metadata reads are contained by `readTextInsideRoot`.
  - [✓] `electron/services/intelligence/profileAnalyzer.ts` and `electron/services/workspaceIntelligence.ts` — package reads and intelligence cache reads/writes are canonical-contained.
  - [✓] `tests/electron/securityPolicy.test.ts` — 7 canonical containment tests: traversal, sibling escape, junction/symlink escape, non-existent write targets, trusted dialog paths, malformed input, separator filenames.
- [✓] RC-2 — Terminal security and safe command execution (release blocker C2):
  - [✓] `src/types/terminal.ts` — shared terminal request, result, activity, context and recommendation contracts.
  - [✓] `electron/services/terminal/command.ts` — strict quote-aware parser, shell/control-character rejection, blocked shells/destructive programs/interpreter eval flags, secret redaction, SHA-256 command hashing and timeout normalization.
  - [✓] `electron/services/terminal/workspace.ts` — canonical workspace/cwd containment; commands cannot run outside an approved workspace root.
  - [✓] `electron/services/terminal/approvals.ts` — native main-process approval dialog (renderer cannot approve), one-time/session records with id, workspace, command hash and expiry; execution re-verifies provenance.
  - [✓] `electron/services/terminal/output.ts` — bounded 128KB head + 64KB tail collector, 16KB audit text, binary suppression, truncation markers and secret redaction.
  - [✓] `electron/services/terminal/process.ts` — single execution pipeline: validation, approval, safe spawn, streaming events, concurrency limit, timeout, Windows process-tree termination, audit persistence and cancellation.
  - [✓] `electron/services/terminal/insights.ts` — aggregate terminal context, recommendations and Project Brain terminal insight; never exposes raw output.
  - [✓] `electron/ipc/system.ts` — replaced allowlist/renderer-trusted run handler; added cancel, activity, context and recommendation handlers; extended terminal history.
  - [✓] `electron/preload.ts` + `src/types/api.ts` — typed terminal API with output/update subscriptions.
  - [✓] `src/components/home/TerminalActivityCard.tsx` + Dashboard — event-driven running/recent terminal activity with cancel.
  - [✓] `src/components/workspace/AgentWorkflow.tsx` + `CodingAgent.tsx` — renderer approval dialogs removed; both consume `TerminalRunResult`.
  - [✓] `src/lib/contextBuilder.ts` + `src/stores/intelligenceStore.ts` — summarized terminal activity in Smart Context and merged terminal recommendations without duplicate IPC.
  - [✓] `tests/electron/terminalSecurity.test.ts` — 17 parser, injection, blocklist, hashing, timeout, redaction and output-bound tests.

- [✓] C1 — Trusted Data & Secret Boundary (release blockers C4 + C1):
  - [✓] Deleted legacy `electron/security.ts`; no `plain:` or reversible fallback remains. All provider credentials now pass through `SecretManager` + `SecretVault` (OS safeStorage or AES-256-GCM local key file).
  - [✓] `electron/services/secrets/manager.ts` — fingerprints exclude the same provider, new secrets are stored as `unchecked`, `recordValidation` persists test outcomes, and `rotateProviderSecret` re-seals with a new IV and version.
  - [✓] `electron/services/secrets/keyProvider.ts` — `deleteLocalFallbackKey()` for erase-all.
  - [✓] `electron/ipc/providers.ts` — single secret boundary; no direct crypto; added `providers:rotate` and `providers:secret-metadata`; provider payloads never include key values.
  - [✓] Safe data transfer — `electron/services/dataTransfer/validation.ts` validates app/schema/size/arrays, discards provider `apiKey`, sanitizes secret metadata and settings secrets.
  - [✓] `electron/ipc/settings.ts` — metadata-only export (`schemaVersion`, `secretExportMode`, `providerSecrets`), pre-import backup, import validation, safe provider inserts (`api_key=''`), `settings:validate-import`, erase-all removes the fallback key.
  - [✓] `electron/database/backup.ts` — `VACUUM INTO` snapshots, secret stripping, `PRAGMA integrity_check`, SHA-256 manifest, pre-restore copy, DB close/reopen, automatic relaunch. Restore/export/import handlers updated.
  - [✓] `electron/main.ts` — single-instance lock, second-instance focus, awaited DB init before migrations, awaited DB close on quit.
  - [✓] Settings UI — provider fingerprint/health/storage-mode badges, Re-encrypt action, restore confirmation, import validation/preview with credential re-entry warning.
  - [✓] Tests — `tests/electron/dataTransferValidation.test.ts` (13) and `tests/electron/secretBoundary.test.ts` (11).

## Current Status

Project Helios is complete and validated. Fluxora learns locally from everyday use and keeps all data on-device.

C1 — Trusted Data & Secret Boundary is complete. RC-1 (filesystem containment), RC-2 (terminal execution), and C1 (secret boundary + backup/restore integrity + lifecycle safety) are done. There is no reversible/plaintext key fallback; provider secrets live behind one main-process boundary; backups are integrity-checked, secret-free snapshots; imports are validated and metadata-only for credentials; and the app enforces a single instance with awaited database lifecycle.

Fluxora is still **not release-ready**. The database harness is green, the full suite passes, CI is configured, and Windows packaging now produces verified unsigned installer and portable artifacts. The next blocker is clean-machine validation. See `PROJECT_PLAN.md` for the authoritative Release Gate V1 task board, handoff rules, and exact continuation point. `docs/PRODUCT_REVIEW.md` and `docs/PRODUCT_ROADMAP.md` remain the evidence and prioritization sources.

## Current Todo

- [✓] Release readiness audit completed and documented.
- [✓] RC-1 filesystem containment implemented and validated.
- [✓] RC-2 terminal security implemented and validated.
- [✓] C1 Trusted Data & Secret Boundary implemented and validated.
- [✓] PROJECT_STATE.md and product review/roadmap updated.
- [✓] Historical reports archived and generated artifacts removed.
- [✓] Master release plan and agent handoff created in `PROJECT_PLAN.md`.
- [✓] Release Gate V1 Phase 2 — production `sqlite3` test harness; full suite 297/297.
- [✓] Release Gate V1 Phase 3 — CI workflow authored; GitHub Actions run `41855224190` passed.
- [✓] Release Gate V1 Phase 4 — Windows installer + portable built; native sqlite3 unpacked and proven loadable in the packaged app; metadata/icon verified; signing documented as BLOCKED; artifacts: `Fluxora-Setup-1.0.0.exe` (99.1 MiB) + `Fluxora-Portable-1.0.0.exe` (98.8 MiB); native sqlite3 packaging reproducible via `@electron/rebuild` in the build script; clean `npm ci` + rebuild + build verified; Windows packaging CI job added.
- [✓] API Discovery MVP (Phase 0 + Phase 1) — curated 20-API catalog, approval-gated executor, SSRF guards, vault-backed keys, audit log, Settings card, 91 tests.
- [✓] Release Gate V1 Phase 4 documentation update — tests 423/423; Phase 4 status PARTIAL; installer/portable .exe artifacts verified; signing BLOCKED; CI job added.

## Next Todo

- [ ] Phase 5 — clean-machine validation procedure and local smoke test. Install/uninstall smoke in a clean Windows profile/VM NOT VERIFIED (no clean machine available locally; documented procedure in `docs/RELEASE_GATE_EVIDENCE.md`).
- [ ] Phase 6 — crash-recovery audit.
- [ ] Phase 7 — measured performance report.
- [ ] Phase 8 — security re-audit.
- [ ] Phase 9 — documentation truth pass.
- [ ] Phase 10 — final release report.
- [ ] Post-release: H1/H2 indexing, H3/H4 chat lifecycle, H5/H7/H8 exports/caps, H9/H10 docs and IPC validation.

## Known Issues

- Critical: Windows release is unsigned — no code signing certificate exists; installer, portable and app exe all report `NotSigned`. Documented as BLOCKED, not faked.
- Build prerequisite: `electron-builder` must unpack its `winCodeSign` cache, which fails without symlink privilege. Developer Mode, an elevated first build, or a pre-seeded cache (Windows-only extraction) is required. Recorded in `docs/RELEASE_GATE_EVIDENCE.md`.
- Packaging residual: the package is ~105 MiB per artifact and still ships transitive build/test scaffolding (`node-gyp`, `node-pre-gyp`, `sqlite3/deps`), plus an unused `sharp` dependency. Size reduction deferred to Phase 9/10.
- Packaging residual: portable mode stores data in `userData` because `electron/config.ts` only detects a portable root next to the exe for the legacy `AI Workspace.exe`/`data` layout.
- Secrets residual: backups and exports intentionally omit credential values, so restoring on a new machine requires re-entering provider keys; the local fallback vault key is machine-bound.
- Terminal residual: approvals are held in memory, session approval lasts 8 hours, and the native process-tree kill/hard-link race is not covered by an automated integration test.
- Filesystem residual: canonical validation is check-then-use, so a local race or hard link can still redirect a write; workspace roots are canonicalized but missing/non-directory legacy roots are tolerated; root replacement is not locked.
- Filesystem (fixed in this pass): tree depth is measured relative to the workspace root (12 levels, 20k-entry budget) instead of absolute path segments, so trees expand past the first level; `workspace:read-file` clamps text at 200k characters and reports truncation accurately; `getWorkspaceSettings` and `mapRow` tolerate malformed settings JSON. Covered by `tests/electron/fsLimits.test.ts`.
- High: workspace indexing stops at ~400 recent files; file tree recursion never passes the first level.
- Chat persistence (fixed in this pass): `chat:update` maps camelCase onto columns so provider/model changes persist; `chat:update-message` serialises `files`/`usage` before binding; deleting a message removes the whole descendant branch via a recursive CTE. Covered by `tests/electron/chatMapping.test.ts`.
- Streaming (fixed in this pass): `onDone` resets streaming state in a `finally` even when persistence or usage recording fails; listener cleanup runs on stop, unmount, new stream and error; the main process aborts a stream when its window is destroyed.
- Export portability (fixed in this pass): terminal history, project brain, developer events, work sessions and the workspace index are exported and imported; schema version 2 still accepts v1 files. Covered by `tests/electron/dataTransferPortability.test.ts`.
- High: default provider/model presets are stale or unverifiable; refresh loses custom model metadata.
- Medium: critical paths still lack coverage beyond the current 297-test suite.
- Medium: docs drift remains in `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, and `docs/IPC_ARCHITECTURE.md`.
- Medium/Low: see `docs/PRODUCT_ROADMAP.md` and `docs/archive/RELEASE_READINESS_REPORT.md`.

## Build Status

- TypeScript (renderer): PASS — `npx tsc -p tsconfig.json --noEmit`
- TypeScript (electron): PASS — `npx tsc -p electron/tsconfig.json --noEmit`
- Renderer build: PASS — Vite production build after clearing `node_modules/.vite` (1912 modules transformed; renderer typecheck passed in the same script)
- Tests (C1 targeted): PASS — dataTransferValidation 13 + secretBoundary 11 (24 tests)
- Tests (combined trust suite): PASS — terminalSecurity 17 + securityPolicy 29 + dataTransfer 13 + secretBoundary 11 (70 tests)
- Tests (full suite): PASS — 423 tests across 26 files, including production-database coverage (the 91 API Discovery tests were added in this pass)
- CI: PASS — GitHub Actions run `41855922082` (Windows, Node 20; 1m 13s)
- Windows packaging: PASS (unsigned) — `Fluxora-Setup-1.0.0.exe` 104.9 MiB and `Fluxora-Portable-1.0.0.exe` 104.7 MiB; ProductName `Fluxora`, version `1.0.0`, icon matches `build/icon.ico`
- Artifact verification: NSIS installer and portable executable exist; version/product metadata correct; sqlite3 native binary present in unpacked `node_modules/sqlite3/build/Release/`; no stale debug files packaged; artifact sizes recorded (104.9 MiB installer, 104.7 MiB portable); signing status explicit: `NotSigned`.
- Native sqlite3 in package: PASS — `app.asar.unpacked/node_modules/sqlite3/build/Release/node_sqlite3.node` (1,892,864 bytes); packaged app created a 15-table database on first launch
- Packaged app launch: PASS — unpacked and portable binaries both start with a fresh `--user-data-dir`; real user data untouched
- Code signing: BLOCKED — no certificate; all artifacts `NotSigned`
^- Windows release: VERIFIED within this session — packaged app launches on fresh --user-data-dir, DB bootstrap succeeds with 16 tables; sign‑ing remains BLOCKED (no cert). Installer/packaging verified unsigned.

---

## API Discovery MVP (Phase 0 & 1) — COMPLETE

Implemented as specified in `docs/PROJECT_REALITY_API_DISCOVERY_REPORT.md`: a curated,
approval-first catalog with one live test path, no autonomy.

**Shipped**

- `electron/services/apiDiscovery/catalog.ts` — catalog v1.0.0, 20 entries, 6 categories,
  `verifiedAt` 2026-11-06 after probing every sample endpoint.
- `electron/services/apiDiscovery/ssrf.ts` — HTTPS/port/credential/fragment checks, IPv4 +
  IPv6 private/reserved blocklist (including IPv4-mapped), pinned DNS lookup.
- `electron/services/apiDiscovery/executor.ts` — GET-only, manual same-host redirects (max
  3), 10s timeout, 1 MB cap, JSON/plain-text allowlist, per-API and global rate limits.
- `electron/services/apiDiscovery/audit.ts` — path-only rows, 500-row retention.
- `electron/services/apiDiscovery/secrets.ts` — `api` owner type inside the existing
  `secret_records` vault (no second secret system).
- `electron/ipc/apis.ts` + preload `window.api.apis` — seven handlers, none accepts a URL,
  host, method, headers, or body.
- Migration additions: `api_connections`, `api_audit_log`, three indexes; `getAllTables()`
  updated so export/erase include them.
- `src/components/settings/ApiDiscoverySettings.tsx` mounted as a Settings card with the
  Beta badge, search, three filters, detail panel, connect/remove, confirm-then-test, and
  the audit table.

**Tests added (91)**

| File | Tests | Covers |
|------|-------|--------|
| `tests/electron/apiCatalog.test.ts` | 8 | count, categories, uniqueness, HTTPS, sample-path rules, ISO dates, no "unlimited" claims |
| `tests/electron/apiSsrf.test.ts` | 48 | 30 blocked addresses, 5 allowed, hostname rules, URL rules, resolver rejects, pinning |
| `tests/electron/apiExecutor.test.ts` | 19 | URL building, auth headers, timeout, 1 MB cap, content type, redirects, rate limits, audit rows |
| `tests/electron/apiDiscoveryDatabase.test.ts` | 7 | tables, indexes, no secret/body columns, audit ordering and pruning |
| `tests/electron/apiIpc.test.ts` | 9 | channel set, unknown ids, injection attempts, secret validation, no secret leakage |

**Gates** — both typechecks PASS, `npx vitest run` 423/423 PASS (26 files), `npm run build`
PASS.

**Known gaps**

- No live keyed request was executed (no third-party credential available); keyed paths use
  injected secrets and injected transports.
- Keyless live verification: 19/20 endpoints returned JSON 200; Google Books returned 429
  from a shared IP.
- No UI automation harness exists in this repo, so the Settings card is verified by build +
  review, not by a headless render test.

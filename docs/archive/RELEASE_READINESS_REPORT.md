# Fluxora v1.0 — Release Readiness Audit

**Audit date:** 22 October 2026  
**Target:** Fluxora v1.0.0 (`package.json`), Windows NSIS + Portable  
**Scope:** Full repository — Electron main/preload, SQLite layer, IPC, AI providers, renderer, stores, UI, tests, build/packaging, documentation  
**Method:** Static review of every source area plus configuration, generated release artifacts, dependency graph, and the existing test suite. No runtime installer smoke test, no dynamic penetration test, and no production telemetry were available.  
**Verdict:** **NOT RELEASE-READY.** Five critical blockers must be closed before shipping; the current two-week window is feasible only if scope is frozen and medium/low work is deliberately deferred.

> **Update 2026-11-03 — Milestone C1 (Trusted Data & Secret Boundary) complete.** The reversible plaintext key path and live-WAL backup/restore path are removed. Secrets now use one main-process vault with metadata-only renderer/export, honest validation, rotation, and secret-free integrity-checked backups. Restore verifies, snapshots the current DB, and relaunches. Remaining critical blocker is Windows packaging/release gate. See `docs/PRODUCT_REVIEW.md`, `docs/PRODUCT_ROADMAP.md`, and `docs/milestones/TRUSTED_DATA_SECRET_BOUNDARY.md`.

---

## 1. Executive Summary

Fluxora has a strong architectural spine: a single Workspace Intelligence layer, locality-first storage, a coherent design system, strict TypeScript, and meaningful automated tests. The product is close to demonstrable quality, but it is not yet safe to install on a customer machine.

The release risks cluster in four areas:

1. **Data integrity** — backups and restores copy a live WAL database without checkpointing or validation, and the UI tells users to restart while the app keeps running.
2. **Local security** — terminal commands can bypass approval via an allowlist prefix, file containment is symlink-unsafe, several file IPC handlers have no containment at all, and API keys can silently fall back to reversible plaintext.
3. **Installability** — the Windows build disables executable signing/editing and native rebuilds, ships a stale debug artifact, and has no clean build, CI, or installer verification.
4. **Trust in core surfaces** — chat provider/model selection does not persist, indexing silently stops at roughly 400 recent files, the file tree stops after one level, and streaming can leave the UI permanently "streaming".

**Baseline health:** renderer and Electron TypeScript pass; renderer production build passes; 239 tests pass, but one test suite (`tests/electron/database.test.ts`) is already red because Vitest cannot resolve the native `sqlite` module. A red suite is not acceptable for a release gate.

**Recommended decision:** Hold the release. Execute the critical workstream first (estimated 6–8 engineer-days), then the high-priority workstream (6–8 days). If the ship date cannot move, cut Low and most Medium items, and ship only after every critical and high item below is either fixed or explicitly accepted in writing.

---

## 2. Readiness Scorecard

| Area | Score | Status |
|---|---|---|
| Data integrity and backups | 2 / 10 | Blocker |
| Local security and IPC trust | 3 / 10 | Blocker |
| Packaging and distribution | 3 / 10 | Blocker |
| Core product correctness | 5 / 10 | At risk |
| Performance and scale | 5 / 10 | At risk |
| Accessibility | 5 / 10 | At risk |
| Documentation and support | 4 / 10 | At risk |
| Test coverage and CI | 4 / 10 | At risk |
| Architecture and maintainability | 7 / 10 | Acceptable with debt |
| Design and UX coherence | 8 / 10 | Strong |

---

## 3. Critical Findings (ship blockers)

### C1. Backups and restores can corrupt or lose data
**Affected:** `electron/database/backup.ts` (lines 12, 39, 80, 99–110, 115–133, 150, 161–162), `electron/main.ts` (quit sequence), `src/components/settings/SettingsView.tsx:390–396`

**Evidence**
- `createBackup` and `exportDatabase` use `fs.copyFileSync` on `aiworkspace.db` only, while the database is open in WAL mode. The `-wal` and `-shm` sidecars are omitted, so the copy can be stale or inconsistent.
- `restoreBackup` copies the current database, overwrites the live database, waits 100 ms, and never closes, reopens, checkpoints, or runs `PRAGMA integrity_check`.
- `importDatabase` and `backupBeforeImport` repeat the same raw-copy pattern.
- The Settings UI restores immediately with no confirmation dialog, then shows "Backup restored successfully. Restart to apply." The app never restarts, so the running connection can keep writing over the restored file.
- `getBackupSettings` parses JSON without a guard; a malformed row can throw during startup or backup.
- Backups contain provider keys (encrypted, or reversibly stored via the plaintext fallback in C4).
- `main.ts` calls `closeDatabase()` without awaiting the returned promise before quitting, risking an unchecked WAL checkpoint.

**Impact:** A user can believe they have a backup that will not restore, or restore a file and continue working against the old in-memory connection. This is a direct data-loss path for the product's core promise of local-first ownership.

**Fix direction:** Use SQLite's online backup API or `PRAGMA wal_checkpoint(TRUNCATE)` before `VACUUM INTO`; validate with `integrity_check`; close and reopen the connection around restore inside a single serialized operation; block renderer writes during restore; require confirmation; force relaunch; never restore from an arbitrary renderer-supplied path without validation; harden settings JSON parsing.

**Estimate:** 2–3 engineer-days including tests.

---

### C2. Terminal approval can be bypassed; command execution is under-validated
**Affected:** `electron/services/ai/...` callers, `electron/ipc/system.ts:407–475`, `electron/security-policy.ts:65–79`, `electron/preload.ts`, `src/components/workspace/AgentWorkflow.tsx`, `src/components/workspace/CodingAgent.tsx`

**Evidence**
- `isAllowlisted()` returns true when a command starts with an allowlisted prefix. Combined with `blockedCommandReason()`, an allowlisted prefix such as `npm` lets a compound command (`npm test && rm -rf ...`) execute with `approvedBy='allowlist'` and no user approval.
- The renderer can pass `approved: true` directly; the main process trusts it.
- `cwd` and `workspaceId` are not validated against a trusted workspace before `spawn` with `cmd.exe /c`.
- stdout/stderr accumulate without a cap; only the database insert slices to 50 KB.
- On Windows, `child.kill('SIGKILL')` does not reliably terminate the process tree.
- No IPC sender-frame validation distinguishes the app window from any other renderer.
- `git:commit` stages the entire repository (`git.add('.')`) with an arbitrary working directory.

**Impact:** A malicious or compromised renderer gains unrestricted local command execution. Even without compromise, a legitimate complex command can silently bypass the guardrail the product advertises. This defeats the approval model and is a release-blocking security issue for a local-first app with filesystem access.

**Fix direction:** Parse commands rather than prefix-match; deny shell metacharacter composition unless fully approved; require main-process approval tokens that cannot be forged; validate `cwd` falls inside a trusted workspace; enforce output/time/tree limits; kill process trees; validate the IPC sender; reduce the preload surface to purpose-built operations.

**Estimate:** 2–3 engineer-days including adversarial tests.

---

### C3. Filesystem containment is symlink-unsafe and incomplete
**Affected:** `electron/security-policy.ts:7–13, 82–88`, `electron/ipc/workspace.ts:152, 197–201, 208, 225, 296–315, 355`, `electron/ipc/tools.ts`

**Evidence**
- `isPathInsideRoot` uses `path.resolve` and `path.relative` only. It never resolves the real path, so a symlink inside a workspace pointing outside passes containment.
- Write, create, delete, rename, and recursive delete all rely on this check.
- `workspace:file-type`, `workspace:file-stats`, and `readFilesForAttach` perform no containment check at all.
- `sanitizeFileName` blocks absolute paths, `..`, and invalid characters, but does not reject `/` or `\`, so separators can create nested paths.
- The same weakness is shared by `tools.ts` through `assertReadable`.

**Impact:** A workspace containing a symlink (common in monorepos and user projects) lets the app read, overwrite, or recursively delete files outside the workspace. That is an unacceptable local security boundary failure.

**Fix direction:** Resolve both root and candidate with `fs.realpath`; reject when the real candidate is outside the real root; reject symlinked path components for writes; apply containment consistently to every path-taking handler (including stat/type/attach); validate IPC payloads; add tests for symlink escapes.

**Estimate:** 1.5–2 engineer-days including tests.

---

### C4. API keys can be stored reversibly and copied into backups
**Affected:** `electron/security.ts`, `electron/database/backup.ts`, `electron/ipc/providers.ts`, `electron/ipc/settings.ts`

**Evidence**
- `encryptSecret` falls back to `plain:<secret>` whenever OS encryption is unavailable or throws, with no user-visible warning or blocked state.
- `decryptSecret` returns any non-prefixed value unchanged, preserving legacy plaintext.
- Backups copy the provider table, so fallback keys travel with backup files.
- Settings export blanks keys, but database export and raw backups do not.

**Impact:** The app may claim secure local storage while writing recoverable secrets to disk and into user-shared backup files. This is a security and trust failure, especially for a privacy-first product.

**Fix direction:** Refuse to persist keys without OS-backed encryption, or require explicit opt-in with a persistent warning; migrate legacy plaintext values; exclude secrets from all export paths or encrypt exports; add a key-rotation/clear action; document the guarantee precisely.

**Estimate:** 1–1.5 engineer-days.

---

### C5. The Windows release is not verifiably installable or trustworthy
**Affected:** `electron-builder.json`, `package.json`, `dist-electron/`, `release/`

**Evidence**
- `signAndEditExecutable: false` ships unsigned installers and skips executable metadata editing. Windows SmartScreen will warn; the publisher identity is absent.
- `npmRebuild: false` with no postinstall or explicit `@electron/rebuild` step means the sqlite3 native binding ABI is unverified against Electron 28. The unpacked `node_sqlite3.node` exists, but its ABI provenance is not guaranteed by the build.
- There is no `clean` script. `dist-electron/electron/groq-debug.js` is a stale artifact with no source file and will be included in the package.
- No `asarUnpack` configuration is explicit; native and OCR assets rely on electron-builder auto-detection.
- No installer smoke test, no launch check on a clean Windows profile, no CI, and no release checklist.
- Only Windows targets are configured; any documentation implying cross-platform support is inaccurate.

**Impact:** The first-run experience can be a SmartScreen warning followed by a launch crash from a native module mismatch. A stale debug file also leaks internal experimentation into the shipped app.

**Fix direction:** Clean before build; rebuild native dependencies for Electron 28; add a reproducible `release:win` pipeline; code-sign or explicitly document the unsigned-build limitation; add a clean-machine smoke test covering install, launch, DB creation, provider setup, chat, backup, and uninstall; verify asar contents; remove stale build output.

**Estimate:** 2–3 engineer-days plus certificate/procurement lead time.

---

## 4. High-Priority Findings

### H1. Workspace index silently stops around 400 files
**Affected:** `electron/ipc/workspaceIndex.ts:69`

The walk stops entirely when `state.recentFiles.length > 400` (or 50,000 files), so typical repositories are only partially indexed. Workspace Intelligence, recommendations, Smart Context, and the Brain then reason from incomplete evidence. Fix: bound per-category collection, not the whole walk; stream progress; move scanning to a worker; add fixture tests for 400+ files.

**Estimate:** 1–1.5 days.

### H2. Workspace file tree never expands beyond the first level
**Affected:** `electron/ipc/workspace.ts:296–315`

Recursion compares an absolute path's segment count to `< 3`. A normal workspace root is already deeper than three segments, so children are never read. Fix: track depth relative to the workspace root, with a separate node/entry budget. Add a tree fixture test.

**Estimate:** 0.5 day.

### H3. Chat provider/model selection and message updates are broken
**Affected:** `electron/ipc/chat.ts:79–91, 146–160, 168–171`, `src/stores/chatStore.ts:239`

`chat:update` whitelists snake_case keys but reads camelCase data, so `providerId`/`modelId` never persist. `chat:update-message` binds `files`/`usage` objects directly to SQLite, which can throw, and uses the wrong provider key. Deleting a message removes only direct children, leaving deeper descendants orphaned. Fix: normalize at the IPC boundary, serialize JSON, validate update keys, cascade deletes recursively, and cover each path with tests.

**Estimate:** 1–1.5 days.

### H4. Streaming lifecycle can leak listeners and freeze the composer
**Affected:** `src/stores/chatStore.ts:389–410`, `electron/ipc/system.ts` stream handlers

`onDone` cleans up first, then awaits message persistence and usage recording with no try/catch; a failure leaves `isStreaming` true and produces an unhandled rejection. `stopStreaming` does not invoke cleanup, so listeners survive until a later event. Active streams are not aborted when the window closes. Fix: `try/finally` state reset, cleanup on stop, abort on window close, guard stale request IDs.

**Estimate:** 1 day.

### H5. Settings/data import can wipe provider keys and is unversioned
**Affected:** `electron/ipc/settings.ts:147, 202–203`, `src/components/settings/SettingsView.tsx`

Export writes `apiKey: ''`; import then writes that empty value back, erasing existing keys. Import accepts any JSON without app/version/schema validation, uses one transaction without a merge preview, and may partially conflict with existing rows. `settings:erase-all` leaves `.fluxora-intel` caches and backup files behind. Fix: never import empty secrets, add schema/version checks and a confirmation preview, define merge semantics, and make erase-all truly complete (or rename it).

**Estimate:** 1–1.5 days.

### H6. Release gate is red and critical paths are untested
**Affected:** `tests/electron/database.test.ts`, `vitest.config.ts`, overall test suite

The database suite cannot load the native sqlite module under Vitest. There are no tests for backups/restores, terminal approval and injection, symlink containment, chat update/delete, settings import/export, provider CRUD, developer services, renderer streaming, or accessibility. Coverage is scoped narrowly. Fix: repair the test environment, add security regression tests, and make the suite a required gate.

**Estimate:** 2 days (parallelizable with fixes).

### H7. Default provider/model presets are stale and partly unverifiable
**Affected:** `electron/services/ai/index.ts`

Defaults reference old Claude 3.5/3, GPT-4o, and Gemini 1.5, plus Groq model IDs that appear fabricated (`qwen/qwen3.8-27b`, `qwen/qwen3.6-27b`, `groq/compound`, `groq/compound-mini`). `syncBuiltinProvidersToPresets` only adds and never removes, so stale entries persist. New users can hit immediate 404s. Fix: verify every preset against live provider catalogs, version the preset sync, and allow removal/migration.

**Estimate:** 0.5 day plus catalog verification.

### H8. Large text files and synchronous I/O can freeze the app
**Affected:** `electron/ipc/workspace.ts:152`, `electron/ipc/tools.ts`, `electron/ipc/workspaceIndex.ts`

Text files between 200 KB and 5 MB are returned whole while the `truncated` flag claims otherwise; binary files return up to 5 MB of base64. Image/PDF/OCR handlers have weak or absent size guards. Directory walks, file stats, reads, and git calls are synchronous on the Electron main process. Fix: enforce real byte caps, stream or truncate at the boundary, move heavy work to workers, and guard OCR/image/PDF sizes.

**Estimate:** 1.5–2 days.

### H9. Documentation contradicts the shipped product
**Affected:** `docs/README.md`, `QUICK_START.md`, root report sprawl, `package.json`

`docs/README.md` claims Electron 33 (actual 28.2), better-sqlite3 (actual sqlite3), port 1420 (actual 5173), and scripts that do not exist. `QUICK_START.md` uses legacy AI Workspace branding and data paths. There is no root README and no LICENSE. Historical audit/report files at the root compete with `PROJECT_STATE.md` as sources of truth. Fix: rewrite README/quick start from the actual code, add LICENSE, archive old reports, and make `PROJECT_STATE.md` authoritative.

**Estimate:** 1–1.5 days.

### H10. IPC trust boundary is broad and unvalidated
**Affected:** `electron/preload.ts`, all `electron/ipc/*`

No handler validates the sender frame, no payload schema validation exists, and the preload exposes raw file/terminal/backup operations with extensive `any`. Sandboxing and CSP reduce but do not remove the blast radius. Fix: sender validation, narrow purpose-built APIs, runtime schema checks, and shared typed contracts.

**Estimate:** 2–3 days (overlaps C2/C3).

---

## 5. Medium-Priority Findings

### M1. Database lifecycle and migration discipline
`transaction()` wraps `new Promise(async ...)` and shares one connection, allowing interleaved or nested transactions. Migrations run statement-by-statement with no version table and no transaction. No foreign keys are declared, so chat/message orphan cleanup is manual. `closeDatabase()` is not awaited on quit. Fix: a serialized transaction queue or `BEGIN IMMEDIATE`, a migration version table, foreign keys with cascades, and an awaited shutdown.

**Estimate:** 2 days.

### M2. No pagination or full-text search
Chats, messages, memories, prompts, notifications, and terminal history load unbounded result sets. `chat:search` uses a leading-wildcard `LIKE` with no escaping, index, or limit. Fix: keyset pagination, FTS5 for message search, escaped patterns, and explicit limits.

**Estimate:** 2 days.

### M3. AI streaming completeness and analytics
Reasoning deltas are ignored; Anthropic/Gemini usage is not captured; the final SSE buffer is not flushed without a trailing newline; no request timeouts or retries; `ai:complete` does not record usage; completion-token fallback counts characters; memory context is emitted after the response and cannot influence it; a notification row is written for every stream start; active streams survive window close. Fix: normalize stream events, capture usage per provider, flush buffers, add timeouts, record complete calls, compute memory context before the request, and throttle notifications.

**Estimate:** 2 days.

### M4. Provider and pricing reliability
The price table covers only a handful of stale models, so most usage costs $0; refresh replaces model metadata and loses custom settings; Anthropic/Gemini model refresh uses incompatible auth; provider test can overwrite the stored provider type; `providers:update` can emit a duplicate `type` assignment; unguarded `JSON.parse` on provider rows. Fix: a maintained price catalog with unknown-cost labeling, non-destructive model merge, provider-aware refresh, explicit errors, and validated mapping.

**Estimate:** 1.5 days.

### M5. Backup/settings polish and clock behavior
`getBackupSettings` can throw; auto-backup does not run at startup; window-state does not clamp to the work area or minimum size; `system:analytics.cpuLoad` sums cumulative CPU times rather than load; restore does not relaunch. Fix: guarded parsing, first-run backup, clamped geometry, correct metrics, explicit restart flow.

**Estimate:** 1 day.

### M6. Accessibility gaps
Roughly 193 button instances versus roughly 31 accessible labels. The chat stop control is icon-only without an accessible name; tooltips do not provide names. Focus trapping and restoration in dialogs, live-region announcements for streaming/toasts, form error association, and keyboard navigation need a systematic pass. Fix: accessible names for every icon-only control, focus management tests, live regions, and an automated axe pass.

**Estimate:** 2–3 days.

### M7. Performance architecture
Developer profile aggregation and workspace intelligence run multiple scans and aggregations on demand; Smart Context performs sequential IPC calls before every message; the main process performs synchronous filesystem and git work; no worker thread exists. Fix: parallelize context sections, cache derived profile results with event cursors, move indexing and scanning to workers, and add timing instrumentation.

**Estimate:** 2–3 days.

### M8. Developer learning layer lacks tests and observability
Sessions, profile, insights, briefing, personalization, and developer memory have no unit tests. Failures are silently swallowed in the store, so the Profile page can look empty with no explanation. Reset has no success/failure feedback. The 60-second profile cache is sound, but the underlying queries need scale fixtures. Fix: service tests with a temp DB, surfaced error states, and reset confirmation feedback.

**Estimate:** 1.5–2 days.

### M9. Dead code and misleading artifacts
`restoreBackupFile` returns `null`; `sqliteBackupMiddleware` is a no-op; `openai` appears unused; generated stale `groq-debug.js` ships; duplicated mapping code exists across chat/providers/settings; `getUserSettings` duplicates `readSettings`. Fix: remove dead paths, prune dependencies, clean build output, and consolidate mapping.

**Estimate:** 0.5–1 day.

### M10. CSP and markdown media
Production CSP blocks remote images in AI answers (`img-src 'self' data: blob:`). This is a deliberate security choice but an unexplained UX regression. No permission request handler exists for notifications, clipboard, or media. Fix: document the policy, proxy or allow an explicit image host if product requires it, and deny unused permissions explicitly.

**Estimate:** 0.5 day.

---

## 6. Low-Priority Findings

- **L1. Legacy naming:** package name `ai-workspace`, database `aiworkspace.db`, backup prefix `ai-workspace-*`, and `QUICK_START.md` still say "AI Workspace" while the product is Fluxora. Rename only with a migration plan; at minimum document the mapping.
- **L2. Root clutter:** historical reports (`FLUXORA_MASTER_AUDIT.md`, `ENGINEERING_REPORT.md`, `FINAL_REPORT.md`, and others) should move to `docs/archive/` so `PROJECT_STATE.md` is the single status source.
- **L3. Missing `LICENSE`:** add the intended license before distributing binaries.
- **L4. Missing lint/format gate:** no ESLint/Prettier configuration or script; add one to prevent drift.
- **L5. Type strictness:** `noUnusedLocals`/`noUnusedParameters` are disabled; enable them incrementally.
- **L6. Test coverage config:** coverage is limited to a subset of modules; widen after critical tests exist.
- **L7. Notification noise:** a persisted notification per stream start will grow the database and the UI feed; make them opt-in or transient.
- **L8. Window-state timer:** the debounce timer is not `unref`'d; minor shutdown delay in tests/tools.
- **L9. Search quality:** filename-only workspace search, case-insensitive with a hard 50-result cap; document the limitation or add content search.
- **L10. Icon-only affordances:** some controls rely on hover tooltips; fold into M6.

---

## 7. What Is Working Well

- The intelligence architecture is genuinely centralized: analyzers, recommendations, ranking, Smart Context, Mission Control, the Brain, and the Coding Agent all consume one contract rather than re-scanning independently.
- Local-first behavior is real: SQLite on disk, no telemetry found, provider calls proxied through the main process.
- Security fundamentals are partly right: `sandbox`, `contextIsolation`, no `nodeIntegration`, hardened navigation, no remote module, and a restrictive production CSP.
- The design system is coherent and the app shell, command palette, and empty states show unusual care.
- Strict TypeScript and a meaningful baseline suite exist; 239 tests passing is a solid starting point.
- Developer learning is cached sensibly (60-second memo keyed by latest event) and session persistence is batched rather than written per event.

---

## 8. Execution Plan (two weeks)

Assumes one senior engineer with part-time QA. Estimates are engineer-days and include tests.

### Week 1 — Stop the bleeding

| Day | Work | Outcome |
|---|---|---|
| 1 | C3 symlink-safe containment + unguarded path handlers; C2 command parsing and approval tokens | Filesystem boundary closed; terminal bypass removed |
| 2 | C2 remainder: cwd validation, output/tree limits, sender validation, process-tree kill; C4 key storage policy | Command execution contained; secrets policy enforced |
| 3–4 | C1 backup/restore rewrite with SQLite backup API, validation, close/reopen, UI confirmation and relaunch; repair `getBackupSettings` and awaited shutdown | Backups are trustworthy |
| 5 | C5 clean build, native rebuild, remove stale artifact, sign or document unsigned build, clean-profile smoke test | Installable, reproducible Windows build |
| 5 (parallel) | H6 repair test environment; add first security regression tests | Green suite gate restored |

### Week 2 — Restore product trust

| Day | Work | Outcome |
|---|---|---|
| 6 | H1 indexing completeness + worker execution; H2 tree recursion | Intelligence and file tree are accurate |
| 7 | H3 chat update/delete fixes; H4 streaming lifecycle | Core chat behavior reliable |
| 8 | H5 import/export and erase-all; H7 provider presets; H8 file caps | Data portability and provider setup safe |
| 9 | H9 documentation rewrite, LICENSE, archive reports; H10 sender/payload validation | Release narrative and IPC boundary consistent |
| 10 | Full regression, installer smoke test, accessibility spot-check (M6), release checklist, go/no-go review | Release decision with evidence |

### Deferred unless capacity exists
M1–M5, M7–M10, and all Low items. They are important but not ship blockers. Deferring them must be recorded as accepted debt, not silently dropped.

### Total effort
- Critical: 6–8 engineer-days
- High: 6–8 engineer-days
- Medium: 12–16 engineer-days
- Low: 3–4 engineer-days

A complete cleanup is roughly 27–36 engineer-days. A safe two-week release is achievable only by limiting scope to Critical + High + documentation/packaging gates.

---

## 9. Recommended Order of Work (strict)

1. **C3** — path containment. Everything else assumes the filesystem boundary.
2. **C2** — terminal approval and execution limits.
3. **C4** — secret storage policy.
4. **C1** — backup/restore integrity and UI flow.
5. **C5 + H6** — reproducible build and a green test gate.
6. **H1 + H2** — indexing and tree correctness.
7. **H3 + H4** — chat persistence and streaming state.
8. **H5 + H7 + H8** — import/export, presets, file caps.
9. **H9 + H10** — documentation truth and IPC hardening.
10. **M6 + M1 + M2** — accessibility, DB lifecycle, pagination/search.
11. Remaining Medium and Low items as accepted debt.

Rationale: security and data integrity first, then installability, then correctness of the surfaces users judge the product by, then scale and polish. Documentation must land before release messaging, not after.

---

## 10. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Native sqlite3 ABI mismatch on clean machines | Medium | Launch crash | Rebuild for Electron 28, test on a clean VM, pin electron-builder config |
| Unsigned installer triggers SmartScreen and blocks adoption | High | Trust loss | Sign, or explicitly label as unsigned beta with checksums |
| Backup rewrite introduces new restore bugs | Medium | Data loss | Integration tests with WAL, restore-and-verify fixtures, staged rollout |
| Command parsing breaks legitimate developer workflows | Medium | UX regression | Test matrix for common commands; clear approval UX; allowlist migration |
| Two-week scope forces shortcuts | High | Residual critical risk | Freeze features; defer Medium/Low; require written acceptance for anything not fixed |
| Test environment repair consumes more than a day | Medium | Schedule slip | Timebox; fall back to a dedicated Node-based DB test runner if Vitest cannot load sqlite |
| No code-signing certificate available | Medium | Unsigned ship | Start procurement immediately; prepare checksums and release notes |
| Accessibility work expands | Medium | Schedule slip | Limit release scope to icon labels, focus traps, and keyboard reachability; defer full audit |

---

## 11. Release Gates (all must pass)

- [ ] Clean build from a fresh clone: install, rebuild native deps, renderer build, Electron build, installer build.
- [ ] Installer verified on a clean Windows profile: install, launch, create data, restart, uninstall.
- [ ] No stale generated files in the package; asar contents reviewed.
- [ ] Full test suite green, including the database suite; new tests for backups, containment, terminal approval, chat update/delete, settings import/export.
- [ ] Manual security pass: symlink escape, allowlist composition, arbitrary cwd, forged approval, oversized output, path traversal.
- [ ] Backup and restore verified end-to-end, including app relaunch and data equivalence.
- [ ] API keys absent from exports and backups unless encrypted with a documented guarantee.
- [ ] Chat provider/model selection persists across restart; message edit/delete verified.
- [ ] Workspace indexing and file tree verified on a repository with more than 1,000 files and nested folders.
- [ ] Streaming stop/complete/error paths leave no stuck state or leaked listeners.
- [ ] Documentation matches the shipped versions, scripts, ports, and data paths; LICENSE present.
- [ ] Go/no-go review signed off with a written list of accepted Medium/Low debt.

---

## 12. Affected Files Index

**Critical:** `electron/database/backup.ts`, `electron/main.ts`, `electron/security.ts`, `electron/security-policy.ts`, `electron/ipc/system.ts`, `electron/ipc/workspace.ts`, `electron/ipc/tools.ts`, `electron/preload.ts`, `electron-builder.json`, `package.json`, `src/components/settings/SettingsView.tsx`

**High:** `electron/ipc/workspaceIndex.ts`, `electron/ipc/chat.ts`, `electron/ipc/settings.ts`, `electron/ipc/providers.ts`, `electron/services/ai/index.ts`, `electron/services/ai/providers.ts`, `src/stores/chatStore.ts`, `docs/README.md`, `QUICK_START.md`, `tests/electron/database.test.ts`, `vitest.config.ts`

**Medium:** `electron/database/index.ts`, `electron/config.ts`, `electron/window-state.ts`, `electron/ipc/memory.ts`, `electron/ipc/prompts.ts`, `electron/ipc/search.ts`, `electron/ipc/usage.ts`, `electron/services/developer/*`, `src/lib/contextBuilder.ts`, `src/stores/developerStore.ts`, `src/components/chat/ChatView.tsx`, `src/components/workspace/AgentWorkflow.tsx`, `src/components/workspace/CodingAgent.tsx`, `src/components/ui/*`

**Low:** root report files, `LICENSE`, `.gitignore`, `tsconfig*.json`, `src/types/*`, `docs/archive/*`

---

## 13. Final Recommendation

**Do not ship v1.0 in two weeks on the current scope.** Ship only after Critical and High items are closed, the installer is verified on a clean machine, and the test gate is green. If the date is immovable, release as an explicitly labeled beta with signing limitations disclosed, and treat Medium/Low findings as documented debt — but do not compromise on backups, path containment, command approval, secret storage, or installability.

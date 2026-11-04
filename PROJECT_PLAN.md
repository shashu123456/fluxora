# Fluxora Master Project Plan

**Status:** Active
**Updated:** 2026-11-04
**Owner:** Product engineering
**Purpose:** Single source of truth for what is done, what comes next, and how a new agent should continue without re-discovering the project.

---

## 1. How to use this file

Read in this order:

1. `PROJECT_PLAN.md` — scope, sequence, handoff rules (this file)
2. `PROJECT_STATE.md` — current completed work and known issues
3. `docs/RELEASE_GATE_EVIDENCE.md` — verified commands, baseline results, and phase evidence
4. `docs/PRODUCT_REVIEW.md` — architecture/product audit and maturity scores
5. `docs/PRODUCT_ROADMAP.md` — prioritized roadmap
6. `docs/milestones/TRUSTED_DATA_SECRET_BOUNDARY.md` — completed C1 milestone
7. `docs/SECURITY.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/IPC_ARCHITECTURE.md`
8. Source under `electron/` and `src/`

Historical reports are archived in `docs/archive/` and are **not** current truth.

---

## 2. Standing rules for every agent

1. **No speculative platform work.** TITAN, HELIOS, OMEGA, GENESIS, ATLAS, NOVA, NEXUS, INFINITY, QUANTUM, AETHER, SINGULARITY are deferred. Do not implement them until the Release Gate is green.
2. **One task at a time.** Complete, validate, document, then move to the next task.
3. **No silent failures.** Surface errors; do not add empty `catch {}` blocks.
4. **No new feature scope during release engineering.** Only fixes, tests, CI, packaging, performance, documentation, and verified reliability work.
5. **Every change must leave:** renderer TypeScript green, Electron TypeScript green, relevant tests green, production build green (or a documented environmental limitation).
6. **Update `PROJECT_STATE.md` after every completed task.** Keep this plan’s status table current.
7. **No secrets in code, logs, exports, or fixtures.** Test keys must be obviously fake.
8. **Do not delete user data.** Backup/restore paths must verify before replacing and preserve a pre-restore copy.
9. **Use built-in tools first.** No gstack/design skills for release engineering. Use `read`, `grep`, `glob`, `edit`, `write`, `bash`. Use subagents only for broad audits. Browser skills only for UI smoke tests.
10. **Respect the environment.** OneDrive path makes Vite builds slow. Clear `node_modules/.vite` before retrying. Use 600s build timeout. `electron:dev` currently does not set `VITE_DEV_SERVER_URL`; prefer `npx vite build` + `npm run start` for verification until fixed.
11. **Database tests must use production code.** Never recreate schema in a test. Never mock away migrations.
12. **No unverified claims.** If it was not run, say “not verified”.

---

## 3. Current snapshot

- Product: Fluxora, local-first AI operating workspace (Electron 28 + React 18 + Vite 5 + TypeScript + Zustand + SQLite).
- Version: 1.0.0 release candidate.
- Engineering maturity: ~65/100.
- Commercial readiness: ~50/100.
- C1 Trusted Data & Secret Boundary: **complete**.
- Current blocker: release gate is not green (database suite red; no CI; Windows installer/signing/clean-machine verification absent).
- Source size: ~25.4k LOC, 132 TS/TSX files, 43 components, 9 stores, 36 services, 15 IPC modules, ~143 handlers, 15 tables.
- Tests: 263 passing, 1 failing database suite (harness root cause known).
- Renderer tsc: PASS.
- Electron tsc: PASS.
- Renderer production build: PASS after clearing Vite cache (1912 modules).
- Full suite: RED only because of `tests/electron/database.test.ts`.
- Windows installer: NOT VERIFIED.
- Git: one historical commit; no remote configured. Do not commit/push without explicit request.

### Verified commands

```powershell
npx tsc -p electron/tsconfig.json --noEmit
npx tsc -p tsconfig.json --noEmit
npx vitest run tests/electron/terminalSecurity.test.ts tests/electron/securityPolicy.test.ts tests/electron/dataTransferValidation.test.ts tests/electron/secretBoundary.test.ts
npm run build:renderer
```

---

## 4. Prompt coverage map

Every user program is captured here. Only the current release gate is active.

| Prompt family | Intent | Status | Where it lives |
|---|---|---|---|
| Product foundation + architecture review | Build the local-first workspace, review all subsystems, produce roadmap | **Done** | `docs/ARCHITECTURE.md`, `docs/PRODUCT_REVIEW.md`, `docs/PRODUCT_ROADMAP.md` |
| Brand identity + UI recalibration | Fluxora naming, visual system, component polish | **Done** | `src/components/brand/`, `docs/DESIGN_SYSTEM.md` |
| Command palette + global search | `Ctrl+K` navigation, search across chats/projects/prompts/memory/settings | **Done** | `src/components/command/`, `src/lib/globalSearch.tsx` |
| Workspace intelligence (P5) | Indexing, recommendations, timeline, developer profile | **Done** | `docs/WORKSPACE_INTELLIGENCE.md`, `electron/services/workspaceIntelligence.ts` |
| Memory + Project Brain + Mission Control | Local memory, brain insights, dashboard recommendations | **Done** | `docs/MEMORY_SYSTEM.md`, `docs/PROJECT_BRAIN.md` |
| Settings persistence + lifecycle | Window state, restore behavior, provider/model persistence, graceful errors | **Done** | `src/stores/settingsStore.ts`, `electron/main.ts` |
| RC-1 / RC-2 security hardening | Filesystem containment + terminal execution hardening | **Done** | `docs/SECURITY.md` |
| Productization + one milestone | Audit all subsystems, roadmap, select one high-value milestone, implement, validate, report | **Done (C1)** | `docs/PRODUCT_REVIEW.md`, `docs/PRODUCT_ROADMAP.md`, `docs/milestones/TRUSTED_DATA_SECRET_BOUNDARY.md` |
| C1 Trusted Data & Secret Boundary | Secrets + backup/restore + import/export + lifecycle | **Done** | Electron secrets/database/ipc/main + Settings UI + 24 tests |
| Release Gate V1 | Production release engineering: audit, DB green, CI, packaging, clean machine, crash recovery, performance, security, docs, final report | **Active** | Sections 5–10 below |
| PHOENIX production engineering | Freeze, audit, backlog, improve one at a time until commercial quality | **Same as Release Gate V1** | This plan |
| TITAN platform maturity | Deferred speculative platform | **Deferred** | Section 12 |
| HELIOS autonomous orchestration | Deferred speculative platform | **Deferred** | Section 12 |
| OMEGA engineering platform | Deferred speculative platform | **Deferred** | Section 12 |
| GENESIS visual workflow engine | Deferred speculative platform | **Deferred** | Section 12 |
| ATLAS multi-agent collaboration | Deferred speculative platform | **Deferred** | Section 12 |
| NOVA plugin SDK + MCP host | Deferred speculative platform | **Deferred** | Section 12 |
| NEXUS cloud sync + collaboration | Deferred speculative platform | **Deferred** | Section 12 |
| INFINITY knowledge graph | Deferred speculative platform | **Deferred** | Section 12 |
| QUANTUM research/self-improvement | Deferred speculative platform | **Deferred** | Section 12 |
| AETHER enterprise knowledge OS | Deferred speculative platform | **Deferred** | Section 12 |
| SINGULARITY AI OS kernel | Deferred speculative platform | **Deferred** | Section 12 |

**Coverage audit:** the table covers every distinct project program in the recorded history. Earlier implementation prompts are complete product-delivery work; they are not open release tasks. The only active program is Release Gate V1. PHOENIX maps to the same release gate. All named speculative platforms are explicitly deferred. If a new prompt appears later, add it here before changing scope.

Future programs are not rejected. They are gated behind a stable, shippable foundation.

---

## 5. Release Gate V1 — active task board

### Phase 1 — Release audit

| Task | Status | Evidence / next |
|---|---|---|
| Audit architecture, security, data, UX, platform | **Done** | `docs/PRODUCT_REVIEW.md` |
| Produce prioritized roadmap | **Done** | `docs/PRODUCT_ROADMAP.md` |
| Verify C1 release blockers closed | **Done** | C1 milestone doc + tests |
| Verify database failure root cause | **Done** | `node:sqlite` unsupported by Vitest 2/Vite 5/Electron 28 |
| Confirm remaining release blockers | **In progress** | Packaging, CI, DB harness, clean-machine smoke |

### Phase 2 — Database harness green (DONE)

**Owner:** next agent
**Priority:** P0
**Goal:** full suite green with production database code.
**Result:** Complete. `initDatabase(databasePath?)` added; tests use production migrations on a temp DB; 297/297 tests pass; both typechecks and production build pass.

Root cause:

- `tests/electron/database.test.ts` imports `node:sqlite`; Vitest 2/Vite 5 strips `node:` and cannot resolve it. Electron 28 uses Node 18, which does not support `node:sqlite`.
- The test recreates a 12-table synthetic schema, so even a green run would not validate production migrations (production currently has 15 tables).

Correct fix:

1. Add injectable database path to `electron/database/index.ts`:
   - `initDatabase(dbPath?: string)` uses the provided path or the default `ensureDataDir()/aiworkspace.db`.
   - Keep `getDb`, `run`, `all`, `get`, `transaction`, `closeDatabase` behavior.
2. Rewrite `tests/electron/database.test.ts` to:
   - Create a temporary DB file under `os.tmpdir()`.
   - Call production `initDatabase(tempPath)`.
   - Assert production tables exist (including `secret_records`, terminal history, sessions, etc.).
   - Exercise settings, providers, workspaces, chats, messages, memories, prompts, usage, project brain, workspace index, terminal history.
   - Verify the real migration set, not a copy.
   - Clean up with `closeDatabase()` and delete temp files.
3. Do not skip, suppress, or weaken assertions.
4. Run:
   ```powershell
   npx vitest run tests/electron/database.test.ts
   npx vitest run
   ```
5. Update `PROJECT_STATE.md` and this task board.

Acceptance:

- Database suite PASS.
- Full suite PASS.
- Electron tsc PASS.
- No test schema duplication remains.

### Phase 3 — CI (DONE)

**Result:** `.github/workflows/ci.yml` created with Windows, Node 20, `npm ci`, both typechecks, full tests, build, and artifact upload. First GitHub Actions run passed (`41855224190`, 2m 6s).

Create `.github/workflows/ci.yml`:

- Trigger: push + pull_request.
- Node 20 (not host Node 25), npm cache.
- `npm ci`.
- Electron tsc.
- Renderer tsc.
- `npm test` (full suite).
- `npm run build` (Electron + renderer).
- Upload build artifacts/logs.
- Fail fast; readable step names.
- No secrets required.

Optional separate `release.yml` for Windows packaging; signing secrets are environment-dependent and must not be fabricated.

Acceptance:

- Workflow is syntactically valid.
- Local equivalent commands pass.
- Document that CI execution requires a remote and will be verified by the user/next agent.

### Phase 4 — Packaging (DONE — unsigned, signing BLOCKED)

**Result:** Complete. `npm run electron:build` produces `Fluxora-Setup-1.0.0.exe`
(104.9 MiB) and `Fluxora-Portable-1.0.0.exe` (104.7 MiB). Two real defects were
found by inspecting a `--dir` package before the release build and then fixed:

1. `node_sqlite3.node` was inside `app.asar`, so the packaged app could not load
   its database driver. Fixed with `asarUnpack: ["node_modules/sqlite3/**"]`.
2. `Fluxora.exe` carried Electron identity (`ProductName=Electron`,
   `CompanyName=GitHub, Inc.`) because `signAndEditExecutable: false` disabled
   rcedit. Fixed by setting it to `true`; this stamps version resources and the
   icon and performs no signing without a certificate.

`npmRebuild: false` was retained deliberately: `sqlite3` 5.1.7 is an N-API addon,
so no Electron ABI rebuild is required. The packaged app created a 15-table
database on first launch, which proves the addon loads.

Build prerequisite discovered: electron-builder's `winCodeSign` archive contains
macOS symlinks that 7-Zip cannot create without Developer Mode or elevation. The
build needs Developer Mode, an elevated first build, or a pre-seeded Windows-only
cache. See `docs/RELEASE_GATE_EVIDENCE.md` for the exact command.

Signing is **BLOCKED**: no certificate exists, all artifacts report `NotSigned`.

Acceptance (met):

- [x] `npm run electron:build` produces installer + portable.
- [x] No stale `groq-debug.js` in package.
- [x] Artifact metadata, version and icon verified.
- [x] Native sqlite3 packaged and proven loadable at runtime.
- [x] Signing status explicitly reported.

### Phase 5 — Clean-machine validation

Not fully possible inside this environment. Prepare and document a repeatable manual/CI procedure:

- Fresh Windows VM or clean user profile.
- Install, launch, onboarding, provider setup, chat, workspace create/index, Mission Control, Brain, Smart Context, memory, prompts, backup, restore, settings, restart, update.
- Capture screenshots/logs.
- Record pass/fail per step.

Acceptance:

- Procedure documented in `docs/INSTALLATION.md` / `docs/TESTING.md`.
- Local smoke test performed where possible.
- Any unverified step labeled NOT VERIFIED.

### Phase 6 — Crash recovery

Audit and test:

- Unexpected shutdown, WAL recovery, corrupt DB, missing workspace path, missing provider, invalid settings JSON, broken backup, interrupted restore, missing renderer assets, renderer crash, main-process unresponsive.

Fix only verified gaps, with tests where feasible. Do not invent systems.

### Phase 7 — Performance measurement

Create a repeatable benchmark script/report:

- Main-process boot to window-ready.
- Renderer startup.
- DB open.
- Workspace index (small/medium fixture).
- Global search.
- Smart Context assembly.
- Mission Control load.
- Memory/CPU idle + active.
- Renderer bundle sizes.
- IPC round-trip and streaming latency.

Output: `docs/PERFORMANCE.md` with measurements, hardware, method, and regressions. No guessed numbers.

### Phase 8 — Security re-audit

Verify no regressions in:

- Filesystem containment and symlink handling.
- Secret vault, export/import, backup/restore.
- IPC sender/payload validation gaps.
- Terminal parser/approval/output limits.
- Electron window hardening.
- Workspace isolation.
- Dependency vulnerabilities (`npm audit`).

Output: security section in final release report; update `docs/SECURITY.md`.

### Phase 9 — Documentation

Update exactly:

- `PROJECT_STATE.md`
- `CHANGELOG.md` (create accurate current changelog)
- `README.md`
- `docs/PRODUCT_REVIEW.md`
- `docs/PRODUCT_ROADMAP.md`
- `docs/SECURITY.md`
- `docs/DATABASE.md`
- `docs/ARCHITECTURE.md`
- `docs/INSTALLATION.md` (new)
- `docs/BUILD.md` (new)
- `docs/RELEASE_NOTES.md` (new)
- `docs/TESTING.md` (new)
- `docs/KNOWN_ISSUES.md` (new)

### Phase 10 — Final release report

Required fields:

- Architecture summary
- Security summary
- Performance summary
- Testing summary
- Packaging summary
- Known issues
- Resolved vs deferred risks
- Commercial / engineering / production readiness
- LOC, files, components, services, IPC handlers, tables, coverage, technical debt
- Release gate pass/fail table
- Exact next recommendation

---

## 6. Phase dependency order

```
Phase 2 DB green
  → Phase 3 CI
  → Phase 4 Packaging
  → Phase 5 Clean-machine procedure
  → Phase 6 Crash recovery
  → Phase 7 Performance
  → Phase 8 Security re-audit
  → Phase 9 Docs
  → Phase 10 Final report
```

Phases 2, 3 and 4 are complete. Phase 5 (clean-machine validation) is next; packaging is verified and must not be redone. Do not start platform programs.

---

## 7. Known issues and gotchas

| Issue | Severity | Status | Notes |
|---|---|---|---|
| Database suite | P0 | Fixed | Production `sqlite3` harness; 297/297 pass |
| CI | P0 | PASS | GitHub Actions run 41855224190 |
| Windows installer unverified | P0 | Fixed | Phase 4 PASS; installer + portable verified, app launches with 15-table DB |
| No code signing certificate | Blocker | External | All artifacts `NotSigned`; documented, never faked |
| winCodeSign cache needs symlink privilege | Medium | Mitigation | Developer Mode, elevated first build, or pre-seeded Windows-only cache |
| Package size ~105 MiB; ships `node-gyp`, `node-pre-gyp`, unused `sharp` | Low | Deferred | Phase 9/10 trimming |
| Portable build stores data in `userData` (portable root not detected) | Medium | Deferred | Product behavior, out of Phase 4 scope |
| No clean-machine test | High | Environmental | Document procedure; local smoke where possible |
| `electron:dev` lacks `VITE_DEV_SERVER_URL` | High | Pending | Use built renderer + `start`, or fix script |
| Terminal approvals in memory / 8h sessions | Medium | Accepted | C1 not in scope |
| Filesystem symlink/hard-link race | Medium | Accepted | Phase 6/8 candidate |
| Workspace index stops at 401 files | High | Deferred | H2 |
| Chat scope/attachment contract bugs | High | Deferred | C3/H7 |
| Timeline table split (`workspace_intelligence_timeline` vs `intelligence_timeline`) | High | Deferred | H1 |
| Test coverage beyond critical paths | Medium | Ongoing | Add during Phases 6–8 |
| OneDrive slow builds | Environmental | Mitigation | Clear Vite cache; 600s timeout |
| Docs drift | Medium | Ongoing | Phase 9 |
| Historical reports clutter | Low | Cleanup | Archived now |

---

## 8. New-agent onboarding

### Architecture map

- `electron/main.ts` — app lifecycle, window, single-instance lock
- `electron/database/` — SQLite connection, migrations, backup
- `electron/ipc/` — 15 IPC modules, ~143 handlers
- `electron/services/` — AI, secrets, terminal, intelligence, developer, brain, workspace
- `electron/preload.ts` — typed bridge
- `src/components/` — 43 UI components
- `src/stores/` — 9 Zustand stores
- `src/lib/` — context builder, search, intelligence, navigation

### Commands

```powershell
npm install
npx tsc -p electron/tsconfig.json --noEmit
npx tsc -p tsconfig.json --noEmit
npx vitest run
npm run build:renderer
npm run build
npm run electron:build
```

### Environment

- Windows 10/11, PowerShell 5.1.
- Repo on OneDrive; builds can stall. Clear `node_modules/.vite` and retry with 600s timeout.
- Electron 28 / Node 18 target. Host Node may be newer; do not use APIs unavailable in Node 18/Electron 28.
- `sqlite3` is the production driver. Do not import `node:sqlite`.
- `npmRebuild` and code signing are unresolved packaging concerns.

### Continue here

**Immediate next task:** Phase 5 — clean-machine validation. Write a repeatable install/launch/feature procedure for a fresh Windows VM or clean profile, run the parts that are possible locally, and mark every untested step `NOT VERIFIED`. Use the verified artifacts in `release/` (see `docs/RELEASE_GATE_EVIDENCE.md`). Do not redo packaging; it is green and unsigned by design.

Do not start platform programs.

---

## 9. Definition of done for Release Gate V1

- [ ] Full test suite green, including real database migrations.
- [ ] Electron and renderer TypeScript green.
- [ ] Production build green.
- [ ] CI workflow present and locally equivalent commands pass.
- [ ] Windows installer + portable produced and inspected.
- [ ] Native module rebuild verified.
- [ ] Clean-machine procedure executed or explicitly marked unverified with evidence.
- [ ] Crash-recovery paths audited.
- [ ] Performance report measured, not guessed.
- [ ] Security re-audit complete.
- [ ] All Phase 9 docs updated.
- [ ] Final release report delivered.
- [ ] No speculative platform code added.

---

## 10. Progress log

| Date | Task | Result |
|---|---|---|
| 2026-11-03 | C1 Trusted Data & Secret Boundary | Complete; 24 new tests; 70 targeted pass |
| 2026-11-04 | Product review + roadmap | Complete |
| 2026-11-04 | Project cleanup + master plan | Complete; archive created; generated artifacts removed |
| 2026-11-04 | Agent efficiency guidance + start prompt | Complete; see Sections 13–14 and `docs/AGENT_START_PROMPT.md` |
| 2026-11-04 | Phase 2 database harness | Complete; production `sqlite3`, 297/297 pass, tsc/build pass |
| 2026-11-04 | Phase 3 CI | PASS; GitHub Actions run 41855224190 (2m 6s) |
| 2026-11-04 | Phase 4 Windows packaging | PASS (unsigned); installer 104.9 MiB + portable 104.7 MiB; sqlite3 unpacked and loadable; signing BLOCKED |
| Next | Phase 5 Clean-machine validation | Pending |

---

## 11. Deferred future programs (do not start)

| Program | Gate |
|---|---|
| TITAN platform maturity | Release Gate green + H1/H2 |
| HELIOS autonomous orchestration | Multi-agent foundation + approvals |
| OMEGA engineering platform | Release Gate + CI + observability |
| GENESIS visual workflow engine | Plugin/runtime foundation |
| ATLAS multi-agent collaboration | Persisted workflows + AI reliability |
| NOVA plugin SDK + MCP host | IPC trust boundary + capability model |
| NEXUS cloud sync/collaboration | Secret boundary + DB integrity + RBAC |
| INFINITY knowledge graph | Intelligence contract + search v2 |
| QUANTUM research engine | Analytics + usage accuracy |
| AETHER enterprise knowledge OS | Cloud sync + governance |
| SINGULARITY AI OS kernel | All of the above |

---

## 12. Archive policy

- Historical reports live in `docs/archive/`.
- Never treat an archived file as current truth.
- Keep root minimal: `README.md`, `LICENSE`, `.env.example`, `PROJECT_STATE.md`, `PROJECT_PLAN.md`.
- Keep canonical docs in `docs/`.
- Delete generated artifacts (`dist/`, `dist-electron/`, `release/`, `*.tsbuildinfo`) before handoff.

---

## 13. Agent efficiency recommendations

These are mandatory operating habits, not suggestions.

### Session discipline

1. **Do not re-audit the whole repo.** Read `PROJECT_PLAN.md`, `PROJECT_STATE.md`, `docs/PRODUCT_REVIEW.md`, and the current phase’s files. That is enough to start.
2. **Work one phase at a time.** Do not interleave DB tests, CI, packaging, and docs. Finish the acceptance criteria for the current phase first.
3. **Use the smallest verification loop.** Run the targeted test file while developing; run the full suite only after the targeted test passes.
4. **Keep an evidence log.** Append every command, pass/fail result, artifact path, and environmental limitation to `docs/RELEASE_GATE_EVIDENCE.md`.
5. **Batch context reads.** Read related files and search for symbols in parallel. Do not read generated bundles or `node_modules`.
6. **Do not rebuild repeatedly.** Clear `node_modules/.vite` once if Vite stalls, then use a 600s timeout. Do not run build and full tests at the same time on this OneDrive workspace.
7. **Protect user data.** Tests must use `os.tmpdir()` databases. Never point tests at `%APPDATA%` or the real `aiworkspace.db`. Back up before any destructive migration or restore test.
8. **Keep changes surgical.** No drive-by refactors, formatting churn, dependency upgrades, or UI redesign during Release Gate V1.
9. **Report blockers immediately.** If a step needs a remote, certificate, VM, or network that is unavailable, document exact evidence and move only to an unblocked phase.
10. **Do not commit or push unless explicitly asked.** The user owns that decision.

### Technical recommendations

1. **Database:** add `initDatabase(dbPath?: string)` and reuse the existing migration runner. Export or refactor only what the test needs. Ensure `closeDatabase()` closes the handle and clean up `-wal`/`-shm` sidecars in the temp directory.
2. **Tests:** assert real tables and real migrations, including `secret_records`, terminal history, sessions, and all 15 production tables. Do not keep a synthetic schema.
3. **CI:** use Node 20 for tooling, `npm ci`, dependency caching, explicit named steps, and no fabricated secrets. Target Electron 28/Node 18 runtime compatibility in code.
4. **Packaging:** verify `appId`, `productName`, version, icons, NSIS + portable targets, `asarUnpack` for native modules, and native rebuild. Inspect the artifact; do not assume success from exit code alone.
5. **Clean machine:** prefer Windows Sandbox or a fresh VM/profile. If unavailable, document a step-by-step procedure and mark every untested step `NOT VERIFIED`.
6. **Crash recovery:** test corrupt DB, missing workspace, malformed settings, interrupted restore, and broken backup. Fail closed with a user-visible recovery path; never silently overwrite.
7. **Performance:** record hardware, fixture size, method, and repeat count. Report real measurements only; label anything estimated.
8. **Security:** re-run adversarial path checks, IPC payload validation, secret scans, and `npm audit --omit=dev`. Confirm no C1/RC-1/RC-2 regressions.
9. **Documentation:** update docs only after verification. Remove stale claims instead of adding parallel docs. Keep one canonical file per topic.
10. **Identity:** do not rename the package, database, or app-data directory during the release gate. Document the legacy `ai-workspace`/`aiworkspace.db` mapping; rename only with a tested migration.

### Stop conditions

Stop and report, rather than guess, if:

- A fix would require deleting/migrating real user data.
- A required credential, signing certificate, remote, or clean VM is unavailable.
- Tests fail for a new reason that cannot be root-caused quickly.
- A change would expand product scope or start a deferred platform.

---

## 14. Start prompt for the next agent

The complete copy-paste prompt is in `docs/AGENT_START_PROMPT.md`. It instructs the agent to read the canonical files, execute Phase 2 immediately, verify with evidence, then continue through Phases 3–10 in order.

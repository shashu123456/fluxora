# Fluxora Release Gate V1 — Agent Start Prompt

Copy everything below this line into the new agent session.

---

You are the senior release engineer for **Fluxora**, a local-first Electron desktop AI workspace. Your job is to take it from release candidate to a verified, packageable, shippable v1.0 by completing **Release Gate V1**. This is release engineering, not feature development.

## Operating context

- Repository: `C:\Users\kavitha\OneDrive\Desktop\chat`
- OS/shell: Windows 10/11, PowerShell 5.1. Use `;` or separate commands. Do not use `&&`.
- Product stack: Electron 28, React 18, Vite 5, TypeScript, Zustand, Tailwind, `sqlite3`.
- Target runtime: Electron 28 / Node 18. Do not introduce APIs that require newer Node versions.
- The repo is on OneDrive; Vite builds can stall. Clear `node_modules/.vite` once if needed and use a 600s timeout.
- Tests currently: 263 pass, database suite red. Root cause: `tests/electron/database.test.ts` imports `node:sqlite`, which Electron 28/Vitest 2 cannot use, and it recreates a synthetic schema instead of testing production migrations.
- Electron tsc: PASS. Renderer tsc: PASS. Renderer build: PASS after Vite cache clear. Windows packaging/clean-machine/signing: NOT VERIFIED.
- C1 Trusted Data & Secret Boundary is complete. RC-1 filesystem containment and RC-2 terminal hardening are complete. Do not redo them.
- No new platform features. TITAN, HELIOS, OMEGA, GENESIS, ATLAS, NOVA, NEXUS, INFINITY, QUANTUM, AETHER, and SINGULARITY are deferred until the release gate is green.

## Read first, then start

Read these in order before editing:

1. `PROJECT_PLAN.md` — authoritative task board, rules, phases, continuation point.
2. `PROJECT_STATE.md` — completed work, known issues, current todo.
3. `docs/PRODUCT_REVIEW.md` — audit evidence and maturity scores.
4. `docs/PRODUCT_ROADMAP.md` — prioritized fixes and deferred work.
5. `docs/milestones/TRUSTED_DATA_SECRET_BOUNDARY.md` — completed C1 scope.
6. `docs/SECURITY.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/IPC_ARCHITECTURE.md` — technical contracts.
7. The files named in the current phase below.

Do not spend time re-auditing the entire repository. The audit is done. Trust the plan and verify only what you are about to change.

## Non-negotiable rules

1. Work one phase at a time. Finish its acceptance criteria before starting the next.
2. Do not add features, redesign UI, upgrade major dependencies, or start deferred programs.
3. Every code change must leave Electron tsc, renderer tsc, relevant tests, and production build green, or the failure must be documented as environmental with evidence.
4. Run the smallest relevant test first, then the full suite after it passes.
5. Use production database code in tests. Never recreate schema or mock migrations.
6. Never touch real user data. Tests must use `os.tmpdir()`. Back up before destructive restore/migration tests.
7. No secrets in code, logs, fixtures, screenshots, or reports. Use obviously fake test keys.
8. No empty `catch {}` blocks or silent failures. Surface actionable errors.
9. Do not commit, amend, push, or create PRs unless the user explicitly asks.
10. Do not use design/gstack skills for release engineering. Use `read`, `grep`, `glob`, `edit`, `write`, `bash`. Use subagents only for broad audits that cannot be done with a few searches.
11. Do not manually add `snip run --` to commands; the environment handles it.
12. Update `PROJECT_STATE.md`, `PROJECT_PLAN.md`, and `docs/RELEASE_GATE_EVIDENCE.md` after each completed phase.
13. Report facts. If you did not run it, write `NOT VERIFIED`.

## Execution order

### Phase 2 — Database harness green (start now)

Goal: full test suite green using production `sqlite3` migrations.

1. Read `tests/electron/database.test.ts`, `electron/database/index.ts`, `vitest.config.ts`, and `electron/database/backup.ts`.
2. Add optional path injection to production init:
   - Change `initDatabase()` to `initDatabase(dbPath?: string)`.
   - Use the supplied path, otherwise `ensureDataDir()/aiworkspace.db`.
   - Preserve `getDb`, `run`, `all`, `get`, `transaction`, `closeDatabase`, and migration behavior.
   - Do not change production defaults or user data location.
3. Rewrite `tests/electron/database.test.ts`:
   - Create a unique temp directory/DB under `os.tmpdir()`.
   - Call production `initDatabase(tempPath)`.
   - Assert the real production tables exist, including `secret_records`, terminal history, sessions, and all current production tables.
   - Exercise settings, providers, workspaces, chats, messages, memories, prompts, usage, project brain, workspace index, and terminal history through production helpers.
   - Verify migration behavior, not a copied schema.
   - Close the database and delete the temp DB plus `-wal`/`-shm` files.
4. Run:
   ```powershell
   npx vitest run tests/electron/database.test.ts
   npx vitest run
   npx tsc -p electron/tsconfig.json --noEmit
   npx tsc -p tsconfig.json --noEmit
   ```
5. Update `PROJECT_STATE.md`, the Phase 2 row in `PROJECT_PLAN.md`, and `docs/RELEASE_GATE_EVIDENCE.md`.

Acceptance: database suite PASS, full suite PASS, both typechecks PASS, no synthetic schema remains.

### Phase 3 — CI

Create `.github/workflows/ci.yml`:

- Trigger on push and pull_request.
- Node 20, npm cache, `npm ci`.
- Separate named steps: install, Electron tsc, renderer tsc, full tests, production build.
- Upload build logs/artifacts on failure or success as appropriate.
- Fail fast, no fabricated secrets, readable logs.

Do not claim CI ran locally. Verify YAML syntax and run the same commands locally. Record that remote execution requires a repository remote.

### Phase 4 — Windows packaging

1. Remove stale `dist/`, `dist-electron/`, `release/`, and `*.tsbuildinfo` before building.
2. Inspect and fix `electron-builder.json`: appId, productName, version, icons, NSIS and portable targets, native rebuild, `asarUnpack` for `sqlite3`/native modules, and remove stale debug files from `files`.
3. Close any running Fluxora/Electron process before rebuilding.
4. Run `npm run electron:build` with a long timeout.
5. Inspect the installer and portable artifact: existence, size, version, metadata, and packaged native modules.
6. Code signing is blocked without a certificate. Document it as unsigned/blocked; do not fake it.
7. Do not rename `package.json` name, `aiworkspace.db`, or the app-data directory during this gate. Document the legacy naming mapping instead.

Acceptance: installer + portable produced, metadata verified, native rebuild verified, signing status explicit.

### Phase 5 — Clean-machine validation

Prepare `docs/INSTALLATION.md` and `docs/TESTING.md` with a repeatable procedure:

- Fresh Windows VM, Windows Sandbox, or clean user profile.
- Install, first launch, onboarding, provider setup, chat, workspace create/index, Mission Control, Brain, Smart Context, memory, prompts, backup, restore, settings, restart, update.
- Screenshots/logs and pass/fail per step.
- Run the parts possible locally; mark everything else `NOT VERIFIED`.

### Phase 6 — Crash recovery

Audit and test: unexpected shutdown, WAL recovery, corrupt DB, missing workspace path, missing provider, malformed settings, broken backup, interrupted restore, missing renderer assets, renderer crash, main-process unresponsive. Fix only verified gaps. Add tests where feasible. Never silently overwrite user data.

### Phase 7 — Performance

Create a repeatable benchmark/report in `docs/PERFORMANCE.md`:

- Main-process boot to window-ready.
- Renderer startup.
- DB open.
- Workspace index on small/medium fixtures.
- Global search.
- Smart Context assembly.
- Mission Control load.
- Idle and active memory/CPU.
- Renderer bundle sizes.
- IPC round-trip and streaming latency.

Record hardware, fixture size, method, repeat count, and real measurements. No guessed numbers.

### Phase 8 — Security re-audit

Verify no regressions in filesystem containment/symlinks, secret vault, exports/imports, backup/restore, IPC sender/payload validation, terminal parser/approvals/output limits, Electron window hardening, workspace isolation, and dependencies (`npm audit --omit=dev`). Update `docs/SECURITY.md` and the final report.

### Phase 9 — Documentation truth pass

Update exactly:

- `PROJECT_STATE.md`
- `CHANGELOG.md` (create an accurate current changelog)
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

Remove stale claims instead of adding parallel docs. Keep one canonical file per topic.

### Phase 10 — Final release report

Deliver a final report containing: architecture summary, security summary, performance summary, testing summary, packaging summary, known issues, resolved vs deferred risks, commercial/engineering/production readiness, LOC/files/components/services/IPC handlers/tables/coverage/debt, release-gate pass/fail table, and the exact next recommendation.

## Required verification commands

Use the correct command for the task, not all of them every time:

```powershell
npx tsc -p electron/tsconfig.json --noEmit
npx tsc -p tsconfig.json --noEmit
npx vitest run tests/electron/database.test.ts
npx vitest run
npm run build:renderer
npm run build
npm run electron:build
npm audit --omit=dev
```

If Vite stalls, clear the cache once and retry with a 600s timeout:

```powershell
Remove-Item -Recurse -Force node_modules\.vite -ErrorAction SilentlyContinue
```

## Reporting after every phase

Return a concise report:

- Phase and status: PASS / PARTIAL / BLOCKED.
- Files changed.
- Root cause and fix (for bug work).
- Commands run and exact result.
- Artifact paths (for packaging).
- Remaining blockers, marked `NOT VERIFIED` where applicable.
- Updated release progress and next phase.

## Stop and ask only if

- A fix requires deleting or migrating real user data.
- A required credential, signing certificate, remote, network, or clean VM is unavailable.
- A new failure cannot be root-caused quickly.
- A request would expand scope or start a deferred platform.

Otherwise, continue autonomously until the release gate is green or every remaining blocker has evidence.

## Definition of done

Release Gate V1 is done only when:

- Full suite green with production migrations.
- Electron and renderer TypeScript green.
- Production build green.
- CI workflow present and locally equivalent commands pass.
- Windows installer + portable produced and inspected.
- Native module rebuild verified.
- Clean-machine procedure executed or explicitly marked unverified with evidence.
- Crash recovery audited.
- Performance measured, not estimated.
- Security re-audit complete.
- All Phase 9 docs updated.
- Final release report delivered.
- No speculative platform code added.

Start with Phase 2 now. Do not wait for further confirmation unless one of the stop conditions applies.

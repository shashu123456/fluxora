# Fluxora Product & Architecture Review

**Date:** 2026-11-02
**Scope:** Full codebase, Version 1.0 release candidate
**Verdict:** Strong local-first product architecture with unusually good UI discipline and terminal hardening. Not yet commercially shippable. Release blockers are concentrated in data integrity, secret handling, lifecycle safety, and a red release gate.

## Scorecard

| Dimension | Score | Verdict |
|---|---:|---|
| Engineering maturity | 58 / 100 | Credible power-user beta |
| Commercial readiness | 35 / 100 | Not shippable |
| Renderer / UX | 68 / 100 | Premium feel, still monolithic in places |
| Backend / main process | 48 / 100 | Good containment, unsafe data paths |
| Intelligence systems | 55 / 100 | Useful but fragmented contracts |
| Test & release platform | 42 / 100 | Red suite, no CI, unsigned installer |

## Measured surface

- 132 TypeScript/TSX source files, ~24,971 LOC
- 73 renderer files / ~14,810 LOC; 59 Electron files / ~10,161 LOC
- 43 components, 9 Zustand stores, 35 Electron services, 15 IPC modules
- 140 IPC handlers, 15 database tables, 20 indexes
- 16 test files, ~2,533 LOC, 274 cases; 263 passing, database suite red
- 13 documentation files (~8.3k words); 12 root working reports (~23.4k words)
- 37 runtime dependencies, 23 dev dependencies

## Subsystem review

| Subsystem | Maturity | Production readiness | Core strength | Primary weakness |
|---|---:|---|---|---|
| App shell & navigation | 82 | Ready | Lazy routes, error boundary, keyboard nav | Shortcuts can fire while typing |
| Chat | 68 | Beta | Streaming, attachments, provider recovery | 729-line view; global/workspace chat scope mismatch |
| Workspace / Coding Agent | 64 | Beta | File tree, terminal, git, brain in one workflow | Broken typed attachment handoff; 925-line view |
| Mission Control | 67 | Beta | Single intelligence owner, evidence-led risks | Silent failures; no indexing progress; timeline contract broken |
| Settings / Providers | 61 | Beta | Broad provider + diagnostics control | 1,147-line view; secret/export UX incomplete |
| Memory / Prompts / Search | 72 | Beta | Shared search taxonomy, good empty states | Memory scope leak; search is full-table scan |
| Visualizations | 66 | Beta | Dependency-light SVG, shared intelligence | No graph virtualization or node guard |
| UI primitives / design system | 78 | Ready | Coherent Radix + token system | Tiny type sizes; icon-only destructive actions |
| State management | 71 | Beta | Small purpose-specific stores | Direct `window.api` calls; swallowed errors |
| Styling | 76 | Ready | Strong tokens, themes, surfaces | 798-line global CSS blends tokens and page styles |
| Main lifecycle | 55 | Beta | Hardened windows, crash handling | No single-instance lock; init/close ordering |
| IPC surface | 45 | Not ready | Typed preload, parameterized SQL | No sender validation; 140-handler surface; broad `any` |
| Database | 45 | Not ready | WAL, indexes, additive migrations | No migration versions/FKs; unsafe transaction wrapper |
| Providers / AI | 55 | Beta | Clean adapters, streaming, capability probing | Duplicated mapping; no timeouts/retry; abort reported as success |
| Secret management | 50 | Not ready | Vault with OS/AES modes, fingerprints, metadata | RC-3 incomplete; reversible legacy path; no rotation/export UX |
| Terminal | 70 | Beta | Strict parser, containment, approvals, redaction | Approval-gated not sandboxed; in-memory approvals |
| Settings / export-import | 35 | Not ready | Simple JSON portability | Unvalidated import; incomplete export; plaintext key path |
| Security policy | 72 | Good | Canonical containment, CSP, blocklists | Policy helpers unused in production paths; no sender checks |
| Backup / restore | 20 | Not ready | Basic file copy | Live-WAL copy, overwrite without integrity check, no relaunch |
| Packaging / release | 30 | Not shippable | NSIS + portable config exists | Unsigned, no native rebuild, stale artifacts, no CI/CD |
| Workspace indexer | 48 | Beta | Broad ecosystem detection | Hard 401-file stop corrupts counts; sync main-thread walk |
| Project Brain | 55 | Beta | Deterministic sections, evidence | N+1 writes; duplicated insight logic; no incremental sync |
| Developer learning | 45 | Beta | Local-only, bounded events | Shape bugs; heavy profile refresh; silent prompt injection |
| Smart Context | 68 | Beta | Budgeted, ranked, degrades gracefully | Sequential IPC; prompt-injection surface; 489-line monolith |
| Recommendation engine | 60 | Beta | Auditable why/impact, affinity | Actions not executable; accept/ignore signals biased |
| AI orchestrator / workflow | 62 | Beta | Pure, tested state machine | Heuristic only; workflow not persisted |

## What is genuinely strong

1. **Workspace-first product model.** Intelligence, brain, terminal, chat, and memory all share a workspace scope and a single renderer intelligence owner.
2. **Terminal hardening.** Strict parser, metacharacter rejection, workspace-only cwd, main-process approvals bound to a command hash, bounded/redacted output, and process-tree cancellation.
3. **Design-system coherence.** Lazy route loading, a shared navigation model, consistent primitives, and a clear dark/light token system.
4. **Local-first privacy posture.** No required cloud account, in-process analysis, local SQLite, and explicit AI provider configuration.
5. **Documentation depth.** Architecture, IPC, database, memory, brain, providers, and security are documented in-repo.

## What blocks a commercial release

### Critical

1. **Backup/restore can destroy data.** Copying a live WAL database without `-wal`/`-shm`, overwriting without integrity checks, and restoring without relaunching is a data-loss path.
2. **The secret/import boundary is not trustworthy.** Exports omit secrets, imports can write plaintext provider keys, and backups can carry sealed secret rows whose vault key lives elsewhere.
3. **RC-3 is visibly incomplete.** Legacy plaintext fallback still exists; metadata/rotation IPC and UI are absent; validation is not network-backed.
4. **No single-instance lock.** Two app instances can race the same SQLite database and backup timer.

### High

5. Main process starts secret migration before awaiting database init; close is not awaited.
6. Transactions share one connection without serialization.
7. IPC has no sender-frame or payload validation; destructive capabilities are broad.
8. Recommendation and provider code read legacy `api_key` columns in places.
9. Secret rotation is blocked by self-fingerprint collision.
10. Native packaging is unverified (`npmRebuild: false`, Electron 28 EOL, unsigned installer).
11. Test gate is red: the database suite imports `node:sqlite`, which Electron 28 / Vitest 2 cannot resolve, and it tests a synthetic schema rather than production migrations.
12. Workspace index stops at 401 files and breaks counts for real repositories.
13. Chat and memory have workspace-scope leaks.
14. Timeline writes and reads use different table names, so “what changed” briefing evidence is always empty.
15. Attachment handoff between Agent Workflow and Workspace is a string/object mismatch hidden behind `as any`.

## Most important cross-cutting findings

- **Correctness debt is larger than feature debt.** The product already has enough surface area; the highest-value work is making existing flows trustworthy.
- **Silent failure is systemic.** `catch {}` in intelligence, search, brain, stores, and context assembly turns backend failures into “no data”, which is worse than an explicit error.
- **The release gate does not exist.** No CI, no clean native rebuild, no signed build, no installer smoke test, and a red database suite.
- **The security story is asymmetric.** Terminal is the strongest subsystem; secret and backup paths are the weakest.
- **Architecture is extensible but duplicated.** Provider mapping, provider SSE parsing, insight scoring, timeline events, tokenization, and memory CRUD all have multiple owners.

## Production readiness by surface

| Surface | Ready for | Not ready for |
|---|---|---|
| Personal local use | Yes, with backups disabled | — |
| Power-user beta | Yes | Silent failures, scope leaks |
| Team / commercial distribution | No | Secrets, backup, packaging, CI |
| Enterprise | No | RBAC, audit retention, signed updates, policy controls |
| Plugin / MCP ecosystem | No | No implemented host contract |

## Recommended sequence

1. **Trusted Data & Secret Boundary** — fix backup/restore, complete RC-3, make exports/imports secret-safe, add lifecycle guards. This closes the two critical data/security risks.
2. **Release Gate v1** — green test suite, CI, clean native rebuild, signed Windows installer, clean-profile smoke test.
3. **Scope & Correctness Contract** — fix chat/memory scope, attachment contract, timeline table, index cap, and surface async errors.
4. **Intelligence Pipeline Unification** — one schema contract from index to briefing, one evolution path, cached/incremental analysis.
5. **IPC Trust Boundary** — sender validation, payload schemas, capability-tiered preload.
6. **AI Reliability & Cost** — timeouts, retry/backoff, abort semantics, pricing/usage accuracy.
7. **UX Polish & Accessibility** — onboarding, command palette focus management, settings decomposition, progress/error states.
8. **Extensibility** — plugin SDK and MCP host only after the above is stable.

## Evidence

Detailed file-and-line evidence lives in the milestone design and roadmap documents. The highest-risk paths are:

- `electron/database/backup.ts`
- `electron/ipc/settings.ts`
- `electron/security.ts`
- `electron/services/secrets/*`
- `electron/ipc/providers.ts`
- `electron/main.ts`
- `electron/database/index.ts`
- `electron/ipc/workspaceIndex.ts`
- `electron/services/developer/briefing.ts`
- `src/components/workspace/AgentWorkflow.tsx`
- `src/components/workspace/WorkspaceView.tsx`
- `src/components/memory/MemoryView.tsx`
- `src/components/chat/ChatView.tsx`

# Fluxora Product Roadmap

**Baseline:** Version 1.0 release candidate, 58/100 engineering maturity, 35/100 commercial readiness.
**Strategy:** Stabilize trust boundaries and the release gate before adding platform surface area.

## Critical — must close before any public release

| # | Milestone | Difficulty | Impact | Effort | Technical risk | Business value |
|---|---|---|---|---|---|---|
| C1 | **Trusted Data & Secret Boundary** (selected): safe SQLite backup/restore, complete secret vault boundary, metadata-only export/import, rotation metadata, single-instance/lifecycle guards | High | Critical | 3-4 days | Medium | Unlocks safe distribution; removes data-loss and key-exposure risk |
| C2 | **Release Gate v1**: green cross-runtime tests, CI, clean native rebuild, signed Windows installer, clean-profile smoke test | High | Critical | 2-3 days | Medium | Makes every future release reproducible and auditable |
| C3 | **Scope & Correctness Contract**: chat/memory/workspace scope resolution, typed attachment handoff, timeline table contract, index cap, visible async failures | Medium | High | 2-3 days | Low | Removes visible bugs and “empty despite failure” behavior |
| C4 | **IPC Trust Boundary**: sender/origin validation, runtime payload schemas, capability-tiered preload | High | High | 3-4 days | Medium | Reduces renderer-XSS blast radius; enterprise prerequisite |
| C5 | **Database Integrity**: migration version table, foreign keys/cascades, serialized transaction queue | Medium | High | 2 days | Medium | Prevents orphan rows and concurrent transaction corruption |

## High — release quality and product credibility

| # | Milestone | Difficulty | Impact | Effort | Risk | Value |
|---|---|---|---|---|---|---|
| H1 | Intelligence Pipeline Unification: one schema contract, one evolution path, cached incremental builds, timeline consistency | High | High | 3-4 days | Medium | Makes Mission Control truthful and fast |
| H2 | Workspace Indexer v2: async walk, no 401-file cap, incremental/watch updates, persisted reuse on workspace switch | High | High | 3 days | Medium | Correct analysis for real repositories |
| H3 | AI Reliability & Cost: request timeouts, retry/backoff, abort semantics, accurate usage/pricing, stream cleanup | Medium | High | 2-3 days | Medium | Fewer hangs and misleading billing |
| H4 | Settings & Onboarding Decomposition: split 1,147-line view, provider health/rotation UI, save/test states, zero-provider path | Medium | High | 3 days | Low | Converts setup friction into confidence |
| H5 | UX Truthfulness: shared error/loading/empty states, indexing progress, search failure states, brain retry | Medium | High | 2 days | Low | Stops silent failure from looking like empty data |
| H6 | Accessibility Pass: focus traps, `aria-activedescendant`, keyboard-reachable actions, contrast/type scale | Medium | Medium | 2 days | Low | Broadens usability; quality signal |
| H7 | Chat & Agent Reliability: message update/delete, attachment model, streamed Markdown throttling, persisted agent workflows | Medium | Medium | 3 days | Medium | Trustworthy daily-driver flows |
| H8 | Search v2: SQLite FTS5, incremental index, cancellation, snippet safety | High | Medium | 3 days | Medium | Instant search at scale |

## Medium — scalability and maintainability

| # | Milestone | Difficulty | Impact | Effort | Risk | Value |
|---|---|---|---|---|---|---|
| M1 | Provider Adapter Consolidation: one row mapper, one SSE parser, one capability model | Medium | Medium | 2 days | Low | Removes triplicated logic |
| M2 | Database off-main-thread worker or batched async access | High | Medium | 4 days | High | Keeps UI responsive under load |
| M3 | Developer Learning v2: correct profile shapes, incremental events, consent/controls, bounded analysis | Medium | Medium | 2-3 days | Medium | Personalization that is accurate and explainable |
| M4 | Memory Governance: retention, dedupe, consent, PII controls, scope-aware search | Medium | Medium | 2 days | Medium | Privacy credibility |
| M5 | Design System v2: component tokens, readable type scale, shared page patterns | Medium | Medium | 3 days | Low | Faster, more consistent UI |
| M6 | Performance Budget: route/vendor analysis, markdown/highlight split, graph virtualization | Medium | Medium | 2 days | Low | Better startup and large-workspace feel |
| M7 | Documentation Truth Pass: correct better-sqlite3/Electron/version drift, testing/release/performance docs, consolidate root reports | Low | Medium | 1 day | Low | Recruiter and contributor confidence |
| M8 | Observability: structured main-process logging, error taxonomy, diagnostics export | Medium | Medium | 2 days | Low | Supportable desktop product |

## Low — polish and operational maturity

| # | Milestone | Difficulty | Impact | Effort | Risk | Value |
|---|---|---|---|---|---|---|
| L1 | Dependency modernization: Electron/Vite/Vitest/React/Zustand upgrade path | High | Medium | 4-5 days | High | Security and ecosystem currency |
| L2 | Remove dead dependencies/components/imports | Low | Low | 0.5 day | Low | Cleaner install and codebase |
| L3 | Cross-platform packaging: macOS notarization, Linux targets | High | Low now | 4 days | High | Market expansion later |
| L4 | Auto-update with signature verification | High | Medium | 3 days | High | Safe distribution later |
| L5 | Crash reporting with local opt-in | Medium | Low | 2 days | Medium | Field reliability |
| L6 | Brand/asset polish: screenshots, demo workspace, launch page | Low | Medium | 1-2 days | Low | Recruiter and user acquisition |

## Future vision — only after C1-C5 and H1-H5 are green

| Program | Description | Gate |
|---|---|---|
| **Plugin SDK + MCP Host** | Manifest, loader, permissioned sandbox, registry, MCP client/tool bridge | IPC trust boundary + capability model |
| **Cloud Sync & Collaboration** | Offline-first sync, conflict resolution, teams/RBAC, shared brain, audit | Secret boundary + database integrity |
| **Knowledge Graph** | Entity/relationship extraction, traversal, similarity, graph explorer | Intelligence contract + search v2 |
| **Multi-Agent Collaboration** | Agent framework, discussion engine, orchestration, shared reports | AI reliability + persisted workflows |
| **Autonomous Orchestration** | Goal engine, lifecycle, approvals, digital twin, OS-level event bus | Multi-agent + observability + enterprise policy |
| **Visual Workflow Engine** | Node graph authoring, execution, debugging, versioning | Plugin SDK + persisted workflow runtime |
| **Enterprise Knowledge OS** | Semantic memory, conflict/relationship engines, retention, governance | Cloud sync + RBAC + audit |
| **AI OS Kernel** | Global context, event bus, goal lifecycle, Mission Control 2.0 | All of the above |

## Selected milestone

**C1 — Trusted Data & Secret Boundary** is the single highest-value next milestone.

Why:

1. It closes the only two data-loss / credential-exposure paths rated critical.
2. It completes RC-3 instead of stacking new systems on an unfinished security boundary.
3. It makes backup, export, and restore safe enough to recommend to users.
4. It creates the trust foundation required by every future plugin, cloud, and enterprise program.
5. It is release-sized, testable, and does not require speculative platform architecture.

Non-goals for C1:

- No plugin, MCP, cloud, graph, multi-agent, or kernel work.
- No visual redesign.
- No cross-platform packaging work (Release Gate v1 follows).
- No new AI provider features.

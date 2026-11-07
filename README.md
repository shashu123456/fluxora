# Fluxora

**A local-first desktop AI workspace for coding, memory, and project intelligence.**

Fluxora is an offline-capable Electron desktop app that brings multi-provider AI chat, workspace-aware context, a per-project knowledge brain, developer memory, and a hardened workspace terminal into one app that keeps chats, memories, and project data on your machine.

[![Electron](https://img.shields.io/badge/Electron-28-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![SQLite](https://img.shields.io/badge/SQLite-local-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/shashu123456/fluxora/actions/workflows/ci.yml/badge.svg)](https://github.com/shashu123456/fluxora/actions/workflows/ci.yml)

> **Status:** Feature-complete and technically validated for an unsigned release. Full test suite green (434 tests across 29 files), both typechecks green, production build green, Windows installer + portable built and verified: `Fluxora-Setup-1.0.0.exe` (99.1 MiB), `Fluxora-Portable-1.0.0.exe` (98.8 MiB), `win-unpacked/Fluxora.exe` (168.7 MiB); native sqlite3 rebuilt inside the build script and packaged unpacked; packaging reproducible via `npm ci` → `@electron/rebuild` → `electron-builder`; Windows packaging CI job added. CI configured and passing. Code signing is the remaining blocker (no certificate; documented, never faked). All artifacts `NotSigned`. Phase 4 status: PARTIAL — install/uninstall smoke in clean profile NOT VERIFIED (no clean machine), live keyed test NOT VERIFIED (no token), live-app visual smoke NOT VERIFIED (tools cannot reach native window).

---

## What it is

Most AI tools are cloud-first and context-blind. Fluxora is built around a different model:

- **Local-first storage** — chats, memories, workspaces, provider state, and project intelligence live in a local SQLite database on your machine.
- **Workspace-aware context** — Smart Context combines workspace files, memory, project brain, intelligence signals, and terminal activity into focused AI context.
- **Provider freedom** — OpenAI, Anthropic, Google Gemini, Groq, OpenRouter, and any custom OpenAI-compatible endpoint, including local runtimes.
- **Local model support** — Ollama (port 11434) and LM Studio (port 1234) are detected and used like any other provider. No cloud required.
- **Security boundaries** — filesystem containment, main-process terminal approval, a single main-process secret vault, and integrity-checked secret-free backups.
- **Curated API discovery (Beta)** — browse 20 vetted APIs, see exactly what a test request sends, and audit every attempt. No crawling, no autonomy, GET-only.
- **Offline-capable desktop app** — Electron + SQLite, not a browser tab. Works without an account.

---

## Screenshots

> Replace the placeholders below with real captures from a built app.

| | |
|---|---|
| ![Chat](./docs/screenshots/chat.png) | Chat with streaming, provider/model picker, attached files, and message metadata |
| ![Mission Control](./docs/screenshots/mission-control.png) | Mission Control: health, signals, what to work on, where risk lives |
| ![Settings](./docs/screenshots/settings.png) | Providers, general preferences, diagnostics, backup/restore, system info |
| ![Workspace Intelligence](./docs/screenshots/workspace-intelligence.png) | Per-workspace health, risks, recommendations, and evolution |

**Demo GIF (recommended):** a short loop showing — open app → add an Ollama or OpenAI provider → start a chat → stream a response → open Mission Control. Keep it under 15 seconds and under 5 MB.

---

## API Discovery (Beta)

Settings → **API Discovery** answers a narrow question well: *what will this app send if I test
this API, and where did that request go?*

- **20 curated APIs, 6 categories**, catalog v1.0.0, last verified 2026-11-06.
- Search across name, description, category, and tags; filters for category, auth, and risk.
- Every card shows auth requirement, free-tier note, risk, and verified date.
- The detail panel shows the base domain, docs link, and the **exact** method/host/path.
- Keys go into the existing OS-encrypted main-process vault; only a fingerprint is shown
  back, never the key.
- A test request always needs explicit confirmation and is GET-only over HTTPS.
- Every attempt — including blocked and rate-limited ones — writes an audit row containing
  the path, status, duration, size, and outcome. No key, header, or body.

**Demo path:** Settings → search `weather` → open Open-Meteo → Test request → confirm →
see HTTP 200 and the audit row. Script: [`docs/API_DISCOVERY_DEMO.md`](./docs/API_DISCOVERY_DEMO.md).
Docs: [`docs/API_DISCOVERY.md`](./docs/API_DISCOVERY.md) ·
Threat model: [`docs/API_DISCOVERY_SECURITY.md`](./docs/API_DISCOVERY_SECURITY.md).

### Case study

**Problem.** Users are told to "integrate an API" and left to hunt docs, guess auth
schemes, and paste keys into whatever surface is handy — with no record of what left the
machine.

**Why autonomous integration was rejected.** "Discover APIs for me" implies crawling,
endpoint guessing, and sending credentials to hosts nobody approved. That is unbounded
SSRF with a friendly name. A curated catalog keeps the reachable host set finite,
reviewable, and visible in the UI before anything is sent.

**Architecture.** Static catalog in the main process → approval-gated executor → existing
vault → append-only audit → a renderer that can only name a catalog id. The renderer holds
no URL, no key after save, and no network path.

**Security model.** HTTPS only, port 443 only, GET only, no user-supplied URL or headers;
manual same-host redirects (max 3) with DNS re-validation per hop; DNS pinned to the
validated address so rebinding cannot swap it; a full private/reserved blocklist including
IPv4-mapped IPv6; 10s timeout; 1 MB cap; JSON/plain-text only; 1 test/API/5s and 30/min
globally; path-only audit rows.

**Tradeoffs.** Twenty curated APIs instead of "everything"; a release is needed to add an
API; no POST/OAuth/MCP; keyed flows are proven with injected secrets and transports rather
than live third-party credentials.

**Measured.** 415 tests green (91 new), 48 SSRF cases, 19/20 catalog endpoints returning
JSON 200 during verification (Google Books returned 429 from a shared IP). Zero secrets
found in audit rows, logs, or fixtures.

**Deliberately not built.** Autonomous discovery, crawling/scraping, MCP, OAuth, code
generation, plugins, marketplace/billing, POST/PUT/PATCH/DELETE, background health checks,
and any path that feeds API responses to an LLM.

---

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Electron 28 (Node 18 target) |
| UI | React 18, TypeScript, Tailwind CSS, Radix primitives |
| Build | Vite 5, electron-builder |
| State | Zustand (7 stores) |
| Data | SQLite via `sqlite3` (WAL, foreign keys, incremental vacuum) |
| AI | Provider-specific APIs + OpenAI-compatible SSE streaming |
| Terminal | main-process spawn with strict parsing, approval, and process-tree termination |
| Testing | Vitest, Testing Library, jsdom |
| Packaging | NSIS installer + portable exe (Windows) |

---

## Architecture (short version)

```
Renderer — React 18 + TypeScript + Zustand + Tailwind
  pages · stores · components · smart context · command bar

  typed preload bridge (contextBridge, sandboxed, no Node access)

Main process — Electron
  window lifecycle · IPC handlers · security policy
  AI providers · streaming · workspace indexer · terminal runner
  project brain · intelligence · memory · exports/backups
  single-process secret vault

  SQLite — local schema, migrations, WAL
```

- The renderer is sandboxed and never touches Node. It talks to the main process only through a typed `window.api` bridge.
- All AI calls, file operations, terminal execution, and secret access happen in the main process.
- Provider credentials are sealed by the main-process secret vault; the renderer sees metadata (has key / health / storage mode), never the key.

Full details: [Architecture](docs/ARCHITECTURE.md) · [IPC](docs/IPC_ARCHITECTURE.md) · [Security](docs/SECURITY.md) · [Database](docs/DATABASE.md) · [Providers](docs/PROVIDERS.md) · [Memory](docs/MEMORY_SYSTEM.md) · [Project Brain](docs/PROJECT_BRAIN.md) · [Workspace Intelligence](docs/WORKSPACE_INTELLIGENCE.md)

---

## What I built (resume bullets)

- **Fluxora — local-first AI desktop workspace (Electron, React, TypeScript, SQLite)**
  - Built a sandboxed Electron app with a typed IPC bridge, 7 Zustand stores, and a local SQLite database (15+ tables, WAL, foreign keys) for chats, memories, workspaces, provider state, usage, and project brain.
  - Implemented multi-provider AI with streaming SSE parsing for OpenAI-compatible, Anthropic, and Gemini endpoints, plus auto-routing, usage/cost tracking, and per-request abort.
  - Added local model support with automatic detection of Ollama and LM Studio and a generic OpenAI-compatible fallback, so the same chat surface works with cloud or offline runtimes.
  - Hardened the desktop trust boundary: canonical filesystem containment for workspace reads/writes, main-process terminal approval with command parsing and process-tree termination, and an integrity-checked secret vault with metadata-only export/import and verified restore.
  - Delivered CI (typechecks + full test suite + build on every push), a verified Windows installer and portable build, and a 304-test suite covering security, terminal, data transfer, secrets, database, intelligence, and more.

---

## Problems solved

### 1. Streaming + abort + usage recording, end to end

AI chat in a desktop app is not just "call an API and print the result." The real work is making streaming feel right while staying honest about cost and cleanup.

The request path is:

1. Renderer decides to send a message → `chatStore.streamMessage(...)`.
2. The store resolves provider + model from the chat's own workspace defaults (not whichever workspace is active in the sidebar), with optional auto-routing.
3. The store subscribes to three IPC events — `ai:chunk`, `ai:done`, `ai:error` — each scoped by `requestId` so late or stale events from other streams are ignored.
4. The main process opens an `AbortController`, stores it against the `requestId`, and starts the SSE stream.
5. Chunks are forwarded to the renderer as they arrive; the renderer appends them to `streamingContent` and auto-scrolls.
6. On `done`, the store persists the assistant message with usage, records a usage row (provider, model, chat, workspace, prompt/completion/total tokens, cost, response time, streaming flag, status), and fires a memory-context event if relevant.
7. On `error`, the store clears streaming state and surfaces the error.
8. The user can stop at any time; `ai:stop` aborts the controller, the stream removes itself from active streams, and the renderer clears state.

The tricky parts:

- **Abort flows both ways.** The renderer can stop mid-stream; the main process aborts the fetch. If the fetch itself throws `AbortError`, the `onDone` callback still fires with an empty content so the UI is not left streaming forever.
- **Request isolation.** Because multiple chats could theoretically stream, every chunk/done/error is gated on `requestId`. The listener unsubscribes itself in `onDone`/`onError`, and the component unmount additionally calls `cleanup()` on the store.
- **Usage is recorded once, at the end.** Streaming accumulates text locally; usage comes from the final SSE `usage` block (or a best-effort fallback). That keeps cost and token counts consistent with what was actually returned.
- **Context is assembled before the call, not after.** Smart Context builds a system prompt from workspace index, memory, brain, and intelligence, capped to fit. Attachments are read and inlined into the last user message. If context building fails, the call still goes through with the raw messages — never a hard block.

### 2. IPC boundary: typed, minimal, sandboxed

The renderer is sandboxed with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`. It has no direct Node access and no raw `ipcRenderer` exposed.

What it gets is a single `window.api` object built in the preload script with `contextBridge`. The object is organized by domain — `chat`, `providers`, `ai`, `memory`, `brain`, `workspace`, `terminal`, `git`, `tools`, `prompts`, `settings`, `backup`, `usage`, `search`, `notifications`, `intelligence`, `developer`, `dialogs`, `system`. Each domain exposes only what it needs:

- **Request/response** goes through `invoke` / `handle` with typed payloads.
- **Event streams** (AI chunks, terminal output, terminal updates) go through `on` subscriptions that return a cleanup function, so the renderer can stop listening when a view unmounts.
- Window controls (`minimize`, `maximize`, `close`, `isMaximized`) and shell actions (`showItemInFolder`, `openExternal`) are separate from the data API.

The main process owns the real capabilities:

- It holds the secret vault and reads provider keys only when making an AI call.
- It validates filesystem paths against workspace roots before any read/write.
- It parses and approves terminal commands in the main process; the renderer cannot approve or bypass a run.
- It sanitizes data on the way out — exports and imports are metadata-only for credentials, backups strip secrets and integrity-check before storing.

The net effect: the renderer is a UI layer. Anything sensitive or system-touching is forced through one bounded main-process surface, which is what makes the security model testable and the blast radius small.

---

## Getting started

### Prerequisites

- Node.js 18+
- npm
- Windows, macOS, or Linux

### Install

```bash
npm install
```

### Develop

Run the renderer dev server:

```bash
npm run dev
```

In another terminal, launch Electron against the dev server:

```bash
npm run electron:dev
```

For concurrent watch mode:

```bash
npm run electron:debug
```

### Build

```bash
npm run build
```

Package with electron-builder:

```bash
npm run electron:build
```

### Verify

```bash
npm run typecheck:electron
npx tsc -p tsconfig.json --noEmit
npm test
```

### First run

1. Open **Settings → Providers**.
2. Add a provider:
   - **Cloud:** OpenAI, Anthropic, Gemini, Groq, or OpenRouter — set base URL, API key, and enable.
   - **Local:** Ollama at `http://localhost:11434/v1` or LM Studio at `http://localhost:1234/v1` — no key needed; the app auto-detects the type.
3. Go to **Chat**, pick a provider and model, and send a message.

---

## Project structure

```
.
├── electron/           # Main process: IPC, DB, services, security
├── src/                # Renderer: React app, stores, components
├── tests/              # Vitest suites
├── docs/               # Architecture, security, providers, memory, brain, intelligence
├── scripts/           # Icon and maintenance scripts
├── build/             # Packaging icons
├── .github/           # Issue/PR templates, security policy, CI workflow
├── PROJECT_PLAN.md    # Release gate task board and handoff
└── PROJECT_STATE.md   # Completed work, known issues, current todo
```

---

## Security

Fluxora applies defense in depth:

- **RC-1** — filesystem containment and symlink-safe path validation for workspace reads/writes and tools.
- **RC-2** — terminal parsing, workspace scoping, main-process approval, bounded output, secret redaction, and process-tree termination.
- **C1** — one main-process secret vault (OS safeStorage or AES-256-GCM local fallback key), no plaintext or reversible fallback, metadata-only renderer/export data, integrity-checked secret-free backups, and verified restore.

Report vulnerabilities privately through [.github/SECURITY.md](.github/SECURITY.md). Do not open a public issue for a security problem.

---

## Development notes

- Two tsconfigs: `tsconfig.json` (renderer) and `electron/tsconfig.json` (main).
- The repo runs in a OneDrive path on Windows; clear `node_modules/.vite` before retrying a stalled Vite build.
- `sqlite3` is the production driver. Do not use `node:sqlite` — it is not available in Electron 28 / Node 18 and is not supported by the test toolchain.
- `npmRebuild` is `false` by design: `sqlite3` 5.1.7 is an N-API addon and does not require an Electron ABI rebuild. This was proven by the packaged-app launch test, not by inspection alone.

---

## CI

CI runs on every push and pull request to `main`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  verify:
    name: Typecheck, test, and build
    runs-on: windows-latest
    timeout-minutes: 30
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Typecheck Electron
        run: npm run typecheck:electron
      - name: Typecheck renderer
        run: npx tsc -p tsconfig.json --noEmit
      - name: Test
        run: npm test
      - name: Build
        run: npm run build
      - name: Upload build output
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: fluxora-build
          path: |
            dist
            dist-electron
          if-no-files-found: warn
          retention-days: 7
```

- Node 20 is used for tooling; the app targets Electron 28 / Node 18 at runtime.
- `npm ci` is used so CI is reproducible from lockfile.
- Typechecks run separately for the Electron main process and the renderer.
- The full test suite runs before the build so a broken build does not hide a test failure.
- Build output is uploaded as an artifact for inspection even when later steps fail.

The workflow file lives at `.github/workflows/ci.yml`. It is the canonical CI definition; this README section is a readable summary.

---

## Test suite

| Suite | Result |
|---|---|
| Electron TypeScript | PASS |
| Renderer TypeScript | PASS |
| Full test suite | 415/415 passed across 26 files (91 added by API Discovery) |
| Windows packaging (unsigned) | PASS — installer 104.9 MiB, portable 104.7 MiB, ProductName `Fluxora`, version `1.0.0`, icon verified |
| Packaged app launch | PASS — fresh profile creates database, 15+ tables, empty stderr |

---

## Known issues and not-yet-verified items

- **Code signing is blocked.** No certificate exists; all artifacts are `NotSigned`. Documented, not faked. SmartScreen will warn on first install.
- **Light theme is unreachable.** A light palette exists in `:root`, but `index.html` hardcodes `class="dark"` and no toggle ships. See [docs/ACCESSIBILITY_AUDIT.md](docs/ACCESSIBILITY_AUDIT.md).
- **Clean-machine install/uninstall not verified outside this session.** Procedure is documented; run it on a fresh Windows Sandbox or VM when you can.
- **Accessibility, reduced-motion, and screen-reader traversal not verified.**
- **npm audit shows transitive dependency vulnerabilities** in dev/optional deps; not addressed in this release gate.

See [PRODUCT_REVIEW.md](docs/PRODUCT_REVIEW.md) and [PRODUCT_ROADMAP.md](docs/PRODUCT_ROADMAP.md) for the full evidence and prioritization.

---

## License

[MIT](LICENSE)

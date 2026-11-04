# Fluxora

**A local-first desktop AI workspace for coding, memory, and project intelligence.**

Fluxora brings multi-provider AI, workspace-aware context, a local project brain, developer memory, and a hardened terminal into one offline-capable Electron application.

[![Electron](https://img.shields.io/badge/Electron-28-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![SQLite](https://img.shields.io/badge/SQLite-local-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **Status:** Release Gate V1 in progress. Fluxora is not yet release-ready.  
> Authoritative task board: [PROJECT_PLAN.md](PROJECT_PLAN.md) · Current state: [PROJECT_STATE.md](PROJECT_STATE.md)

## Why Fluxora

Most AI tools are cloud-first and context-blind. Fluxora is designed around a different model:

- **Local-first storage** — chats, memories, workspaces, and project intelligence stay on your machine.
- **Workspace-aware context** — Smart Context combines files, notes, memory, project brain, and terminal activity.
- **Provider freedom** — OpenAI, Anthropic, Google Gemini, Groq, OpenRouter, and custom OpenAI-compatible endpoints.
- **Security boundaries** — filesystem containment, terminal approvals, a single main-process secret vault, and secret-free backups.
- **Offline-capable desktop app** — Electron + SQLite instead of a browser tab.

## Features

| Area | Capability |
|---|---|
| AI chat | Multi-provider chat with streaming, model selection, attachments, and prompt library |
| Workspace | Open folders, index files, search projects, attach context, and inspect project structure |
| Project Brain | Persistent project knowledge, insights, timelines, and recommendations |
| Memory | Local developer memory, session tracking, affinity capture, and privacy controls |
| Smart Context | Builds focused context from workspace, memory, brain, intelligence, and terminal activity |
| Terminal | Workspace-scoped execution with strict parsing, main-process approval, redaction, and process-tree termination |
| Mission Control | Daily briefing, recommendations, usage signals, and recent activity |
| Developer Profile | Inferred working style, learned insights, and recent sessions |
| Command palette | `Ctrl + K` access to chats, projects, prompts, memory, models, providers, and settings |
| Data portability | Metadata-only exports, validated imports, integrity-checked backups, verified restore |
| Security | RC-1 filesystem containment, RC-2 terminal hardening, C1 trusted data and secret boundary |

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│ Renderer — React 18 + TypeScript + Zustand + Tailwind       │
│ pages · stores · components · smart context · command bar   │
└──────────────────────────────┬──────────────────────────────┘
                               │ typed preload bridge (IPC)
┌──────────────────────────────▼──────────────────────────────┐
│ Electron main process                                       │
│ window lifecycle · IPC handlers · security policy           │
│ AI providers · workspace indexer · terminal runner          │
│ project brain · intelligence · memory · exports/backups     │
└──────────────────────────────┬──────────────────────────────┘
                               │ sqlite3
┌──────────────────────────────▼──────────────────────────────┐
│ SQLite — local schema, migrations, FTS, WAL                 │
└─────────────────────────────────────────────────────────────┘
```

Deeper documentation:

- [Architecture](docs/ARCHITECTURE.md)
- [Database](docs/DATABASE.md)
- [IPC](docs/IPC_ARCHITECTURE.md)
- [Security](docs/SECURITY.md)
- [Providers](docs/PROVIDERS.md)
- [Memory](docs/MEMORY_SYSTEM.md)
- [Project Brain](docs/PROJECT_BRAIN.md)
- [Workspace Intelligence](docs/WORKSPACE_INTELLIGENCE.md)
- [Product review](docs/PRODUCT_REVIEW.md)
- [Roadmap](docs/PRODUCT_ROADMAP.md)

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Electron 28 |
| UI | React 18, TypeScript, Tailwind CSS |
| Build | Vite 5, electron-builder |
| State | Zustand |
| Data | SQLite via `sqlite3` |
| AI | OpenAI SDK and provider-specific APIs |
| Testing | Vitest, Testing Library |
| Tooling | Sharp, Tesseract.js, simple-git |

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

In another terminal, build and launch Electron:

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

> **Known release-gate blocker:** the database test harness currently fails because it imports `node:sqlite` instead of using the production `sqlite3` layer. Phase 2 in [PROJECT_PLAN.md](PROJECT_PLAN.md) replaces it.

## Project structure

```text
.
├── electron/           # Main process: IPC, DB, services, security
├── src/                # Renderer: React app, stores, components
├── tests/              # Vitest suites
├── docs/               # Canonical technical and product documentation
├── scripts/            # Icon and maintenance scripts
├── build/              # Packaging icons
├── .github/            # Issue/PR templates and security policy
├── PROJECT_PLAN.md     # Release Gate V1 task board and agent handoff
└── PROJECT_STATE.md    # Completed work, known issues, current todo
```

## Security

Fluxora applies defense in depth:

- **RC-1** — filesystem containment and symlink-safe path validation.
- **RC-2** — terminal parsing, workspace scoping, main-process approval, bounded output, and process-tree termination.
- **C1** — one main-process secret vault, no plaintext fallback, metadata-only renderer/export data, integrity-checked secret-free backups, and verified restore.

Report vulnerabilities privately through [.github/SECURITY.md](.github/SECURITY.md). Do not open a public issue for a security problem.

## Release status and roadmap

Release Gate V1 covers the database harness, CI, Windows packaging, clean-machine validation, crash recovery, measured performance, a security re-audit, documentation truth, and the final release report. See [PROJECT_PLAN.md](PROJECT_PLAN.md) for the exact sequence and continuation point.

Deferred until after the release gate: indexing scale improvements, chat lifecycle fixes, expanded export coverage, IPC payload validation, and the named platform programs.

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md). Keep changes scoped, run the relevant checks, and never commit secrets or user data.

## License

[MIT](LICENSE)

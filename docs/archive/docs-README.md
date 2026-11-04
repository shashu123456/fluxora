# Fluxora

**AI Operating Workspace** — a local-first Electron desktop application that unifies multi-provider AI chat, workspace intelligence, project memory, and coding assistance into a single premium workspace.

![Brand](../src/assets/fluxora-mark.svg)

## Overview

Fluxora connects to OpenAI, Anthropic, Gemini, and local Ollama models with streaming responses, automatic provider routing, and per-workspace context. It indexes your projects, maintains a Project Brain, stores searchable memories, and provides a command palette for keyboard-first workflows.

## Features

- **Multi-provider AI chat** — OpenAI, Anthropic, Gemini, Ollama with streaming, stop/cancel, and auto-routing
- **Workspace intelligence** — language breakdown, framework/config detection, dependency analysis, git status, README extraction
- **Project Brain** — auto-pinned architecture notes, decisions, conventions, and todos per workspace
- **Memory system** — global + workspace-scoped entries with full-text search and auto-extraction
- **Prompt library** — categorized templates with variable interpolation
- **Global search** — one query across chats, messages, prompts, memories, settings, and files
- **Command palette** — Ctrl+K for every action
- **Usage analytics** — token counts, costs, per-provider breakdown
- **Terminal integration** — in-workspace commands with strict parsing, workspace containment, main-process approval, and redacted output
- **Custom titlebar** — frameless window with native controls

## Tech Stack

| Layer | Technology |
|---|---|
| Shell | Electron 28 |
| UI | React 18 + TypeScript (strict) |
| Bundler | Vite 5 |
| State | Zustand stores |
| Styling | Tailwind CSS + shadcn/ui |
| Database | SQLite (sqlite3, WAL) |
| Fonts | Sora (display) + Manrope (body) |
| Packaging | electron-builder (NSIS + portable) |

## Quick Start

```bash
npm install
npm run electron:dev   # Vite + Electron with the dev server
```

To work on the renderer alone, `npm run dev` starts Vite at `http://localhost:5173`.

## Build

```bash
npm run typecheck:electron # Type-check the Electron main/preload code
npm run build              # Compile Electron, then type-check + build the renderer
npm run electron:build     # Package Windows installers (NSIS + portable)
```

Artifacts land in `release/`.

## Project Structure

```
chat/
├── electron/           # Main process
│   ├── main.ts         # App entry, window, menu, splash
│   ├── preload.ts      # contextBridge API surface
│   ├── config.ts       # Builtin providers, presets
│   ├── security.ts     # Navigation lockdown
│   ├── window-state.ts # Window position persistence
│   ├── database/       # SQLite init, migrations, backup
│   ├── ipc/            # IPC channel groups
│   └── services/       # AI, developer, intelligence, secrets, terminal
├── src/                # Renderer
│   ├── components/     # React components
│   │   ├── chat/       # ChatView
│   │   ├── workspace/  # WorkspaceView, ProjectBrain, Intelligence, CodingAgent
│   │   ├── memory/     # MemoryView
│   │   ├── prompts/    # PromptsView
│   │   ├── search/     # SearchView
│   │   ├── command/    # CommandPalette
│   │   ├── home/       # DashboardView
│   │   ├── layout/     # AppLayout, Sidebar, TitleBar
│   │   ├── settings/   # SettingsView
│   │   ├── usage/      # UsageView
│   │   └── ui/         # shadcn components
│   ├── stores/         # Zustand stores
│   ├── lib/            # contextBuilder, search, intelligence helpers
│   └── types/          # TypeScript interfaces
├── build/              # Packaging icons (ico, png set)
├── scripts/            # fluxora-icon.js (brand asset generator)
└── docs/               # This documentation
```

## Data Storage

All data lives in a single SQLite database at the Electron user-data path (`aiworkspace.db`) with WAL journaling, automatic incremental vacuum, and optional scheduled backups. No cloud sync — everything is local.

## License

MIT — see the root [LICENSE](../LICENSE).

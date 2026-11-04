# Architecture

Fluxora follows a classic Electron two-process model with a strict IPC boundary and a React renderer that never touches Node APIs directly.

## Process Model

```
┌─────────────────────────────────────────────┐
│  Main Process (electron/main.ts)            │
│  - Window lifecycle, splash, menus          │
│  - SQLite database (better-sqlite3)         │
│  - 12 IPC handler groups                    │
│  - AI streaming service                     │
│  - File system operations                   │
│  - Terminal execution                       │
│  - Auto-backup scheduler                    │
├─────────────────────────────────────────────┤
│  Preload (electron/preload.ts)              │
│  - contextBridge 'api' object               │
│  - Typed method groups per domain           │
│  - Event subscriptions (onChunk/onDone/…)   │
├─────────────────────────────────────────────┤
│  Renderer (src/)                            │
│  - React 18 SPA                             │
│  - 7 Zustand stores                         │
│  - Zero Node access (sandboxed)             │
│  - Talks only through window.api            │
└─────────────────────────────────────────────┘
```

## Security Boundary

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- Navigation locked down in `main.ts` (no arbitrary external navigation)
- All external links open via `shell.openExternal`
- API keys sealed by the main-process secret vault; renderer receives metadata only

## Startup Sequence

1. Acquire `app.requestSingleInstanceLock()`; focus the existing window on a second launch
2. `app.whenReady()` and `showSplash()` — frameless 440×300 always-on-top window loading `splash.html`
3. `await initDatabase()` — open/create `aiworkspace.db`, apply WAL + pragmas, run migrations
4. `await migrateLegacyProviderSecrets()` — one-time migration into the secret vault
5. `syncBuiltinProvidersToPresets()` — ensure OpenAI/Anthropic/Gemini/Ollama exist
6. `startAutoBackup()` — optional scheduled integrity-checked backup
7. Register all IPC groups: chat, provider, memory, brain, workspace, tools, prompt, settings, usage, search, workspaceIndex, system, developer, intelligence, terminal
8. `createWindow()` — load saved window state, apply icon (Windows), set up crash/reload handlers
9. `buildAppMenu()` — native menu with platform-conditional roles
10. Close splash on main window `ready-to-show`
11. On `before-quit`, `await closeDatabase()` before exit

## IPC Architecture

All renderer↔main communication goes through `ipcMain.handle`/`ipcRenderer.invoke` (request/response) or `webContents.send`/`ipcRenderer.on` (events). See [IPC_ARCHITECTURE.md](./IPC_ARCHITECTURE.md) for the full channel reference.

### Channel Groups

| Group | Purpose |
|---|---|
| chat | CRUD, messages, search, export/import |
| provider | Provider CRUD, connection testing, model detection |
| ai | Streaming chat, auto-routing, one-shot completion |
| memory | Entry CRUD, search, settings |
| brain | Project Brain CRUD + search |
| workspace | Workspace CRUD, file ops, directory listing |
| tools | PDF/image/OCR/JSON parsing |
| prompt | Template CRUD |
| settings | App settings + full export/import |
| backup | Database backup create/list/restore |
| usage | Token/cost recording and analytics |
| search | Global cross-entity search |
| workspaceIndex | Project indexing (languages, frameworks, configs) |
| system | System info, DB info, analytics |

## State Management

Seven Zustand stores, each persisting to SQLite via IPC:

| Store | Persisted via | Key State |
|---|---|---|
| chatStore | chat.* IPC | chats, active chat, messages, streaming |
| providerStore | providers.* IPC | provider list, active selection |
| memoryStore | memory.* IPC | entries, search query |
| promptStore | prompts.* IPC | templates, category filter |
| settingsStore | settings.* IPC | AppSettings |
| uiStore | settings.* IPC (partial) | activeTab, theme, sidebar |
| workspaceStore | workspace.* IPC | workspaces, indexes, indexing state |

## Build Pipeline

- **Vite** bundles `src/` → `dist/` with two HTML entries: `index.html` (app) and `splash.html` (splash)
- **tsc** compiles `electron/` → `dist-electron/`
- **electron-builder** packages `dist/` + `dist-electron/` into NSIS installer + portable exe
- Dual tsconfig: root (`tsconfig.json` for renderer) + `electron/tsconfig.json` for main process

## Key Design Decisions

1. **better-sqlite3 (synchronous)** — no async overhead for local DB; wrapped in promise helpers for IPC consistency
2. **Zustand over Redux** — minimal boilerplate, built-in persistence pattern, no provider nesting
3. **shadcn/ui** — copy-in components, no runtime dependency, full Tailwind customization
4. **Lazy views** — 7 of 8 views loaded via `React.lazy` for code splitting
5. **Frameless window** — custom titlebar for brand consistency; native macOS traffic lights preserved

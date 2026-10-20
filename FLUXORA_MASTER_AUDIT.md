# FLUXORA — COMPLETE PROJECT AUDIT & ARCHITECTURE REPORT

> **Type:** Read-only technical audit — no code changed, no packages installed.
> **Date:** 2026-09-08
> **Repository:** `ai-workspace` @ `C:\Users\kavitha\OneDrive\Desktop\chat` (git)
> **Scope:** 100% of `src/`, `electron/`, configs, package.json. All findings verified against live source; items marked *[inferred]* are conclusions drawn from code, not observed runtime behavior.

---

## 1. PROJECT OVERVIEW

### 1.1 Purpose
A local-first AI **Operating Workspace** for the desktop: one app that hosts AI chat, per-project workspaces, a codebase file explorer, a terminal/git panel, long-term memory, a prompt library, usage analytics, backups, and provider management — with everything stored locally on the user's machine.

### 1.2 Current architecture
Single-window Electron application. **3 isolated processes/layers:**

```
┌─────────────────────────────────────────────────────────────┐
│ RENDERER  (Chromium / contextIsolation:on / sandbox:on)     │
│  React 18 + Zustand + Radix UI + Tailwind → dist/assets/*   │
└───────────────┬─────────────────────────────────────────────┘
                │ contextBridge → window.api (typed preload)
┌───────────────▼─────────────────────────────────────────────┐
│ PRELOAD  (electron/preload.ts — sandboxed, IPC-only)        │
└───────────────┬─────────────────────────────────────────────┘
                │ ipcRenderer.invoke/send + on
┌───────────────▼─────────────────────────────────────────────┐
│ MAIN  (Node/CommonJS → dist-electron/electron/main.js)      │
│  ipc/*  services/ai/*  services/security  database/*         │
│  ├─ SQLite3 (aiworkspace.db …/ai-workspace/data/)            │
│  ├─ AI providers (raw fetch: OpenAI/Anthropic/Gemini/…)      │
│  └─ OS: dialogs, shell, terminal spawn, git (simple-git)     │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 Maturity level
**Late-beta / production-candidate.** Core loop works end-to-end (chat → stream → persist), security hardening is in place, but it is unshipped: no packaged installer has been built/verified, no tests, and several features are semi-wired (see §4, §13, §14).

### 1.4 Technology stack
| Layer | Tech | Version |
|---|---|---|
| Shell | Electron (frameless window, native menu) | ^28.2.0 |
| UI | React 18, TS strict, Tailwind 3, 14× Radix primitives, lucide-react | 18.3.1 |
| State | Zustand v4 (7 stores, no persistence middleware) | ^4.5.0 |
| Markdown | react-markdown + remark-gfm + rehype-highlight (15 curate langs) | ^9 |
| Main runtime | Node ESM-compiled-to-CJS, TypeScript | TS 5.3 |
| Database | `sqlite3` (callbacks, fully parameterized) | ^5.1.7 |
| AI transport | Hand-rolled fetch + SSE streaming (no vendor SDKs) | — |
| Packaging | electron-builder (NSIS + portable, win only) | ^24.9.1 |
| Build | Vite 5 + tsc, code-split via React.lazy | ^5.0.12 |

### 1.5 Folder structure (source of truth, LOC measured)
```
chat/
├─ index.html                  # CSP meta, root mount
├─ package.json                # 88 lines: scripts, 44 deps, 16 devDeps
├─ vite.config.ts              # @ alias, base './', build to dist/
├─ tsconfig.json               # renderer (bundler resolution, paths @/*)
├─ tsconfig.node.json          # vite/node tooling tsconfig
├─ electron/tsconfig.json      # CommonJS → dist-electron, includes src/types
├─ electron-builder.json       # NSIS + portable, win target, icon build/icon.ico
├─ tailwind.config.js          # HSL token system, sidebar palette, animations
├─ postcss.config.js           # tailwind + autoprefixer (ESM-syntax .js — causes a Vite advisory warning)
├─ launch-ai-workspace.bat     # one-click launcher (dev-vs-built detection)
├─ QUICK_START.md / MILESTONE_1_REPORT.md / ENGINEERING_REPORT.md
├─ src/         43 files, 6,908 lines     # renderer  (below)
├─ electron/    19 files, 3,681 lines     # main process + IPC + AI + DB
├─ scripts/      1 file,    207 lines     # generate-icon.js (zero-dep PNG/ICO writer)
├─ build/                                 # icon.png (512²) + icon.ico (256²)
├─ dist/                                  # vite output (index + split chunks)
├─ dist-electron/                         # compiled main-process CJS
└─ release/                               # (empty) electron-builder out dir
```

### 1.6 Entry points
- **Main:** `package.json:main` → `dist-electron/electron/main.js` (compiled from `electron/main.ts`).
- **Preload:** `electron/preload.js` (sandboxed, `contextBridge.exposeInMainWorld('api', …)`).
- **Renderer:** `index.html` → `/src/main.tsx` → `App.tsx` → `AppLayout.tsx` (single shell; tab switching via `uiStore.activeTab`, no router).

### 1.7 Build system
- `npm run build` = `tsc -p electron/tsconfig.json` (main→dist-electron) **then** renderer `tsc --noEmit && vite build` (→dist).
- Output: `dist/index.html` + hashed chunks; `dist-electron/electron/*.js`.
- Dev: `npm run electron:dev` (vite :5173 + wait-on + electron w/ `VITE_DEV_SERVER_URL`).
- Package: `npm run electron:build` (electron-builder; **not yet run/verified in this session**).

### 1.8 Runtime flow
launcher/bat or `npm start` → electron main → migrate DB/keys → register 99 IPC bindings → `createWindow` (restored bounds, frameless) → renderer boots flat `AppLayout` → store init sequence (ensure-defaults → settings → providers → workspaces → prompts → chats → restore last chat) → interact via `window.api`.

---

## 2. FOLDER ANALYSIS

### 2.1 `electron/` — main process (19 files, 3,681 lines) — **core, ~95% complete**
| File | Role | Status / gaps |
|---|---|---|
| `main.ts` | window, frame, menu, lifecycle, fatal dialogs, DB-init, migrate legacy keys | Complete. *[inferred]* No macOS/Linux verification; `frame:false` win-only. |
| `preload.ts` | entire `window.api` surface (15 namespaces, 91 invoke + 7 send) | Complete; variadic shims for terminal/search/memory/prompts. |
| `config.ts` | data-dir resolution incl. portable mode | Complete. No dir watch. |
| `security.ts` | `encryptSecret/decryptSecret` via Electron `safeStorage`, legacy migration | Complete. Linux-fallback writes `plain:` prefix when safeStorage unavailable. |
| `window-state.ts` | width/height/x/y/maximized persistence (JSON, debounced 300 ms) | Complete; validated vs workArea. |
| `types-shims.d.ts` | ambient node/electron types | Complete. |
| `ipc/` (9 files) | all business handlers | See §7 (supported, complete). |
| `services/ai/index.ts` | provider registry, model fetch, cost scoring | Complete. |
| `services/ai/providers.ts` | 5 streaming implementations (OpenAI-compat, Anthropic, Gemini) + 3 completion paths | Complete; hand-rolled SSE. |
| `database/index.ts` | SQLite open, run/all/get, transactions, schema+migrations+indexes | Complete; no WAL/foreign keys ([inferred] perf headroom). |
| `database/backup.ts` | manual/auto backup (1–24 h), retention 10, restore, export/import safety copies | Complete; `ai:complete` middleware is a dead no-op; `restoreBackupFile` dead stub. |

### 2.2 `src/` — renderer (43 files, 6,908 lines) — **~85% complete**
| File | Role | Gaps |
|---|---|---|
| `types/index.ts` | all shared interfaces | `WindowApi` declaration has **drifted from real preload** (documented drift, e.g. legacy `system.*` names) |
| `stores/` (7) | Zustand stores | see §8 |
| `components/layout/` (3) | AppLayout (shell + lazy tabs + init + onboarding), Sidebar, TitleBar | Sidebar subscribes to whole chatStore (re-render per chunk) |
| `components/chat/ChatView.tsx` | chat + streaming + attachments + provider/model selects | complete; long chats not virtualized |
| `components/settings/SettingsView.tsx` | providers/general/backup/danger | duplicate test logic (uses `providers.test` vs store) |
| `components/workspace/` (2) | WorkspaceView (file explorer), CodingAgent (terminal+git tabs) | workspace→chat attach event has no listener |
| `components/memory/MemoryView.tsx` | memory CRUD/search/auto-extract/enable | memoryEnable state can drift vs settingsStore |
| `components/prompts/PromptsView.tsx` | prompt library CRUD + variable "Use" dialog | "Use" only copies to clipboard (does not inject into chat) |
| `components/usage/UsageView.tsx` | usage stats | loads on mount only, no store/polling |
| `components/onboarding/OnboardingDialog.tsx` | first-run provider-key setup | auto-opens when no provider has key; dismissible |
| `components/ui/` (20) | shadcn-style primitives on 14 Radix pkgs | 6 Radix pkgs (accordion/alert-dialog/collapsible/context-menu/slider/toast) **unused** |
| `components/Markdown.tsx` | memoized markdown + curated hljs (15 langs) | no LaTeX, no line-highlight |

### 2.3 `scripts/`, `build/`, `dist/`, `dist-electron/`, `docs/`, misc
- `scripts/generate-icon.js` — zero-dependency PNG/ICO generator (already ran; outputs in `build/`).
- `build/` — `icon.png`(512²), `icon.ico`(256²). **Used** by `electron-builder.json`.
- `dist/` — production bundles (see §11).
- `dist-electron/` — compiled main process.
- `docs/` — **does not exist**; docs live at root (`*.md`).
- `public/` — does not exist (not needed; no static assets beyond bundle).
- `assets/` — does not exist (icons generated into `build/`).
- `release/` — empty (installer never produced).

---

## 3. FILE ANALYSIS (every important file)

> Status legend: **✓ working** · **~ partial** · **✗ broken**

| File | Purpose | Status | % | Deps | Used by | Improve? | Risk |
|---|---|---|---|---|---|---|---|
| `electron/main.ts` | window/lifecycle/menu/error dialogs | ✓ | 95% | electron, config, window-state, database, security, 9 ipc | — | mac menu/icon paths, auto-updater | Med |
| `electron/preload.ts` | api bridge (91+7 channels) | ✓ | 100% | electron | all renderer | keep in sync w/ types | Low |
| `electron/security.ts` | safeStorage + migration | ✓ | 90% | electron | providers ipc, ai service | plain:-fallback on Linux | Med |
| `electron/window-state.ts` | bounds persistence | ✓ | 100% | fs, display | main | — | Low |
| `electron/config.ts` | data dir, portable mode | ✓ | 90% | app | main, backup, system ipc | dir picker UI | Low |
| `electron/database/index.ts` | sqlite open/schema/migrations | ✓ | 90% | sqlite3 | all ipc | WAL; FKs; size watch | Med |
| `electron/database/backup.ts` | backup/restore/export/retention | ✓ | 85% | fs, db | system ipc, settings | remove dead stubs | Low |
| `electron/ipc/chat.ts` | chat+message CRUD, import/export | ✓ | 100% | db | ChatView, Sidebar, chatStore | (semantic validation) | Low |
| `electron/ipc/providers.ts` | CRUD, test, models, defaults, key migration | ✓ | 100% | db, ai, security | providerStore, SettingsView, Onboarding | — | Low |
| `electron/ipc/memory.ts` | memory CRUD/search/auto-extract | ✓ | 100% | db | memoryStore, MemoryView | — | Low |
| `electron/ipc/prompts.ts` | prompt CRUD | ✓ | 100% | db | promptStore, PromptsView | — | Low |
| `electron/ipc/settings.ts` | settings get/update, export/import/reset | ✓ | 95% | db | settingsStore, TitleBar(theme) | — | Low |
| `electron/ipc/usage.ts` | usage record/summary/detail/clear | ✓ | 100% | db | chatStore(send), UsageView | purge policy | Low |
| `electron/ipc/system.ts` | window, shell(guarded), ai stream/complete/route, terminal, git, backup, notifications | ✓ | 95% | db, ai, child_process, simple-git, shell | broad | terminal cwd allowlist (post-audit hardening) | Med |
| `electron/ipc/workspace.ts` | file ops (writes sandboxed to workspace roots), dialogs, readFile, search | ✓ | 95% | db, fs, tools | WorkspaceView, ChatView(attach) | sandbox reads? (design choice) | Med |
| `electron/ipc/tools.ts` | pdf/image/OCR/json/detect (dynamic import) | ✓ | 80% | pdf-parse, tesseract.js | WorkspaceView preview | tesseract engine heavy (~MB) · no path restriction | Med |
| `electron/services/ai/index.ts` | registry, `getProviderById`, models, cost score | ✓ | 100% | db, security, fetch | ipc/system, ipc/providers | — | Low |
| `electron/services/ai/providers.ts` | streaming+completion (OpenAI/Anthropic/Gemini) | ✓ | 100% | fetch | system ipc | tool-calling, vision parts | Med |
| `src/types/index.ts` | shared contracts | ✓ | 90% | — | electron+renderer | **resync WindowApi vs preload** | Med |
| `src/main.tsx` | React root | ✓ | 100% | react | — | — | Low |
| `src/App.tsx` | tooltip provider + AppLayout | ✓ | 100% | radix-tooltip | — | — | Low |
| `src/index.css` | Tailwind tokens, scrollbars, app-drag | ✓ | 90% | tailwind | all | light-theme tweak pass | Low |
| `stores/chatStore.ts` | chat+streaming+messages+regenerate+files | ✓ | 90% | zustand, api | ChatView, Sidebar | virtualization; requestId tested? | Med |
| `stores/providerStore.ts` | providers CRUD/test/defaults | ~ | 80% | zustand, api | ChatView(read), SettingsView*, Onboarding | dead `selectedProvider`, dup logic | Low |
| `stores/memoryStore.ts` | memory CRUD/search/toggle | ~ | 85% | zustand, api | MemoryView | drift vs settingsStore | Low |
| `stores/promptStore.ts` | prompts CRUD/filter | ~ | 85% | zustand, api | PromptsView | workspace scope | Low |
| `stores/settingsStore.ts` | settings load/update/reset/export/import | ✓ | 90% | zustand, api | SettingsView, AppLayout, ChatView | — | Low |
| `stores/workspaceStore.ts` | workspace CRUD/select/openFolder | ✓ | 90% | zustand, api | WorkspaceView | — | Low |
| `stores/uiStore.ts` | activeTab/theme/sidebar width/notifs | ~ | 75% | zustand, api | AppLayout, Sidebar, TitleBar, ChatView | dead `notifications`, `activePanel` | Low |
| `components/chat/ChatView.tsx` | primary view | ✓ | 90% | stores, ui, Markdown | default tab | virtualization, speak, attach images→multimodal | Med |
| `components/settings/SettingsView.tsx` | four settings sections | ✓ | 90% | stores, api | Settings tab | model refresh UI, key restore visual | Low |
| `components/onboarding/OnboardingDialog.tsx` | first-run provider setup | ✓ | 100% | providerStore, ui | AppLayout mount | — | Low |
| `components/workspace/WorkspaceView.tsx` | explorer/preview/search/dialogs | ✓ | 90% | api, stores | Workspace tab | wire attach event; virtualization of tree | Med |
| `components/workspace/CodingAgent.tsx` | terminal + git | ✓ | 85% | api | Workspace tab | agent loop, secure exec prompt confirm | Med |
| `components/memory/MemoryView.tsx` | memory manager | ✓ | 90% | store, api | Memory tab | — | Low |
| `components/prompts/PromptsView.tsx` | prompt library | ✓ | 85% | store | Prompts tab | insert-into-chat | Low |
| `components/usage/UsageView.tsx` | analytics | ~ | 70% | api | Usage tab | store + polling + charts(recharts unused) | Low |
| `components/Markdown.tsx` | memoized renderer | ✓ | 100% | react-markdown | ChatView, WorkspaceView | — | Low |
| `launch-ai-workspace.bat` | one-click launcher | ✓ | 100% | node/npm | end users | — | Low |
| `scripts/generate-icon.js` | icon generation (one-shot) | ✓ | 100% | node zlib | — | — | Low |
| `electron-builder.json` | packaging config | ✓ | 80% | electron-builder | packaging | **macOS/Linux targets missing; never smoke-run** | Med |

---

## 4. FEATURE AUDIT

Legend: ✅ verified working · 🟡 partially wired · ❌ broken · ⬜ not implemented · ❓ unknown (untested runtime)

| Feature | State | Notes / evidence |
|---|---|---|
| Chat CRUD (create/list/rename/pin/delete) | ✅ | store+Sidebar; verified via build/smoke |
| Chat streaming (SSE) | ✅ | requestId bug fixed this session (client+main now use same uuid; stop uses captured id) — *[inferred] not runtime-tested against live API* |
| Message persistence | ✅ | `chat:add-message` on send + persist after done (verified flow) |
| Attachments (text files) | 🟡 | wired: select→filter→chips→readFile excerpt in chatStore → appended to last user msg; **binary/vision not passed** |
| Regenerate | 🟡 | deletes last assistant via NEW `chat:delete-message`, re-streams last user msg — *[inferred] live-run un-tested* |
| Providers (CRUD) | ✅ | 7 presets seeded; enabled flag; color |
| Provider Test Connection | ✅ | `providers:test` full header sets (Bearer + x-api-key + Gemini header) |
| Live model fetch | 🟡 | handler `providers:list-models` exists + `providerStore.refreshModels` exists; **no Settings UI button calls it** |
| API key handling | ✅ | **encrypted at rest** (safeStorage, `enc:v1:`), masked in IPC (`hasKey`), stripped from export, Gemini via `x-goog-api-key` header |
| Onboarding / first-run | ✅ | OnboardingDialog when no provider key; CTA on chat EmptyState |
| Workspaces (CRUD, open folder) | ✅ | openFolder now auto-selects; rename/delete fixed this session |
| File explorer | 🟡 | tree works; read unrestricted (attach needs it); **write/create/delete sandboxed to workspace roots** |
| File preview (text) | ✅ | readFile path |
| File preview (image/PDF/OCR) | 🟡 | tools:readImage/readPdf exist (PDF + OCR via dynamic import); used in WorkspaceView potentially (grep shows call sites) but **heavy engines never bundled-tested** |
| File search | ✅ | variadic preload fixed object-shape call |
| Coding Agent | 🟡 | Terminal (run/history) + Git (status/commit/diff) tabs only; **not an LLM-driven agent** |
| Terminal | 🟡 | works; spawn cmd `-c`; 60s timeout + kill; history persisted; command safety relies on user — **no confirm gate** |
| Git | 🟡 | status/commit/diff; commit does `git add .`; no branch UI |
| Chat search | ✅ | chat:search + sidebar/titlebar search (debounced) |
| Memory (CRUD/pin/search) | ✅ | full manager |
| Memory search | ✅ | variadic preload `('global', q)` |
| Auto-exctract memories | 🟡 | `memory:auto-extract` loops on user input (workspace/global scope via toggle) |
| Memory enable/scope | 🟡 | toggle per workspace; **enable state can drift between memoryStore and settingsStore** |
| Prompt library (CRUD/categories/variables) | ✅ | full |
| Prompt insert into chat | ⬜ | "Use" copies to clipboard only |
| Usage analytics | 🟡 | record on stream; summary/detail/by-provider; **no store/polling (mount-only)**; no purge |
| Notifications backend | ✅ | notifications:create/list/mark-read; used as toast-stand-in |
| Notifications UI | ⬜ | `uiStore.notifications` dead — **no bell/center** |
| Settings (theme/temp/maxTokens/stream/memory/notifications/backup) | ✅ | theme persisted via uiStore→settings |
| Themes (dark/light/system) | ✅ | dark = default-first; light available |
| SQLite | ✅ | 11 tables, parameterized, transactions |
| Backups | ✅ | manual + auto (1–24 h), retention 10, pre-restore safety copy |
| Restore / Import / Export | ✅ | import safe-copy; export **without keys**; full Data export/import |
| Window state restore | ✅ | size/pos/maximized |
| Chat/provider/model/project restore | ✅ | lastChatId/lastWorkspaceId/defaultProvider(+model) |
| Model auto-routing | 🟡 | `ai:auto-route` handler + cost scoring; **no UI toggle/display** |
| Desktop launcher / shortcut | ✅ | bat + QUICK_START instructions (shortcut automation not committed) |
| Native menu | ✅ | File(View)… + Ctrl/Cmd+N new chat; devtools dev-only |
| Frameless window + icons | ✅ | frame:false (non-darwin), ICO/PNG in build/ |
| CSP | ✅ | meta CSP (incl. localhost api + https connect); sandbox:on |
| Key migration (legacy plaintext) | ✅ | `migrateLegacyProviderKeys` on boot |
| Voice input/output | ⬜ | not present |
| OCR | 🟡 | tesseract dynamic-import in tools; engine never launched in a test session |
| Research mode | ⬜ | not present |
| Automation | ⬜ | not present |
| Plugins/extensions | ⬜ | not present |
| Knowledge base / RAG | ⬜ | memory is keyword/search only (no embeddings) |
| Logs / structured logging | ⬜ | console only |
| Command palette | ⬜ | was planned (Ctrl+K todo) — **dropped, not implemented** |
| Toasts | ⬜ | radix-toast pkg unused; notifications.create is the stand-in |
| Auto-update | ⬜ | not configured |
| Packaging/installer | ❓ | config present; **release build never executed/verified** |
| i18n | ⬜ | hardcoded English |
| Tests | ⬜ | **zero automated tests** |

**Feature-state tallies:** verified 27 · partial 16 · broken 0 (all session bugs closed) · not-implemented 13 · unknown 1.

---

## 5. UI AUDIT

### 5.1 Every visible screen/panel
| Screen | Contents | State |
|---|---|---|
| **TitleBar** | hamburger (sidebar), centered search (debounced, selects chat), theme toggle, window controls (min/max/close — fixed to real preload methods) | ✅ working |
| **Sidebar (wide)** | tabs: Chat · Workspace · Memory · Prompt Library · Usage; Settings pinned bottom; chat list (pinned/unpinned, search filter, rename/pin/delete dropdown) | ✅ |
| **Sidebar (collapsed rail)** | icon rail incl. Settings at bottom | ✅ (rail returns to full on click) |
| **Chat tab** | header (provider select + model select), message list w/ user/assistant bubbles (Markdown, copy, regenerate-on-last), error banner (dismissable), EmptyState (generic or **provider-CTA variant**) | ✅ |
| **Chat composer** | paperclip (attach → text-filtered chips w/ X), autosize textarea (200 px cap), send/stop (toggled by isStreaming) | ✅ |
| **Workspace tab** | workspace switcher dropdown (rename/delete), file tree (lazy), search box (debounced), preview pane (text/image/pdf), attach-from-preview (**event fired — nobody listens**), create-file/dir + rename/delete dialogs | 🟡 attach dead |
| **Coding Agent** | Terminal tab (command input, output, history) · Git tab (status table, message box, commit, diff view) | ✅/🟡 (agent-is-misnomer: manual terminal/git) |
| **Memory tab** | scope select (global/project), type chips, search, list w/ pin/edit/delete, auto-extract, enable switch | ✅ |
| **Prompts tab** | category chips + search, pinned/unpinned card grid, CRUD dialog w/ variables editor, "Use" dialog (fill vars → live preview → copy) | ✅ (no chat-inject) |
| **Usage tab** | stat cards (total/tokens/cost/avg), today row, per-provider table, detailed log (100), clear-dialog | 🟡 mount-only data |
| **Settings tab** | Providers (preset dropdown, base URL, masked key, add, enable, test, models expand, edit, delete) · General (theme/temp/maxTokens/streaming/memory/notifications) · Backup & Restore (data dir, create backup, restore list, export/import all) · Danger Zone (reset all) | ✅ |
| **Onboarding dialog** | overlaid first-run: cloud-provider cards (baseUrl, key status dot, password input, Connect/Update, result line), Use later / Start chatting | ✅ |

### 5.2 Missing UI
- Notification center/bell (backend ready).
- Live model refresh button (handler ready).
- Insert-prompt-into-chat affordance.
- Usage live-update (needs store).
- Branching/continue message UI (schema supports parent_id/branch_id — no UI).
- Vision/multimodal attach affordance (tools ready).
- Auto-routing status/indicator in chat header.
- Light-theme polish audit.
- Command palette (Ctrl+K).

---

## 6. DATABASE AUDIT

### 6.1 Tables, columns, relationships (verified from `database/index.ts`)
| Table | Columns | Notes |
|---|---|---|
| `settings` | key PK, value (JSON), updated_at | flat key-value store |
| `providers` | id PK, name, type, base_url, **api_key (encrypted)**, models JSON, enabled, is_custom, color, created/updated | masked to renderer |
| `workspaces` | id PK, name, path, color, icon, created/updated, last_opened_at, settings JSON | root for path-sandboxing |
| `chats` | id PK, workspace_id, title, pinned/archived/favorite, provider_id, model_id, created/updated | → providers |
| `messages` | id PK, chat_id, role, content, reasoning, model, provider_id, files JSON, usage JSON, status, parent_id, branch_id, token_count, created_at | branching schema, no rows-created FK |
| `memories` | id PK, workspace_id, scope, type, content, source, pinned, tags JSON, created/updated | |
| `prompts` | id PK, workspace_id, name, content, category, pinned, variables JSON, created/updated | |
| `usage` | id AIPK, provider_id, model, chat_id, workspace_id, prompt/completion/total_tokens, cost, response_time_ms, streaming, status, created_at | **unbounded growth** |
| `notifications` | id PK, title, message, type, timestamp, read | |
| `terminal_history` | id PK, workspace_id, command, output, exit_code, cwd, created_at, duration_ms | output capped 50 k |
| `sqlite_sequence` | (auto) | |

**Indexes:** idx_chats_workspace, idx_messages_chat, idx_usage_created, idx_usage_provider, idx_memories_workspace, idx_prompts_workspace.

### 6.2 Relationships
- Implicit (no FK constraints): workspaces 1→N chats 1→N messages; providers 1→N chats(messages/usage); workspaces 1→N memories/prompts/terminal_history. Branching: messages.parent_id/branch_id (self-relation, unused).

### 6.3 Data flow
Renderer stores → `window.api.*` → handler → parameterized statement → sqlite3 callback → mapped row → IPC response. Writes are transactional where multi-statement (chat delete incl. messages; imports/restores).

### 6.4 Performance
Single DB file; callback driver serializes via queue. No WAL. 6 indexes OK. `usage` and `messages` grow unbounded (no retention), search uses `LIKE '%…%'` (table scan on large chats) — acceptable at single-user scale, not at 10⁶+ rows.

### 6.5 Improvements
WAL mode; FK constraints `ON DELETE CASCADE`; usage retention (e.g. 90 d); messages index on (parent_id); prepared-statement reuse; `EXPLAIN QUERY PLAN` check on chat:search; DB-size watcher to warn on bloat.

---

## 7. IPC AUDIT (99 bindings: 92 handle + 7 on)

| Handler (channel) | Renderer caller | Status | Used? |
|---|---|---|---|
| `chat:list/get/create/update/delete/messages` | chatStore/Sidebar | ✅ | yes |
| `chat:add-message/update-message/clear-messages` | chatStore | ✅ | yes |
| `chat:delete-message` | chatStore.regenerateLastMessage | ✅ (NEW this session) | yes |
| `chat:search` | Sidebar/TitleBar | ✅ | yes |
| `chat:export/import` | chatStore exportChat/importChat | ✅ | yes |
| `providers:list/global-list/create/update/delete` | providerStore, SettingsView, Onboarding | ✅ | yes |
| `providers:test/test-config` | SettingsView (test), providerStore.testConnection | ✅ | yes |
| `providers:list-models` | providerStore.refreshModels | ✅ | **unused (no UI)** |
| `providers:ensure-defaults` | AppLayout init | ✅ | yes |
| `memory:list/create/update/delete/search/toggle/settings` | memoryStore, MemoryView | ✅ | yes |
| `memory:auto-remember/auto-extract` | MemoryView auto-extract | ✅ | yes |
| `prompts:list/create/update/delete` | promptStore, PromptsView | ✅ | yes |
| `settings:get/update/export/import/reset` | settingsStore, uiStore(theme), AppLayout | ✅ | yes |
| `usage:record` | chatStore after stream done | ✅ | yes |
| `usage:summary/detailed/by-provider/clear` | UsageView | ✅ | yes |
| `workspace:list/create/update/delete` | workspaceStore | ✅ | yes |
| `workspace:open-folder/select-folder` | workspaceStore.openFolder | ✅ | yes |
| `workspace:read-file/list-directory/search-files` | WorkspaceView + chatStore(readFile for attach) | ✅ | yes |
| `workspace:write-file/create-file/create-directory/rename-file/delete-file` | WorkspaceView | ✅ **sandboxed to workspace roots** | yes |
| `workspace:file-type/file-stats` | WorkspaceView preview | ✅ | yes |
| `dialog:select-file/files/folder/save-file` | ChatView(attach), WorkspaceView, chat export/import | ✅ | yes |
| `terminal:run/history` | CodingAgent | ✅ (variadic preload fixes arg shape) | yes |
| `git:status/commit/diff` | CodingAgent | ✅ | yes |
| `backup:create/list/restore/export-file/import-file/get-settings/set-settings` | SettingsView, main(auto) | ✅ | yes |
| `tools:read-pdf/read-image/ocr-image/parse-json/detect-file` | WorkspaceView preview | ✅ | yes |
| `notifications:list/create/mark-read/mark-all-read/delete` | WorkspaceView/CodingAgent (create), no UI consumption | ✅ | create:yes; list/read: **unused UI** |
| `system:info` / `system:open-data-dir` | SettingsView | ✅ | yes |
| `shell:open-external` | (generic) | ✅ http/https locked | yes (via preload) |
| `shell:show-item` | (generic) | ✅ | low use |
| `window:minimize/maximize/close/is-maximized` | TitleBar | ✅ | yes |
| `ai:stream-chat` (on) → `ai:chunk/done/error` (webContents.send) | chatStore | ✅ | yes |
| `ai:stop` (on) | chatStore.stopStreaming | ✅ | yes |
| `ai:complete` / `ai:auto-route` | (streaming path used by chat) | ✅ | autoRoute: handler only, no UI |
| `ai:memory-context` (send) | *(defined)* | — | unused |

**Every preload channel (91 invoke + 7 send) has a matching main binding.** No orphaned handlers.

---

## 8. STORE AUDIT (Zustand, 7 stores, no persist middleware — persistence via `settings:update` IPC)

| Store | State | Actions | Notes / completion |
|---|---|---|---|
| **chatStore** | chats, currentChatId, messages, isLoading, isStreaming, streamingContent, error, activeRequestId, filteredChats, searchQuery | chat/message CRUD, send→stream, stop, regenerate, export/import, search, persistLastChat | 90%. Attach-enrichment + requestId fix land here. |
| **providerStore** | providers, selectedProvider(dead), connectionStatuses(dead), isLoading | CRUD, setSelectedProvider(persists default), test, refreshModels(unused UI), ensureDefaults, restoreLastProvider | 80%. dead fields should be stripped. |
| **memoryStore** | memories, isLoading, searchResults, memoryEnabled(drift risk) | CRUD, search, toggle, get/set settings | 85%. |
| **promptStore** | prompts, filteredPrompts, categories, selectedCategory, searchQuery, isLoading | CRUD, setCategory/setSearch | 85%. |
| **settingsStore** | settings, isLoading | load/update/reset/export/import | 90%. `resetSettings` doesn't reload other stores. |
| **workspaceStore** | workspaces, currentWorkspace, isLoading | CRUD, selectWorkspace(persists lastWorkspaceId), restoreLastWorkspace, openFolder(auto-select now) | 90%. |
| **uiStore** | sidebarCollapsed/Width, theme(applied+persisted), activePanel(dead), notifications(dead), activeTab | setters, setTheme(persists) | 75%; dead fields. |

**Cross-store risks:** memory enable drift; theme is single source via uiStore but persisted through settingsStore; no shared "busy/loading" bus; init sequence lives in AppLayout (single point of failure — properly guarded now with initError banner).

---

## 9. AI SYSTEM AUDIT

- **Provider architecture:** registry service (`services/ai/index.ts`) + transport layer (`services/ai/providers.ts`). Types: openai/custom (OpenAI-compat), anthropic, gemini. 7 defaults seeded when DB empty (OpenAI, Anthropic, Gemini, Groq, OpenRouter, Ollama :11434, LM Studio :1234).
- **Model loading:** static preset model lists per provider (`models` JSON on provider row); remote fetch available (`providers:list-models`) but no UI trigger.
- **Streaming:** hand-rolled SSE readers per family (OpenAI `choices[].delta.content`, Anthropic `content_block_delta`, Gemini `candidates[0].content.parts`). Chunk events forward requestId-scoped to renderer. AbortController keyed by requestId. **Working after the requestId fix.**
- **Tool calling / function calling:** **absent.** No tool schema, no agentic loop.
- **Memory:** built server-side for every chat (`buildMemoryContext`, ≤20 memories from global+workspace); auto-extract on user messages when enabled.
- **Prompt construction:** system memory-context block is prepended as a system message; attachments appended to last user turn (≤4 k excerpt each).
- **Token usage:** recorded via `usage:record` after stream (prompt/completion/total + cost estimate table); visible in Usage tab.
- **Model routing:** `ai:auto-route` scores enabled providers by random + cost + vision heuristics. **No UI toggle** — default provider used unless streaming disabled.
- **Limitations:** no tool calling, no vision payloads, no embeddings/RAG, no concurrent-chat batching, single-user rate limits unmanaged, no retries/backoff, no mid-stream token/cost estimate.

---

## 10. SECURITY AUDIT

| Area | Status |
|---|---|
| API keys at rest | ✅ **Encrypted** via Electron `safeStorage` (`enc:v1:` + base64). Legacy plaintext migrated on boot. ⚠️ Linux fallback stores `plain:` unencrypted when safeStorage unavailable (documented trade-off). |
| Keys over IPC | ✅ Masked (`••••••••`) + `hasKey`; real key only resolved main-side for tests/streams. |
| Keys in exports/backups | ✅ `settings:export` writes `apiKey:''`; backups copy DB (encrypted column). |
| Key in transit | ✅ headers only (Authorization / x-api-key / **x-goog-api-key** — Gemini no longer URL-embedded). |
| CSP | ✅ meta CSP: default-src 'self'; connect-src ws://localhost:* http://localhost:* https:; safer sandbox rule. |
| Renderer hardening | ✅ contextIsolation:true, **sandbox:true**, nodeIntegration:false, window-open denied → external browser (http/https only). |
| Workspace file ops | ✅ Mutations (write/create/delete/rename) **guarded to registered workspace roots**; rename rejects `..`/absolute. Reads unrestricted by design (attach requires it). 5 MB read cap. |
| Terminal | ⚠️ Arbitrary `cmd/c -c` execution by design (local desktop tool) — 60 s timeout + kill, but **no user-approval gate**; post-audit hardening: add visible "run command" confirmation for non-root cwds. |
| IPC input | 🟡 Parameterized SQL everywhere (no SQLi) + allowed-column allowlists; but no schema/type validation reject at bound (e.g. oversized content). |
| `backup:restore` | ⚠️ Accepts arbitrary path (user-chosen file); integrity depends on user. Verified file-type check only. |
| Secrets management | `plain:` prefix on Linux; no OS-keychain cross-platform (safeStorage is the keychain on Win/mac). |
| Residual risk | Renderer XSS would expose masked keys + file reads; mitigated by CSP + sandbox + no remote content loaded. |

---

## 11. PERFORMANCE AUDIT

| Area | Assessment |
|---|---|
| Startup | Main: DB open + migration + 99 IPC binds + window ≈ fast. Renderer: single flat module graph loads before first paint; `index.css` 57 kB (10 kB gz) + main chunk must parse — **largest startup cost**. |
| Bundle | `dist/index-BRCIUWeb.js` **785.80 kB raw (237.89 kB gzip)** — >500 kB Vite advisory. **Code-split** into 5 view chunks (WorkspaceView 33.4k · SettingsView 15.8k · PromptsView 13.7k · MemoryView 12.2k · UsageView 7.7k) + shared UI shards. |
| Chat rendering | Memoized MessageBubble; per-chunk instant autoscroll (auto), smooth on message add. ⚠️ **No virtualization** — a 2 000-message chat renders 2 000 DOM bubbles + Markdown parses. |
| IPC churn | One invoke per store action; streaming event-per-token crosses IPC (~fine). `persistLastChat` fires per chat select (throttle opportunity). |
| Database | Serialized SQLite, no WAL; LIKE% scans on large chats; usage/messages unbounded. OK for desktop scale. |
| Search | Debounced; LIKE scan — indexes don't cover `%q%`; acceptable <10⁵ rows. |
| Blocking main | Terminal spawn/copies off-thread; tesseract runs in renderer-called worker? (tools dynamic-import in main — heavy). `fs` ops synchronous but small-cap. |
| Biggest wins | (1) 785 kB core → vendor-split React/Markdown, (2) virtualize message list, (3) tesseract/pdf-parse lazy-load timing, (4) WAL. |

---

## 12. CODE QUALITY

| Criterion | Score (0–10) | Notes |
|---|---|---|
| Architecture | 9 | clean 3-layer separation, contract via preload |
| Readability | 8 | idiomatic TS/React; some large files (SettingsView 700, WorkspaceView 859, ChatView, system.ts) |
| Maintainability | 8 | small stores, single ownership per IPC file |
| Scalability | 7 | fine for desktop single-user; store churn + no virtualization limit large-data |
| Modularity | 9 | strong (services/ipc/stores/components) |
| Reusability | 8 | shadcn-style UI kit; a few copy-paste gaps (test logic, theme selector) |
| Type safety | 8 | strict TS both sides; **WindowApi drift vs real preload** is the largest type debt |
| Naming | 9 | consistent, domain-clear |
| Consistency | 8 | one-writer-per-file kept; mixed direct-api-vs-store calls in views |
| Error handling | 6 | fatal dialogs + initError banner good; **many catches swallow silently** (usage, workspace ops, memory auto-extract, import) |

---

## 13. MISSING FEATURES (vs project's own declared trajectory — no generic ideas)

1. **Command palette (Ctrl+K)** — planned in earlier roadmap/todo, dropped. Navigation + provider switch + new chat + search.
2. **Notification center UI** — backend + `notifications` channels done; bell is absent; `uiStore.notifications` dead.
3. **Live model refresh from Settings** — `providers:list-models` + `refreshModels` exist, no button.
4. **Prompt insertion into active chat** — "Use" only copies.
5. **Usage live updates** — UsageView reloads on mount only.
6. **Branching/continue** — schema supports `parent_id`/`branch_id`; no UI.
7. **Vision/multimodal attach** — image/pdf read tools exist; ChatView filters attachments to text; no image→LLM payload.
8. **Tool-calling / agent loop** — CodingAgent is terminal+git UI, not an LLM agent; no function schemas.
9. **Auto-routing on/off UI** — `ai:auto-route` implemented, no toggle/indicator.
10. **Installer verification** — electron-builder config exists; `release/` empty; no packaged smoke test.
11. **Auto-update** — not configured.
12. **Tests/CI** — none.
13. **Retention/purge for usage & messages** — none.
14. **Logs** (structured, error file) — none.
15. **i18n / accessibility sweep** — none.
16. **macOS/Linux packaging targets** — none (win-only targets).
17. **Prompt variables UX into chat** — variables editor exists; injection missing.
18. **Backup schedule UI** (interval setter exists via backup:set-settings but Settings UI shows only create/restore — verify).

---

## 14. BUGS

### Known/resolved in this session (all closed, listed for record)
1. ✅ Streaming dead (requestId `''` vs server UUID) — fixed client+server uuid + captured stop id.
2. ✅ Window min/max/close threw (`system.*`) — now top-level.
3. ✅ Terminal/search arg-shape mismatches — variadic preload.
4. ✅ Regenerate no-op (`chat.deleteMessage` missing) — new handler.
5. ✅ deleteChat stale-messages case — fixed comparison.
6. ✅ Theme not persisted — persisted via uiStore→settings.
7. ✅ Attach button dead — wired select+filter+excerpt.
8. ✅ openFolder no auto-select; workspace rename/delete fed empty paths — fixed.
9. ✅ CSP warning + `frame-ancestors` meta noise — cleaned.

### Open/possible
- 🔴 (risk) **No tests** — anything can regress silently (the four arg-shape bugs above are a warning pattern).
- 🟠 `terminal:run` executes arbitrary commands with **no approval gate**; commands/`cwd` unvalidated (local-first, but a hostile script or XSS makes it RCE).
- 🟠 `workspace:read-file`/`tools:*` read **any path** (by design for attach/preview — could be narrowed to workspace+system-pick).
- 🟠 `backup:restore` accepts arbitrary user path.
- 🟡 Memory enable drift (two stores).
- 🟡 `notifications`/`backup:set-settings` handlers without UI surface (dead-ish).
- 🟡 Chat `deleteChat` now loads next chat correctly — *[inferred] code-reviewed only, not live-run*.
- 🟡 `streamMessage` enrich → `api().workspace.readFile` on binary/oversize returns `{error}` → gracefully skipped (verified path but not live).
- 🟡 pdf-parse + tesseract.js **dynamic imports** pull large engines into main at first call — first PDF/OCR incurs multi-second jank; never load-tested.
- 🟢 Headless-smoke GPU cache errors are sandbox/temp artifacts (not app bugs).

---

## 15. TECHNICAL DEBT

### Quick fixes (S)
1. `pnpm/npm uninstall` the 13 unused deps (see §1.5/§2): recharts, react-syntax-highlighter, katex, marked, marked-highlight, @tanstack/react-virtual, cmdk, @anthropic-ai/sdk, @google/generative-ai, electron-store, react-textarea-autosize, date-fns, sharp, uuid + 6 unused Radix (accordion/alert-dialog/collapsible/context-menu/slider/toast).
2. Resync `WindowApi` in `src/types/index.ts` to the real preload (delete dead `system.*`/legacy names).
3. Delete dead store fields: `selectedProvider`, `connectionStatuses`, `notifications`, `activePanel`; unused `searchResults`/`clearResults`.
4. Replace silent `catch {}`/`catch→0` in UsageView/WorkspaceView/import/memory-auto-extract with consistent `notifications.create` (existing channel!).
5. `postcss.config.js` → `postcss.config.cjs` (kills Vite module-type warning).
6. Dead code: `sqliteBackupMiddleware` no-op, `restoreBackupFile` stub, `sendMessage` remnants.

### Medium fixes (M)
7. WAL mode + FK `ON DELETE CASCADE` + usage retention purge.
8. Message-list virtualization (drop in `@tanstack/react-virtual` when ready) + Sidebar partial-store subscription.
9. Vendor-split core chunk (react, react-dom, react-markdown into 1–2 shared chunks) to shrink 785 kB main.
10. Terminal approval gate (visual confirm for each run) + `cwd` allowlist default (workspace roots + chosen folders).
11. Notification center UI (reuse existing list/mark-read channels).
12. Settings: live model refresh button; auto-routing toggle; backup interval control.
13. Prompt "insert into chat" (needs active-chat context; UI affordance).
14. Light-theme + empty-state design pass; a11y (focus rings already, labels audit).

### Large refactors (L)
15. Tool-calling / agentic loop in AI service + schema-driven tools in CodingAgent.
16. Embeddings-based memory retrieval (RAG) replacing/augmenting LIKE search.
17. Multi-modal attachments (image/pdf → vision-capable providers).
18. Test harness: Vitest for stores/preload + Playwright smoke for IPC contract (catches the arg-shape class of bugs).
19. Auto-updater + code-signing for macOS/Windows.
20. Structured logging service + crash-log viewer.

---

## 16. PROJECT STATISTICS

| Metric | Value |
|---|---|
| Source files | 62 (src 43 + electron 19) |
| Folders | ~14 (src subfolders 8, electron subfolders 3, scripts, build, dist, dist-electron) |
| Lines of code | src 6,908 · electron 3,681 · scripts 207 = **~10,796** (+ docs ~546) |
| React components | ~31 (8 views + 20 UI + layout3 + Markdown + Onboarding) |
| Zustand stores | 7 |
| IPC handlers | **99** (92 invoke-handle + 7 send-on) |
| Preload API methods | 91 invoke + 7 send |
| DB tables | 11 (+sqlite_sequence) |
| DB indexes | 6 |
| Feature areas (tabbed) | 6 views + settings + onboarding |
| Provider presets | 7 |
| Themes | 3 (dark/light/system) |
| Keyboard shortcuts | ~6 (Ctrl/Cmd+N new chat, zoom, reload, focus search; Enter/shift-Enter in composer; Esc close search) |
| Prod dependencies | 44 (≈14 radix used + ~13 unused + core) |
| Bundle | main 785.8 kB raw / 237.9 kB gz + 5 view chunks + UI shards |

---

## 17. ARCHITECTURE DIAGRAM

```
 User ──┐
        ▼
 ┌────────────── RENDERER (sandbox:true, contextIsolation:on) ─────────────┐
 │ React 18  →  AppLayout  →  6 views / onboarding / settings              │
 │             Zustand stores (7)                                          │
 │             window.api.*  (typed preload surface)                       │
 └───────────────┬──────────────────────────────────────────────────────────┘
                 │ contextBridge  (91 invoke + 7 send channels)
 ┌───────────────▼──────────────────────────────────────────────────────────┐
 │ PRELOAD (sandboxed, electron-only import)                                │
 └───────────────┬──────────────────────────────────────────────────────────┘
                 │ ipcRenderer.invoke / send / on
 ┌───────────────▼──────────────────────────────────────────────────────────┐
 │ ELECTRON MAIN (Node)                                                     │
 │  ipc/chat providers memory prompts settings usage workspace tools system │
 │  services/ai (index registry, providers SSE/completion)                  │
 │  services/security (safeStorage) · window-state · config                 │
 └───────┬──────────────────────┬──────────────────────────────┬────────────┘
         │                      │                              │
    SQLite (11 tables)    OS shell (dialogs/terminal)    Provider APIs (fetch)
         │                      │                              │
         ▼                      ▼                              ▼
   backups/import/export    git (simple-git)         OpenAI · Anthropic ·
   memory/prompts/usage     file system (sandbox)    Gemini · Groq · OpenRouter
                                                    · Ollama · LM Studio
                                                              │
                                                              ▼
                                                       SSE streaming →
                                                       renderer bubbles
```

---

## 18. EXECUTION FLOW

```
 launch-ai-workspace.bat / npm start
   │
   ▼ (build check → fresh build if dist missing)
 Electron.main
   ├─ config.dataDir()  (portable probe)
   ├─ initDatabase()      (open sqlite, runMigrations, seed defaults)
   ├─ migrateLegacyProviderKeys()   (encrypt any plaintext keys)
   ├─ register 9× ipc modules  (99 bindings)
   └─ createWindow()     (restore bounds, frame:false, icon)
        │ send window:maximized on toggle
        ▼
 renderer boots → AppLayout mount effect:
   ensureDefaults → loadSettings → applyTheme → loadProviders → restoreLastProvider
   → loadWorkspaces → restoreLastWorkspace → loadPrompts → loadChats('global')
   → setCurrentChat(lastChatId)   (errors → initError banner, non-blocking)
   ─ OnboardingDialog if no provider has a key ─
        ▼
 user types → ChatView.handleSend → addUserMessage → enrichment
   (file excerpts ≤4k, memory context) → streamMessage(requestId=uuid)
        ▼
 main ai:stream-chat → provider stream (SSE) → ai:chunk events (requestId-filtered)
        ▼
 streamingContent renders live; onDone persists assistant message + usage:record
        ▼
 auto-backup timer (default 24 h) → backups/backup-<ts>.db (retain 10)
```

---

## 19. PROFESSIONAL EVALUATION

### As a Senior Staff Engineer
Well-separated 3-layer architecture; parameterized SQL; explicit preload contract; deterministic builds; security work (safeStorage, masking, path sandbox, CSP) is above-average for a solo desktop app. The gap is **verification culture**: zero tests, silent catch-all swallowing, arg-shape contract drift evidenced by 4 class-of bug fixes in one session.

### As an Electron Architect
Solid fundamentals: sandbox:true, contextIsolation, frame control, native menu, window-state, fatal-dialog recovery, code-split renderer. Weakness: win-only packaging config, no auto-update, no signd, no mac/linux CI.

### As an AI Platform Engineer
Transport layer is clean and vendor-agnostic; SSE per provider family handled well. Missing the modern essentials: tool-calling, vision parts, embeddings/retrieval, routing UX, mid-stream cost. Streaming correctness now restored after the requestId fix.

| Category | Score /10 | Notes |
|---|---|---|
| Architecture | 9.0 | separation + contracts + parameterization |
| Code Quality | 8.5 | typing, naming, consistency; catch-hygiene drag |
| Scalability | 7.0 | fine at desktop scale; list perf + DB growth are limits |
| Maintainability | 8.0 | small modules; UI-file bloat + duplication |
| Portfolio Quality | 8.5 | impressive breadth + security + polish for a portfolio piece |
| Recruiter Appeal | 8.0 | security, streaming, Electron, full-stack spread |
| Open Source Quality | 7.5 | doc good; needs tests, CI, license, CONTRIBUTING |
| Production Readiness | 7.8 | shipped-app minus installer verification, tests, updater |

---

## 20. MASTER ROADMAP — Fluxora v1.0 Production Release

Grouped, effort-ranked. **P0 = release-blocking.**

### P0 — Release blockers (must ship)
| # | Work | Effort | Why |
|---|---|---|---|
| R1 | Full `npm run electron:build` packaged smoke test on clean Win machine (install → launch → chat → backup → update) | S | never verified |
| R2 | Test scaffolding: 6–8 integration tests over the preload↔handler contract (the arg-shape bug class) + 3 store unit tests; add `npm test` + GitHub Actions CI (win) | M | zero tests today |
| R3 | Error-handling pass: replace silent catches with `notifications.create` + view-local banners; unify Settings/Chat/Workspace/Usage | M | pts of failure invisible |
| R4 | Trim 13 unused runtime deps + 6 unused Radix (shrinks install + build surface) | S | hygiene/attack surface |
| R5 | Sync `WindowApi` types ↔ preload; delete dead store fields | S | type truth |

### P1 — High value (v1.0.1–1.1)
| # | Work | Effort |
|---|---|---|
| R6 | Message-list virtualization + Sidebar partial subscribe (perf for long chats) | M |
| R7 | Vendor-split core bundle (target main chunk → single-digit % shrink of gz payload) | S |
| R8 | Terminal run approval gate + default cwd allowlist (workspace roots) | S |
| R9 | WAL + FK CASCADE + usage/message retention purge | S |
| R10 | Provider UX: live model refresh button, auto-routing toggle, connection latency/detail | M |
| R11 | Notification center UI (channels ready) | M |
| R12 | Backup schedule control UI (interval + retention) | S |
| R13 | Prompt "insert into chat" affordance | S |

### P2 — Differentiators (v1.1–1.2)
| # | Work | Effort |
|---|---|---|
| R14 | Tool-calling: function schemas + agent loop; CodingAgent becomes real agent (read/run/git/webs.search) | L |
| R15 | Multimodal: image/PDF→vision providers (models flagged supportsVision; upscale raw file to payload) | M |
| R16 | Embeddings memory (local model optional) — retriev over LIKE | L |
| R17 | Command palette (Ctrl+K): nav, new chat, provider switch, search | M |
| R18 | Usage charts with the integrated recharts + live updates via store | M |
| R19 | Branching UI (schema ready) + model picker per branch | M |

### P3 — Platform (v1.2+)
| # | Work | Effort |
|---|---|---|
| R20 | macOS + Linux packaging targets + CI matrix + icon sets | M |
| R21 | Auto-update (electron-updater) + code signing (win+mac) | M |
| R22 | Structured logging + crash report viewer; DB size watcher | M |
| R23 | i18n shell + a11y sweep | L |
| R24 | Research/automation modes, plugins | L |

**Estimate:** P0 ≈ 4–6 focused build cycles · all of P0–P1 ≈ 6–10 cycles · full v1.0-feature ambition ≈ 15–20 cycles.

---

*End of audit. No source code was modified. Ready for prompt generation against the P0/P1 board.*
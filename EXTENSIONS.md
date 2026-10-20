# Fluxora Extension Architecture

Design-only specification for future extensibility.  
No full implementation required — these are documented seams.

## Extension Points

### 1. Plugin System
- **Settings key**: `plugins:registry` (JSON array of plugin manifests)
- **Preload namespace**: `plugins: { list, install, uninstall, activate, deactivate }`
- **Manifest shape**: `{ id, name, version, description, author, hooks: string[], settings?: Record<string,any> }`
- **Hook points**: `onBeforeSend`, `onAfterResponse`, `onWorkspaceOpen`, `onTabChange`, `onCommandRegister`
- Plugins are sandboxed to renderer process; no direct Node.js access

### 2. MCP (Model Context Protocol)
- **Settings key**: `mcp:servers` (JSON array of `{ name, command, args?, env? }`)
- **IPC channel prefix**: `mcp:*`
- **Core operations**: `mcp:connect(serverName)`, `mcp:list-tools(serverName)`, `mcp:call-tool(serverName, toolName, args)`
- **Integration**: tools appear alongside built-in tools in the composer's tool picker
- **Lifecycle**: connect on app start if enabled; disconnect on app quit

### 3. Voice I/O
- **Settings keys**: `voice:enabled`, `voice:provider`, `voice:apiKey`
- **IPC channel prefix**: `voice:*`
- **Core operations**: `voice:start-listening`, `voice:stop-listening`, `voice:transcribe(audioBuffer)`
- **Integration**: microphone button in composer; transcribed text fills input

### 4. Vision / Image Understanding
- **Already partially supported**: providers with `supportsVision: true` pass images via `AttachedFile` in `ai:stream-chat`
- **Future seam**: `tools:analyzeImage(filePath, prompt)` for standalone vision queries
- **Settings key**: `vision:enabled`

### 5. Automation Rules
- **Settings key**: `automation:rules` (JSON array)
- **Rule shape**: `{ id, trigger: 'onMessageSent'|'onFileChanged'|'onWorkspaceOpen', conditions: [...], actions: [...] }`
- **Examples**: auto-attach README on workspace open; auto-summarize files on drop; auto-commit after N messages

### 6. Multi-Agent Orchestration
- **IPC channel prefix**: `agent:*`
- **Core operations**: `agent:spawn(config)`, `agent:send(agentId, message)`, `agent:list`, `agent:kill(agentId)`
- **Agent config**: `{ name, systemPrompt, providerId, modelId, tools: string[] }`
- **Integration**: agent tab in sidebar; agents run as independent chat threads with shared workspace context

### 7. Cloud Sync (Optional)
- **Settings keys**: `sync:enabled`, `sync:provider`, `sync:apiKey`, `sync:endpoint`
- **Sync targets**: settings, prompts, memories, preferences (NOT chats — local-only by default)
- **IPC**: `sync:push`, `sync:pull`, `sync:status`
- **Conflict resolution**: last-write-wins with timestamp comparison

## How to Add a New Provider

Adding a new OpenAI-compatible provider requires only:
1. Provider name
2. Base URL
3. API key
4. Model name(s)

No application code changes needed. The provider system is fully data-driven via the `providers` table and settings UI.

## How to Add a New IPC Channel

1. Add handler in `electron/ipc/<module>.ts` using `ipcMain.handle('channel:name', ...)`
2. Register in `electron/main.ts` via the `registerModuleIpc()` pattern
3. Add to `electron/preload.ts` under the appropriate namespace
4. Add type signature to `src/types/api.ts`
5. Call from renderer via `window.api.<namespace>.<method>()`

## How to Add a New View/Tab

1. Create component in `src/components/<name>/`
2. Add lazy import in `src/components/layout/AppLayout.tsx`
3. Add case in `renderView()` switch
4. Add nav item in `src/components/layout/Sidebar.tsx` navItems array
5. Add to command palette group in `src/components/command/CommandPalette.tsx`

## Database Extension Pattern

To add a new table:
1. Add `CREATE TABLE IF NOT EXISTS` migration in `electron/database/index.ts`
2. Add table name to `getAllTables()`
3. Use `all/get/run/transaction` helpers from `electron/database/index.ts`
4. Add IPC handlers in `electron/ipc/<module>.ts`
5. Expose via preload

## Configuration Extension Pattern

New settings follow the existing pattern:
- Add default value to `DEFAULT_SETTINGS` in `electron/ipc/settings.ts`
- Read/write via `settings:get` / `settings:update` IPC
- Access in renderer via `useSettingsStore` (zustand)
- Access in main process via `getUserSettings()` or direct DB query

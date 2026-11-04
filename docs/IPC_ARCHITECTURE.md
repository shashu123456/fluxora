# IPC Architecture

All renderer↔main communication flows through Electron IPC. The preload script (`electron/preload.ts`) exposes a typed `window.api` object via `contextBridge`.

## Pattern

**Request/Response** (renderer → main → renderer):
```typescript
// Renderer
const result = await window.api.chat.list(workspaceId)

// Preload
list: (workspaceId?: string) => ipcRenderer.invoke('chat:list', workspaceId)

// Main
ipcMain.handle('chat:list', async (_e, workspaceId?) => { ... })
```

**Event Stream** (main → renderer):
```typescript
// Preload
onChunk: (cb) => { ipcRenderer.on('ai:chunk', handler); return () => ipcRenderer.off(...) }

// Main
mainWindow.webContents.send('ai:chunk', chunk)
```

## Channel Reference

### chat
| Channel | Direction | Args | Returns |
|---|---|---|---|
| chat:list | invoke | workspaceId? | Chat[] |
| chat:get | invoke | id | Chat |
| chat:create | invoke | partial | Chat |
| chat:update | invoke | id, patch | Chat |
| chat:delete | invoke | id | void |
| chat:messages | invoke | chatId | Message[] |
| chat:addMessage | invoke | chatId, message | Message |
| chat:updateMessage | invoke | id, patch | Message |
| chat:clearMessages | invoke | chatId | void |
| chat:deleteMessage | invoke | id | void |
| chat:search | invoke | workspaceId?, query | Chat[] |
| chat:export | invoke | chatId, path | void |
| chat:import | invoke | path | Chat |

### providers
| Channel | Direction | Args | Returns |
|---|---|---|---|
| providers:list | invoke | — | ProviderConfig[] |
| providers:create | invoke | config | ProviderConfig |
| providers:update | invoke | id, patch | ProviderConfig |
| providers:delete | invoke | id | void |
| providers:test | invoke | id | boolean |
| providers:testConnection | invoke | id | ProviderConnectionStatus |
| providers:testConfig | invoke | config | ProviderConnectionStatus |
| providers:detect | invoke | url | ProviderApiKind |
| providers:listModels | invoke | id | string[] |
| providers:refreshModels | invoke | id | ProviderConfig |
| providers:ensureDefaults | invoke | — | void |
| providers:getGlobalProviders | invoke | — | ProviderConfig[] |

### ai
| Channel | Direction | Args | Returns |
|---|---|---|---|
| ai:stream | invoke | AIChatRequest | void (fires events) |
| ai:chunk | event | — | AIStreamResponse |
| ai:done | event | — | { content, reasoning?, usage? } |
| ai:error | event | — | { message } |
| ai:stop | invoke | chatId | void |
| ai:complete | invoke | messages, options | string |
| ai:autoRoute | invoke | AutoRouteRequest | { providerId, modelId } |

### memory
| Channel | Direction | Args | Returns |
|---|---|---|---|
| memory:list | invoke | workspaceId? | MemoryEntry[] |
| memory:create | invoke | entry | MemoryEntry |
| memory:update | invoke | id, patch | MemoryEntry |
| memory:delete | invoke | id | void |
| memory:search | invoke | workspaceId?, query | MemoryEntry[] |
| memory:toggle | invoke | id | MemoryEntry |
| memory:getSettings | invoke | workspaceId | Settings |
| memory:setAutoRemember | invoke | workspaceId, enabled | void |
| memory:autoExtract | invoke | chatId | MemoryEntry[] |

### brain
| Channel | Direction | Args | Returns |
|---|---|---|---|
| brain:list | invoke | workspaceId | ProjectBrainEntry[] |
| brain:get | invoke | id | ProjectBrainEntry |
| brain:create | invoke | entry | ProjectBrainEntry |
| brain:update | invoke | id, patch | ProjectBrainEntry |
| brain:delete | invoke | id | void |
| brain:search | invoke | workspaceId, query | ProjectBrainEntry[] |

### workspace
| Channel | Direction | Args | Returns |
|---|---|---|---|
| workspace:list | invoke | — | Workspace[] |
| workspace:create | invoke | workspace | Workspace |
| workspace:update | invoke | id, patch | Workspace |
| workspace:delete | invoke | id | void |
| workspace:openFolder | invoke | — | Workspace \| null |
| workspace:selectFolder | invoke | — | string \| null |
| workspace:readFile | invoke | workspaceId, relPath | string |
| workspace:listDirectory | invoke | workspaceId, relPath? | FileEntry[] |
| workspace:searchFiles | invoke | workspaceId?, query | FileSearchResult[] |
| workspace:writeFile | invoke | workspaceId, relPath, content | void |
| workspace:createFile | invoke | workspaceId, relPath, content? | void |
| workspace:createDirectory | invoke | workspaceId, relPath | void |
| workspace:renameFile | invoke | workspaceId, from, to | void |
| workspace:deleteFile | invoke | workspaceId, relPath | void |
| workspace:getFileType | invoke | filename | string |
| workspace:getFileStats | invoke | workspaceId, relPath | Stats |
| workspace:index | invoke | workspaceId | WorkspaceIndex |
| workspace:getIndex | invoke | workspaceId | WorkspaceIndex \| null |

### Terminal
| Channel | Direction | Args | Returns |
|---|---|---|---|
| terminal:run | invoke | workspaceId, command, cwd?, approved? | { output, exitCode, durationMs } |
| terminal:history | invoke | workspaceId | TerminalCommand[] |

### git
| Channel | Direction | Args | Returns |
|---|---|---|---|
| git:status | invoke | workspaceId | GitStatus |
| git:commit | invoke | workspaceId, message | string |
| git:diff | invoke | workspaceId | DiffResult |

### tools
| Channel | Direction | Args | Returns |
|---|---|---|---|
| tools:readPdf | invoke | path | string |
| tools:readImage | invoke | path | string |
| tools:ocrImage | invoke | path | string |
| tools:parseJson | invoke | path | unknown |
| tools:detectFile | invoke | path | string |

### prompts
| Channel | Direction | Args | Returns |
|---|---|---|---|
| prompts:list | invoke | workspaceId? | PromptTemplate[] |
| prompts:create | invoke | template | PromptTemplate |
| prompts:update | invoke | id, patch | PromptTemplate |
| prompts:delete | invoke | id | void |

### settings
| Channel | Direction | Args | Returns |
|---|---|---|---|
| settings:get | invoke | — | AppSettings |
| settings:update | invoke | patch | AppSettings |
| settings:exportAll | invoke | path | void |
| settings:import | invoke | path? | { ok, counts, warnings } |
| settings:validate-import | invoke | path? | validation summary |
| settings:export | invoke | — | void |
| settings:reset | invoke | — | void |
| settings:erase-all | invoke | — | void |

### backup
| Channel | Direction | Args | Returns |
|---|---|---|---|
| backup:create | invoke | — | string (path) |
| backup:list | invoke | — | BackupInfo[] |
| backup:restore | invoke | path | { ok, preRestorePath, relaunching } |
| backup:export-file | invoke | — | { path, manifest } |
| backup:import-file | invoke | — | { ok, preRestorePath, relaunching } |
| backup:get-settings | invoke | — | Settings |
| backup:set-settings | invoke | settings | void |

### usage
| Channel | Direction | Args | Returns |
|---|---|---|---|
| usage:record | invoke | record | UsageRecord |
| usage:summary | invoke | workspaceId? | Summary |
| usage:detailed | invoke | workspaceId?, limit | UsageRecord[] |
| usage:byProvider | invoke | workspaceId? | ProviderBreakdown[] |
| usage:clear | invoke | workspaceId? | void |

### search
| Channel | Direction | Args | Returns |
|---|---|---|---|
| search:global | invoke | query | GlobalSearchResult[] |

### notifications
| Channel | Direction | Args | Returns |
|---|---|---|---|
| notifications:list | invoke | — | NotificationItem[] |
| notifications:create | invoke | item | NotificationItem |
| notifications:markRead | invoke | id | void |
| notifications:markAllRead | invoke | — | void |
| notifications:delete | invoke | id | void |

### dialogs
| Channel | Direction | Args | Returns |
|---|---|---|---|
| dialogs:selectFile | invoke | options? | string \| null |
| dialogs:selectFiles | invoke | options? | string[] |
| dialogs:selectFolder | invoke | — | string \| null |
| dialogs:saveFile | invoke | options? | string \| null |

### system
| Channel | Direction | Args | Returns |
|---|---|---|---|
| system:getInfo | invoke | — | SystemInfo |
| system:dbInfo | invoke | — | DbInfo |
| system:analytics | invoke | — | Analytics |
| system:openDataDir | invoke | — | void |

### Window (preload-only, no ipcMain.handle)
| Method | Description |
|---|---|
| window.minimize | Minimize window |
| window.maximize | Toggle maximize |
| window.close | Close window |
| window.isMaximized | Check state |
| window.showItemInFolder | Open file location |
| window.openExternal | Open URL in browser |
| window.platform | Get OS platform |
| window.onMenuNewChat | Subscribe to menu event |
| window.onMenuAbout | Subscribe to menu event |
| window.onMenuOpenDataDir | Subscribe to menu event |

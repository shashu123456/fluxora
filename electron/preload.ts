import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  showItemInFolder: (p: string) => ipcRenderer.send('shell:show-item', p),
  openExternal: (url: string) => ipcRenderer.send('shell:open-external', url),
  platform: process.platform,
  onMenuNewChat: (cb: () => void) => {
    ipcRenderer.on('menu:new-chat', cb)
    return () => ipcRenderer.removeListener('menu:new-chat', cb)
  },
  onMenuAbout: (cb: () => void) => {
    ipcRenderer.on('menu:about', cb)
    return () => ipcRenderer.removeListener('menu:about', cb)
  },
  onMenuOpenDataDir: (cb: () => void) => {
    ipcRenderer.on('menu:open-data-dir', cb)
    return () => ipcRenderer.removeListener('menu:open-data-dir', cb)
  },

  // Chats
  chat: {
    list: (workspaceId: string) => ipcRenderer.invoke('chat:list', workspaceId),
    get: (id: string) => ipcRenderer.invoke('chat:get', id),
    create: (data: any) => ipcRenderer.invoke('chat:create', data),
    update: (id: string, data: any) => ipcRenderer.invoke('chat:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('chat:delete', id),
    messages: (chatId: string) => ipcRenderer.invoke('chat:messages', chatId),
    addMessage: (msg: any) => ipcRenderer.invoke('chat:add-message', msg),
    updateMessage: (id: string, data: any) => ipcRenderer.invoke('chat:update-message', id, data),
    clearMessages: (chatId: string) => ipcRenderer.invoke('chat:clear-messages', chatId),
    deleteMessage: (id: string) => ipcRenderer.invoke('chat:delete-message', id),
    search: (workspaceId: string, query: string) => ipcRenderer.invoke('chat:search', workspaceId, query),
    exportChat: (chatId: string) => ipcRenderer.invoke('chat:export', chatId),
    importChat: () => ipcRenderer.invoke('chat:import'),
  },

  // Providers
  providers: {
    list: () => ipcRenderer.invoke('providers:list'),
    create: (data: any) => ipcRenderer.invoke('providers:create', data),
    update: (id: string, data: any) => ipcRenderer.invoke('providers:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('providers:delete', id),
    test: (id: string) => ipcRenderer.invoke('providers:test', id),
    testConnection: (id: string) => ipcRenderer.invoke('providers:test', id),
    testConfig: (data: any) => ipcRenderer.invoke('providers:test-config', data),
    detect: (data: { baseUrl: string; apiKey?: string }) => ipcRenderer.invoke('providers:detect', data),
    listModels: (id: string) => ipcRenderer.invoke('providers:list-models', id),
    refreshModels: (id: string) => ipcRenderer.invoke('providers:refresh-models', id),
    ensureDefaults: () => ipcRenderer.invoke('providers:ensure-defaults'),
    getGlobalProviders: () => ipcRenderer.invoke('providers:global-list'),
    rotate: (id: string) => ipcRenderer.invoke('providers:rotate', id),
    secretMetadata: (id: string) => ipcRenderer.invoke('providers:secret-metadata', id),
  },

  apis: {
    list: () => ipcRenderer.invoke('apis:list'),
    get: (apiId: string) => ipcRenderer.invoke('apis:get', apiId),
    connect: (apiId: string, secret?: string) => ipcRenderer.invoke('apis:connect', apiId, secret),
    disconnect: (apiId: string) => ipcRenderer.invoke('apis:disconnect', apiId),
    test: (apiId: string) => ipcRenderer.invoke('apis:test', apiId),
    audit: (limit?: number) => ipcRenderer.invoke('apis:audit', limit),
    catalogVersion: () => ipcRenderer.invoke('apis:catalog-version'),
  },

  // Streaming AI
  ai: {
    streamChat: (payload: any) => ipcRenderer.send('ai:stream-chat', payload),
    onChunk: (cb: (data: any) => void) => {
      const listener = (_e: any, data: any) => cb(data)
      ipcRenderer.on('ai:chunk', listener)
      return () => ipcRenderer.removeListener('ai:chunk', listener)
    },
    onDone: (cb: (data: any) => void) => {
      const listener = (_e: any, data: any) => cb(data)
      ipcRenderer.on('ai:done', listener)
      return () => ipcRenderer.removeListener('ai:done', listener)
    },
    onError: (cb: (data: any) => void) => {
      const listener = (_e: any, data: any) => cb(data)
      ipcRenderer.on('ai:error', listener)
      return () => ipcRenderer.removeListener('ai:error', listener)
    },
    stop: (requestId: string) => ipcRenderer.send('ai:stop', requestId),
    complete: (payload: any) => ipcRenderer.invoke('ai:complete', payload),
    autoRoute: (payload: any) => ipcRenderer.invoke('ai:auto-route', payload),
    recommend: (payload: any) => ipcRenderer.invoke('ai:recommend', payload),
  },

  // Memory
  memory: {
    list: (workspaceId: string) => ipcRenderer.invoke('memory:list', workspaceId),
    create: (data: any) => ipcRenderer.invoke('memory:create', data),
    update: (id: string, data: any) => ipcRenderer.invoke('memory:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('memory:delete', id),
    search: (...args: any[]) => {
      const workspaceId = args.length > 1 ? args[0] : 'global'
      const query = args.length > 1 ? args[1] : args[0]
      return ipcRenderer.invoke('memory:search', workspaceId, query)
    },
    toggle: (...args: any[]) => {
      const workspaceId = args.length > 1 ? args[0] : 'global'
      const enabled = args.length > 1 ? args[1] : args[0]
      return ipcRenderer.invoke('memory:toggle', workspaceId, !!enabled)
    },
    getSettings: (workspaceId?: string) => ipcRenderer.invoke('memory:settings', workspaceId),
    setAutoRemember: (workspaceId: string, enabled: boolean) => ipcRenderer.invoke('memory:auto-remember', workspaceId, enabled),
    autoExtract: (workspaceId: string, content: string) => ipcRenderer.invoke('memory:auto-extract', workspaceId, content),
  },

  // Project Brain
  brain: {
    list: (workspaceId: string) => ipcRenderer.invoke('brain:list', workspaceId),
    get: (id: string) => ipcRenderer.invoke('brain:get', id),
    create: (data: any) => ipcRenderer.invoke('brain:create', data),
    update: (id: string, data: any) => ipcRenderer.invoke('brain:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('brain:delete', id),
    search: (workspaceId: string, query: string) => ipcRenderer.invoke('brain:search', workspaceId, query),
    sync: (workspaceId: string) => ipcRenderer.invoke('brain:sync', workspaceId),
    insights: (workspaceId: string) => ipcRenderer.invoke('brain:insights', workspaceId),
  },

  // Workspaces
  workspace: {
    list: () => ipcRenderer.invoke('workspace:list'),
    create: (data: any) => ipcRenderer.invoke('workspace:create', data),
    update: (id: string, data: any) => ipcRenderer.invoke('workspace:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('workspace:delete', id),
    openFolder: () => ipcRenderer.invoke('workspace:open-folder'),
    selectFolder: () => ipcRenderer.invoke('workspace:select-folder'),
    readFile: (p: string) => ipcRenderer.invoke('workspace:read-file', p),
    listDirectory: (p: string) => ipcRenderer.invoke('workspace:list-directory', p),
    searchFiles: (...args: any[]) => {
      if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
        const o = args[0] as { rootPath?: string; path?: string; query?: string }
        return ipcRenderer.invoke('workspace:search-files', o.rootPath ?? o.path, o.query ?? '')
      }
      return ipcRenderer.invoke('workspace:search-files', args[0], args[1])
    },
    writeFile: (p: string, content: string) => ipcRenderer.invoke('workspace:write-file', p, content),
    createFile: (...args: any[]) => {
      if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
        const o = args[0] as { path: string; content?: string }
        return ipcRenderer.invoke('workspace:create-file', o.path, o.content ?? '')
      }
      return ipcRenderer.invoke('workspace:create-file', args[0], args[1])
    },
    createDirectory: (p: string) => ipcRenderer.invoke('workspace:create-directory', p),
    renameFile: (p: string, newName: string) => ipcRenderer.invoke('workspace:rename-file', p, newName),
    deleteFile: (p: string) => ipcRenderer.invoke('workspace:delete-file', p),
    getFileType: (p: string) => ipcRenderer.invoke('workspace:file-type', p),
    getFileStats: (p: string) => ipcRenderer.invoke('workspace:file-stats', p),
    index: (workspaceId: string) => ipcRenderer.invoke('workspace:index', workspaceId),
    getIndex: (workspaceId: string) => ipcRenderer.invoke('workspace:get-index', workspaceId),
    intelligence: (workspaceId: string) => ipcRenderer.invoke('workspace:intelligence', workspaceId),
    buildIntelligence: (workspaceId: string) => ipcRenderer.invoke('workspace:build-intelligence', workspaceId),
  },

  // Terminal & Git
  terminal: {
    run: (request: {
      workspaceId?: string
      command: string
      cwd?: string
      timeoutMs?: number
    }) => ipcRenderer.invoke('terminal:run', request),
    history: (workspaceId: string = 'global') => ipcRenderer.invoke('terminal:history', workspaceId),
    cancel: (runId: string) => ipcRenderer.invoke('terminal:cancel', runId),
    activity: (workspaceId?: string) => ipcRenderer.invoke('terminal:activity', workspaceId),
    context: (workspaceId: string) => ipcRenderer.invoke('terminal:context', workspaceId),
    recommendations: (workspaceId: string) => ipcRenderer.invoke('terminal:recommendations', workspaceId),
    onUpdated: (cb: (event: unknown) => void) => {
      const listener = (_event: unknown, payload: unknown) => cb(payload)
      ipcRenderer.on('terminal:updated', listener)
      return () => ipcRenderer.removeListener('terminal:updated', listener)
    },
    onOutput: (cb: (event: unknown) => void) => {
      const listener = (_event: unknown, payload: unknown) => cb(payload)
      ipcRenderer.on('terminal:output', listener)
      return () => ipcRenderer.removeListener('terminal:output', listener)
    },
  },
  git: {
    status: (cwd: string) => ipcRenderer.invoke('git:status', cwd),
    commit: (cwd: string, message: string) => ipcRenderer.invoke('git:commit', cwd, message),
    diff: (cwd: string, filePath: string) => ipcRenderer.invoke('git:diff', cwd, filePath),
  },

  // Tools
  tools: {
    readPdf: (p: string) => ipcRenderer.invoke('tools:read-pdf', p),
    readImage: (p: string) => ipcRenderer.invoke('tools:read-image', p),
    ocrImage: (p: string) => ipcRenderer.invoke('tools:ocr-image', p),
    parseJson: (content: string) => ipcRenderer.invoke('tools:parse-json', content),
    detectFile: (p: string) => ipcRenderer.invoke('tools:detect-file', p),
  },

  // Prompts
  prompts: {
    list: (workspaceId?: string) => ipcRenderer.invoke('prompts:list', workspaceId ?? 'global'),
    create: (data: any) => ipcRenderer.invoke('prompts:create', data),
    update: (id: string, data: any) => ipcRenderer.invoke('prompts:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('prompts:delete', id),
  },

  // Settings
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (data: any) => ipcRenderer.invoke('settings:update', data),
    exportAll: () => ipcRenderer.invoke('settings:export'),
    importAll: (filePath?: string) => ipcRenderer.invoke('settings:import', filePath),
    exportAllData: () => ipcRenderer.invoke('settings:export'),
    importAllData: (filePath?: string) => ipcRenderer.invoke('settings:import', filePath),
    validateImport: (filePath?: string) => ipcRenderer.invoke('settings:validate-import', filePath),
    reset: () => ipcRenderer.invoke('settings:reset'),
    eraseAll: () => ipcRenderer.invoke('settings:erase-all'),
  },

  // Backup
  backup: {
    create: () => ipcRenderer.invoke('backup:create'),
    list: () => ipcRenderer.invoke('backup:list'),
    restore: (path: string) => ipcRenderer.invoke('backup:restore', path),
    exportFile: () => ipcRenderer.invoke('backup:export-file'),
    importFile: () => ipcRenderer.invoke('backup:import-file'),
    getSettings: () => ipcRenderer.invoke('backup:get-settings'),
    setSettings: (s: any) => ipcRenderer.invoke('backup:set-settings', s),
  },

  // Usage
  usage: {
    record: (data: any) => ipcRenderer.invoke('usage:record', data),
    summary: (providerId?: string) => ipcRenderer.invoke('usage:summary', providerId),
    detailed: (providerId?: string) => ipcRenderer.invoke('usage:detailed', providerId),
    byProvider: () => ipcRenderer.invoke('usage:by-provider'),
    clear: (providerId?: string) => ipcRenderer.invoke('usage:clear', providerId),
  },

  // Search
  search: {
    global: (query: string, workspaceId?: string) => ipcRenderer.invoke('search:global', { query, workspaceId }),
  },

  // Notifications
  notifications: {
    list: () => ipcRenderer.invoke('notifications:list'),
    create: (data: any) => ipcRenderer.invoke('notifications:create', data),
    markRead: (id: string) => ipcRenderer.invoke('notifications:mark-read', id),
    markAllRead: () => ipcRenderer.invoke('notifications:mark-all-read'),
    delete: (id: string) => ipcRenderer.invoke('notifications:delete', id),
  },

  // Workspace Intelligence
  intelligence: {
    get: (workspaceId: string) => ipcRenderer.invoke('intelligence:get', workspaceId),
    rebuild: (workspaceId: string) => ipcRenderer.invoke('intelligence:rebuild', workspaceId),
    recommendations: (workspaceId: string) => ipcRenderer.invoke('intelligence:recommendations', workspaceId),
    timeline: (workspaceId: string, limit?: number) => ipcRenderer.invoke('intelligence:timeline', workspaceId, limit),
    evolve: (workspaceId: string) => ipcRenderer.invoke('intelligence:evolve', workspaceId),
  },

  // Developer learning layer
  developer: {
    profile: () => ipcRenderer.invoke('developer:profile'),
    insights: () => ipcRenderer.invoke('developer:insights'),
    sessions: (limit?: number) => ipcRenderer.invoke('developer:sessions', limit),
    briefing: (workspaceId?: string | null, focusHint?: string | null) =>
      ipcRenderer.invoke('developer:briefing', workspaceId, focusHint),
    overview: (workspaceId?: string | null, focusHint?: string | null) =>
      ipcRenderer.invoke('developer:overview', workspaceId, focusHint),
    personalization: () => ipcRenderer.invoke('developer:personalization'),
    affinity: () => ipcRenderer.invoke('developer:affinity'),
    track: (kind: string, input?: any) => ipcRenderer.invoke('developer:track', kind, input),
    memory: {
      list: () => ipcRenderer.invoke('developer:memory:list'),
      create: (data: any) => ipcRenderer.invoke('developer:memory:create', data),
      update: (id: string, data: any) => ipcRenderer.invoke('developer:memory:update', id, data),
      delete: (id: string) => ipcRenderer.invoke('developer:memory:delete', id),
    },
    reset: (options?: any) => ipcRenderer.invoke('developer:reset', options),
  },

  // Misc
  dialogs: {
    selectFile: () => ipcRenderer.invoke('dialog:select-file'),
    selectFiles: () => ipcRenderer.invoke('dialog:select-files'),
    selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
    saveFile: (opts: any) => ipcRenderer.invoke('dialog:save-file', opts),
  },
  system: {
    getInfo: () => ipcRenderer.invoke('system:info'),
    dbInfo: () => ipcRenderer.invoke('system:db-info'),
    analytics: () => ipcRenderer.invoke('system:analytics'),
    openDataDir: () => ipcRenderer.invoke('system:open-data-dir'),
  },
}

contextBridge.exposeInMainWorld('api', api)
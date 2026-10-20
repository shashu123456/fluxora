export interface FullWindowApi {
  minimize: () => void
  maximize: () => void
  close: () => void
  isMaximized: () => Promise<boolean>
  showItemInFolder: (path: string) => void
  openExternal: (url: string) => void
  platform: string
  onMenuNewChat: (cb: () => void) => () => void
  onMenuAbout: (cb: () => void) => () => void
  onMenuOpenDataDir: (cb: () => void) => () => void
  onMaximizeChange?: (cb: (isMax: boolean) => void) => () => void

  chat: {
    list: (workspaceId: string) => Promise<any[]>
    get: (id: string) => Promise<any>
    create: (data: any) => Promise<any>
    update: (id: string, data: any) => Promise<any>
    delete: (id: string) => Promise<any>
    messages: (chatId: string) => Promise<any[]>
    addMessage: (msg: any) => Promise<any>
    updateMessage: (id: string, data: any) => Promise<any>
    clearMessages: (chatId: string) => Promise<any>
    deleteMessage: (id: string) => Promise<any>
    search: (workspaceId: string, query: string) => Promise<any[]>
    exportChat: (chatId: string) => Promise<any>
    importChat: () => Promise<any>
  }

  providers: {
    list: () => Promise<any[]>
    create: (data: any) => Promise<any>
    update: (id: string, data: any) => Promise<any>
    delete: (id: string) => Promise<any>
    test: (id: string) => Promise<any>
    testConnection: (id: string) => Promise<any>
    testConfig: (data: any) => Promise<any>
    detect: (data: { baseUrl: string; apiKey?: string }) => Promise<any>
    listModels: (id: string) => Promise<any[]>
    refreshModels: (id: string) => Promise<any>
    ensureDefaults: () => Promise<any>
    getGlobalProviders: () => Promise<any[]>
  }

  ai: {
    streamChat: (payload: any) => void
    onChunk: (cb: (data: any) => void) => () => void
    onDone: (cb: (data: any) => void) => () => void
    onError: (cb: (data: any) => void) => () => void
    stop: (requestId: string) => void
    complete: (payload: any) => Promise<any>
    autoRoute: (payload: any) => Promise<any>
  }

  memory: {
    list: (workspaceId: string) => Promise<any[]>
    create: (data: any) => Promise<any>
    update: (id: string, data: any) => Promise<any>
    delete: (id: string) => Promise<any>
    search: (...args: any[]) => Promise<any[]>
    toggle: (...args: any[]) => Promise<any>
    getSettings: () => Promise<any>
    setAutoRemember: (workspaceId: string, enabled: boolean) => Promise<any>
    autoExtract: (workspaceId: string, content: string) => Promise<any[]>
  }

  brain: {
    list: (workspaceId: string) => Promise<any[]>
    get: (id: string) => Promise<any>
    create: (data: any) => Promise<any>
    update: (id: string, data: any) => Promise<any>
    delete: (id: string) => Promise<any>
    search: (workspaceId: string, query: string) => Promise<any[]>
  }

  workspace: {
    list: () => Promise<any[]>
    create: (data: any) => Promise<any>
    update: (id: string, data: any) => Promise<any>
    delete: (id: string) => Promise<any>
    openFolder: () => Promise<string | null>
    selectFolder: () => Promise<string | null>
    readFile: (p: string) => Promise<any>
    listDirectory: (p: string) => Promise<any[]>
    searchFiles: (...args: any[]) => Promise<any[]>
    writeFile: (p: string, content: string) => Promise<any>
    createFile: (...args: any[]) => Promise<any>
    createDirectory: (p: string) => Promise<any>
    renameFile: (p: string, newName: string) => Promise<any>
    deleteFile: (p: string) => Promise<any>
    getFileType: (p: string) => Promise<string>
    getFileStats: (p: string) => Promise<any>
    index: (workspaceId: string) => Promise<any>
    getIndex: (workspaceId: string) => Promise<any>
  }

  terminal: {
    run: (...args: any[]) => Promise<any>
    history: (...args: any[]) => Promise<any[]>
  }

  git: {
    status: (cwd: string) => Promise<any>
    commit: (cwd: string, message: string) => Promise<any>
    diff: (cwd: string, filePath?: string) => Promise<any>
  }

  tools: {
    readPdf: (p: string) => Promise<any>
    readImage: (p: string) => Promise<any>
    ocrImage: (p: string) => Promise<any>
    parseJson: (content: string) => Promise<any>
    detectFile: (p: string) => Promise<any>
  }

  prompts: {
    list: (workspaceId?: string) => Promise<any[]>
    create: (data: any) => Promise<any>
    update: (id: string, data: any) => Promise<any>
    delete: (id: string) => Promise<any>
  }

  settings: {
    get: () => Promise<any>
    update: (data: any) => Promise<any>
    exportAll: () => Promise<any>
    importAll: () => Promise<any>
    exportAllData: () => Promise<any>
    importAllData: () => Promise<any>
    reset: () => Promise<any>
  }

  backup: {
    create: () => Promise<any>
    list: () => Promise<any[]>
    restore: (path: string) => Promise<any>
    exportFile: () => Promise<any>
    importFile: () => Promise<any>
    getSettings: () => Promise<any>
    setSettings: (s: any) => Promise<any>
  }

  usage: {
    record: (data: any) => Promise<any>
    summary: (providerId?: string) => Promise<any>
    detailed: (providerId?: string) => Promise<any[]>
    byProvider: () => Promise<any[]>
    clear: (providerId?: string) => Promise<any>
  }

  search: {
    global: (query: string) => Promise<import('../types').GlobalSearchResult[]>
  }

  notifications: {
    list: () => Promise<any[]>
    create: (data: any) => Promise<any>
    markRead: (id: string) => Promise<any>
    markAllRead: () => Promise<any>
    delete: (id: string) => Promise<any>
  }

  dialogs: {
    selectFile: () => Promise<string | null>
    selectFiles: () => Promise<string[]>
    selectFolder: () => Promise<string | null>
    saveFile: (opts: any) => Promise<string | null>
  }

  system: {
    getInfo: () => Promise<any>
    dbInfo: () => Promise<any>
    analytics: () => Promise<any>
    openDataDir: () => Promise<any>
  }

  [key: string]: any
}
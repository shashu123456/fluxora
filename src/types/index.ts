export type WorkspaceScope = 'global' | 'workspace'

export type ProviderApiKind = 'openai' | 'anthropic' | 'gemini'

export interface ProviderCapabilities {
  apiKind: ProviderApiKind
  detectedType: string
  supportsStreaming: boolean
  supportsVision: boolean
  contextWindow?: number
  limits?: Record<string, unknown>
  detectedAt: number
}

export interface ProviderConfig {
  id: string
  name: string
  type: 'openai' | 'anthropic' | 'gemini' | 'custom'
  baseUrl: string
  apiKey: string
  hasKey?: boolean
  models: ModelConfig[]
  enabled: boolean
  isCustom: boolean
  color?: string
  capabilities?: ProviderCapabilities
  createdAt: number
  updatedAt: number
}

export interface ModelConfig {
  id: string
  name: string
  providerId: string
  supportsStreaming: boolean
  supportsVision?: boolean
  contextWindow?: number
  maxOutputTokens?: number
  costPer1kInput?: number
  costPer1kOutput?: number
}

export interface Chat {
  id: string
  workspaceId: string
  title: string
  pinned: number
  archived: number
  favorite: number
  createdAt: number
  updatedAt: number
  providerId?: string
  modelId?: string
}

export interface Message {
  id: string
  chatId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  reasoning?: string
  createdAt: number
  model?: string
  providerId?: string
  files?: AttachedFile[]
  usage?: TokenUsage
  status?: 'complete' | 'error' | 'streaming'
  parentId?: string | null
  branchId?: string
  tokenCount?: number
}

export interface AttachedFile {
  id: string
  name: string
  path: string
  type: string
  size: number
  content?: string
  preview?: string
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost?: number
}

export interface MemoryEntry {
  id: string
  workspaceId: string
  scope: WorkspaceScope
  type: 'user' | 'conversation' | 'project' | 'custom'
  content: string
  createdAt: number
  updatedAt: number
  source?: string
  pinned?: number
  tags?: string[]
}

export type ProjectBrainKind = 'note' | 'decision' | 'architecture' | 'convention' | 'todo'

export interface ProjectBrainEntry {
  id: string
  workspaceId: string
  title: string
  content: string
  kind: ProjectBrainKind
  status?: string
  tags?: string[]
  pinned: number
  source: string
  createdAt: number
  updatedAt: number
}

export interface PromptTemplate {
  id: string
  workspaceId: string
  name: string
  content: string
  category: string
  pinned: number
  variables: PromptVariable[]
  description?: string
  createdAt: number
  updatedAt: number
}

export interface PromptVariable {
  name: string
  defaultValue: string
  description?: string
}

export interface Workspace {
  id: string
  name: string
  path?: string
  createdAt: number
  updatedAt: number
  color?: string
  icon?: string
  lastOpenedAt?: number
  settings?: WorkspaceSettings
}

export interface WorkspaceSettings {
  systemPrompt?: string
  defaultProviderId?: string
  defaultModelId?: string
  temperature?: number
  memoryEnabled?: boolean
  autoRemember?: boolean
}

export interface UsageRecord {
  id: number
  providerId: string
  model: string
  chatId?: string
  workspaceId?: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost: number
  responseTimeMs: number
  streaming: number
  status: 'success' | 'error' | 'streaming'
  createdAt: number
}

export interface AppSettings {
  theme: 'dark' | 'light' | 'system'
  fontSize: 'sm' | 'md' | 'lg'
  sidebarWidth: number
  language: string
  portableMode: boolean
  defaultProviderId?: string
  defaultModelId?: string
  temperature?: number
  maxTokens?: number
  autoRoute?: boolean
  dataDir?: string
  autoSave: boolean
  autoBackup: boolean
  backupIntervalHours: number
  restoreOnStartup: boolean
  lastChatId?: string
  lastWorkspaceId?: string
  shortcutOverrides?: Record<string, string>
  crashRecoveryEnabled: boolean
  notificationsEnabled: boolean
  markdownEnabled: boolean
  codeHighlightingEnabled: boolean
  showReasoning: boolean
  streamingEnabled: boolean
}

export interface TerminalCommand {
  id: string
  workspaceId: string
  command: string
  output: string
  exitCode: number | null
  cwd: string
  createdAt: number
  durationMs: number
  approvedBy?: string
}

export interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  modifiedAt: number
  children?: FileEntry[]
}

export interface DiffResult {
  filePath: string
  oldContent: string
  newContent: string
  additions: number
  deletions: number
}

export interface GitStatus {
  branch: string
  changes: {
    path: string
    status: string
  }[]
  ahead: number
  behind: number
}

export interface NotificationItem {
  id: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  timestamp: number
  read: boolean
}

export interface FileSearchResult {
  path: string
  name: string
  matches: {
    line: number
    text: string
  }[]
}

export interface ImportExportData {
  app: string
  version: string
  exportedAt: string
  settings: AppSettings
  providers: ProviderConfig[]
  chats: Chat[]
  messages: Message[]
  memories: MemoryEntry[]
  prompts: PromptTemplate[]
  workspaces: Workspace[]
  usage: UsageRecord[]
  notifications: NotificationItem[]
}

export interface ChatExportData {
  app: string
  type: 'chat'
  exportedAt: string
  chat: Chat
  messages: Message[]
}

export interface ProviderConnectionStatus {
  providerId: string
  ok: boolean
  latencyMs?: number
  error?: string
  models?: string[]
}

export interface AIMessageParam {
  role: 'system' | 'user' | 'assistant'
  content: string
  name?: string
}

export interface AIStreamResponse {
  id: string
  content: string
  reasoning?: string
  usage?: TokenUsage
  model?: string
  error?: string
}

export interface WindowApi {
  minimize: () => void
  maximize: () => void
  close: () => void
  isMaximized: () => Promise<boolean>
  onMaximizeChange: (cb: (isMax: boolean) => void) => () => void
  showItemInFolder: (path: string) => void
  openExternal: (url: string) => void
  platform: string
}

export interface AIChatRequest {
  providerId: string
  modelId: string
  messages: AIMessageParam[]
  temperature?: number
  maxTokens?: number
  stream?: boolean
  signal?: AbortSignal
  files?: AttachedFile[]
}

export interface AutoRouteRequest {
  message: string
  availableProviders: ProviderConfig[]
  usage: Record<string, { totalTokens: number; cost: number }>
}

export interface WorkspaceIndex {
  languages: { lang: string; count: number }[]
  fileCount: number
  dirCount: number
  totalSize: number
  git: { isRepo: boolean; branch?: string; hasChanges?: boolean; lastCommit?: string }
  packageManagers: string[]
  frameworks: string[]
  configFiles: { name: string; path: string }[]
  dependencies: Record<string, Record<string, string>>
  readme?: string
  readmeSnippet?: string
  topStructure: string[]
  recentFiles: { path: string; modifiedAt: number }[]
  indexedAt: number
  durationMs?: number
}

export interface GlobalSearchResult {
  group: 'chats' | 'messages' | 'prompts' | 'memories' | 'providers' | 'models' | 'workspaces' | 'files' | 'settings' | 'terminal'
  id: string
  title: string
  subtitle?: string
  snippet?: string
  meta?: string
  action?: { kind: 'openChat' | 'openView' | 'setActiveChat' | 'pickModel' | 'openWorkspace' } & Record<string, any>
  score: number
}

export interface CommandPaletteItem {
  id: string
  group: string
  title: string
  subtitle?: string
  icon?: string
  keywords?: string[]
  action: (args: any) => void
  args?: any
}
import { ipcMain, dialog, BrowserWindow } from 'electron'
import { all, get, run, transaction, getAllTables } from '../database'
import { AppSettings, ImportExportData } from '../../src/types'
import fs from 'fs'
import path from 'path'
import { getDataDir } from '../config'
import { sendNotification } from './system'

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  fontSize: 'md',
  sidebarWidth: 280,
  language: 'en',
  portableMode: false,
  autoSave: true,
  autoBackup: true,
  backupIntervalHours: 24,
  restoreOnStartup: true,
  crashRecoveryEnabled: true,
  notificationsEnabled: true,
  markdownEnabled: true,
  codeHighlightingEnabled: true,
  showReasoning: true,
  streamingEnabled: true,
}

export function getDefaultSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS }
}

export function registerSettingsIpc() {
  ipcMain.handle('settings:get', async () => {
    const rows = await all<any>('SELECT * FROM settings WHERE key NOT LIKE "memory_%" AND key NOT LIKE "backup_%"')
    const settings: any = { ...DEFAULT_SETTINGS }
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value)
      } catch {
        settings[row.key] = row.value
      }
    }
    if (settings.backupSettings) {
      settings.backupEnabled = settings.backupSettings.backupEnabled
      settings.backupIntervalHours = settings.backupSettings.intervalHours
    }
    return settings
  })

  ipcMain.handle('settings:update', async (_e, data: Partial<AppSettings>) => {
    const now = Date.now()
    for (const [key, value] of Object.entries(data)) {
      await run(
        "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        [key, JSON.stringify(value), now]
      )
    }
    return true
  })

  ipcMain.handle('settings:export', async (_e) => {
    const data = await exportAllData()
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showSaveDialog(win!, {
      title: 'Export All Data',
      defaultPath: path.join(getDataDir(), `ai-workspace-export-${Date.now()}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return null
    fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2))
    return result.filePath
  })

  ipcMain.handle('settings:import', async (_e) => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      title: 'Import Data',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const data = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf-8'))
    await importAllData(data)
    sendNotification('Import Complete', 'All data has been imported successfully', 'success')
    return true
  })

  ipcMain.handle('settings:reset', async (_e) => {
    await transaction(async () => {
      const tables = getAllTables()
      for (const table of tables) {
        await run(`DELETE FROM ${table}`)
      }
    })
    return true
  })
}

export async function exportAllData(): Promise<ImportExportData> {
  const [settingsRows, providerRows, workspaceRows, chatRows, messageRows, memoryRows, promptRows, usageRows, notificationRows] = await Promise.all([
    all<any>('SELECT * FROM settings'),
    all<any>('SELECT * FROM providers'),
    all<any>('SELECT * FROM workspaces'),
    all<any>('SELECT * FROM chats'),
    all<any>('SELECT * FROM messages'),
    all<any>('SELECT * FROM memories'),
    all<any>('SELECT * FROM prompts'),
    all<any>('SELECT * FROM usage'),
    all<any>('SELECT * FROM notifications'),
  ])

  const settings: any = { ...DEFAULT_SETTINGS }
  for (const row of settingsRows) {
    try {
      settings[row.key] = JSON.parse(row.value)
    } catch {
      settings[row.key] = row.value
    }
  }

  return {
    app: 'ai-workspace',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    settings,
    providers: providerRows.map((r) => ({
      id: r.id, name: r.name, type: r.type, baseUrl: r.base_url, apiKey: '',
      models: JSON.parse(r.models || '[]'), enabled: !!r.enabled, isCustom: !!r.is_custom,
      color: r.color, createdAt: r.created_at, updatedAt: r.updated_at,
    })),
    chats: chatRows.map((r) => ({
      id: r.id, workspaceId: r.workspace_id, title: r.title, pinned: r.pinned, archived: r.archived,
      favorite: r.favorite, createdAt: r.created_at, updatedAt: r.updated_at, providerId: r.provider_id, modelId: r.model_id,
    })),
    messages: messageRows.map((r) => ({
      id: r.id, chatId: r.chat_id, role: r.role, content: r.content, reasoning: r.reasoning,
      createdAt: r.created_at, model: r.model, providerId: r.provider_id,
      files: r.files ? JSON.parse(r.files) : undefined,
      usage: r.usage ? JSON.parse(r.usage) : undefined,
      status: r.status, parentId: r.parent_id, branchId: r.branch_id, tokenCount: r.token_count,
    })),
    memories: memoryRows.map((r) => ({
      id: r.id, workspaceId: r.workspace_id, scope: r.scope, type: r.type, content: r.content,
      source: r.source, pinned: r.pinned, tags: r.tags ? JSON.parse(r.tags) : undefined,
      createdAt: r.created_at, updatedAt: r.updated_at,
    })),
    prompts: promptRows.map((r) => ({
      id: r.id, workspaceId: r.workspace_id, name: r.name, content: r.content,
      category: r.category, pinned: r.pinned, variables: JSON.parse(r.variables || '[]'),
      createdAt: r.created_at, updatedAt: r.updated_at,
    })),
    workspaces: workspaceRows.map((r) => ({
      id: r.id, name: r.name, path: r.path, createdAt: r.created_at, updatedAt: r.updated_at,
      color: r.color, icon: r.icon, lastOpenedAt: r.last_opened_at,
      settings: r.settings ? JSON.parse(r.settings) : undefined,
    })),
    usage: usageRows.map((r) => ({
      id: r.id, providerId: r.provider_id, model: r.model, chatId: r.chat_id,
      workspaceId: r.workspace_id, promptTokens: r.prompt_tokens, completionTokens: r.completion_tokens,
      totalTokens: r.total_tokens, cost: r.cost, responseTimeMs: r.response_time_ms,
      streaming: r.streaming, status: r.status, createdAt: r.created_at,
    })),
    notifications: notificationRows.map((r) => ({
      id: r.id, title: r.title, message: r.message, type: r.type,
      timestamp: r.timestamp, read: !!r.read,
    })),
  }
}

async function importAllData(data: ImportExportData) {
  await transaction(async () => {
    if (data.settings) {
      for (const [k, v] of Object.entries(data.settings)) {
        await run(
          'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
          [k, JSON.stringify(v), Date.now()]
        )
      }
    }
    for (const p of data.providers || []) {
      await run(
        'INSERT OR REPLACE INTO providers (id, name, type, base_url, api_key, models, enabled, is_custom, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [p.id, p.name, p.type, p.baseUrl, p.apiKey, JSON.stringify(p.models), p.enabled ? 1 : 0, p.isCustom ? 1 : 0, p.color, p.createdAt, p.updatedAt]
      )
    }
    for (const w of data.workspaces || []) {
      await run(
        'INSERT OR REPLACE INTO workspaces (id, name, path, color, icon, created_at, updated_at, last_opened_at, settings) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [w.id, w.name, w.path, w.color, w.icon, w.createdAt, w.updatedAt, w.lastOpenedAt, w.settings ? JSON.stringify(w.settings) : null]
      )
    }
    for (const c of data.chats || []) {
      await run(
        'INSERT OR REPLACE INTO chats (id, workspace_id, title, pinned, archived, favorite, provider_id, model_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [c.id, c.workspaceId, c.title, c.pinned, c.archived, c.favorite, c.providerId, c.modelId, c.createdAt, c.updatedAt]
      )
    }
    for (const m of data.messages || []) {
      await run(
        'INSERT OR REPLACE INTO messages (id, chat_id, role, content, reasoning, model, provider_id, files, usage, status, parent_id, branch_id, token_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [m.id, m.chatId, m.role, m.content, m.reasoning, m.model, m.providerId,
         m.files ? JSON.stringify(m.files) : null, m.usage ? JSON.stringify(m.usage) : null,
         m.status, m.parentId, m.branchId, m.tokenCount, m.createdAt]
      )
    }
    for (const mem of data.memories || []) {
      await run(
        'INSERT OR REPLACE INTO memories (id, workspace_id, scope, type, content, source, pinned, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [mem.id, mem.workspaceId, mem.scope, mem.type, mem.content, mem.source, mem.pinned, mem.tags ? JSON.stringify(mem.tags) : null, mem.createdAt, mem.updatedAt]
      )
    }
    for (const pr of data.prompts || []) {
      await run(
        'INSERT OR REPLACE INTO prompts (id, workspace_id, name, content, category, pinned, variables, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [pr.id, pr.workspaceId, pr.name, pr.content, pr.category, pr.pinned, JSON.stringify(pr.variables), pr.createdAt, pr.updatedAt]
      )
    }
    for (const u of data.usage || []) {
      await run(
        'INSERT OR REPLACE INTO usage (id, provider_id, model, chat_id, workspace_id, prompt_tokens, completion_tokens, total_tokens, cost, response_time_ms, streaming, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [u.id, u.providerId, u.model, u.chatId, u.workspaceId, u.promptTokens, u.completionTokens, u.totalTokens, u.cost, u.responseTimeMs, u.streaming, u.status, u.createdAt]
      )
    }
    for (const n of data.notifications || []) {
      await run(
        'INSERT OR REPLACE INTO notifications (id, title, message, type, timestamp, read) VALUES (?, ?, ?, ?, ?, ?)',
        [n.id, n.title, n.message, n.type, n.timestamp, n.read ? 1 : 0]
      )
    }
  })
}

export async function getUserSettings(): Promise<AppSettings> {
  const rows = await all<any>('SELECT * FROM settings')
  const settings: any = { ...DEFAULT_SETTINGS }
  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value)
    } catch {
      settings[row.key] = row.value
    }
  }
  return settings
}
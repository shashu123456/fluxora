import { ipcMain, BrowserWindow, app, shell, dialog } from 'electron'
import { randomUUID } from 'crypto'
import { get } from '../database'
import { streamChat, completeChat, getProviderById } from '../services/ai'
import { ModelConfig, TokenUsage, AIMessageParam, ProviderConfig } from '../../src/types'
import { getDataDir } from '../config'
import { getWorkspaceSettings } from './workspace'
import path from 'path'
import fs from 'fs'
import { runTerminalCommand, cancelTerminalRun, listRunningCommands } from '../services/terminal/process'
import { getTerminalContext, getTerminalRecommendations } from '../services/terminal/insights'
import { getSecretManager } from '../services/secrets/manager'

const activeStreams = new Map<string, AbortController>()
let mainWindowRef: BrowserWindow | null = null

export function setMainWindow(win: BrowserWindow | null) {
  mainWindowRef = win
}

export function sendNotification(title: string, message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
  const win = mainWindowRef || BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    win.webContents.send('notification:new', { title, message, type })
  }
}

startNotificationSink()

function startNotificationSink() {
  ipcMain.handle('notifications:list', async () => {
    const { all } = await import('../database')
    const rows = await all<any>('SELECT * FROM notifications ORDER BY timestamp DESC LIMIT 200')
    return rows.map((r) => ({
      id: r.id, title: r.title, message: r.message, type: r.type,
      timestamp: r.timestamp, read: !!r.read,
    }))
  })

  ipcMain.handle('notifications:create', async (_e, data: any) => {
    const { run } = await import('../database')
    const now = Date.now()
    await run(
      'INSERT OR REPLACE INTO notifications (id, title, message, type, timestamp, read) VALUES (?, ?, ?, ?, ?, 0)',
      [data.id || randomUUID(), data.title, data.message, data.type || 'info', now]
    )
    return true
  })

  ipcMain.handle('notifications:mark-read', async (_e, id: string) => {
    const { run } = await import('../database')
    await run('UPDATE notifications SET read = 1 WHERE id = ?', [id])
    return true
  })

  ipcMain.handle('notifications:mark-all-read', async () => {
    const { run } = await import('../database')
    await run('UPDATE notifications SET read = 1')
    return true
  })

  ipcMain.handle('notifications:delete', async (_e, id: string) => {
    const { run } = await import('../database')
    await run('DELETE FROM notifications WHERE id = ?', [id])
    return true
  })
}

function persistNotification(n: { title: string; message: string; type: string }) {
  const { run } = require('../database') as typeof import('../database')
  run(
    'INSERT INTO notifications (id, title, message, type, timestamp, read) VALUES (?, ?, ?, ?, ?, 0)',
    [randomUUID(), n.title, n.message, n.type, Date.now()]
  ).catch(() => {})
}

export function registerSystemIpc() {
  ipcMain.on('window:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.on('window:maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })
  ipcMain.on('window:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())
  ipcMain.handle('window:is-maximized', (e) => BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false)

  ipcMain.on('shell:show-item', (_e, p: string) => {
    if (typeof p !== 'string' || !p.trim()) return
    try {
      if (!fs.existsSync(p)) return
    } catch {
      return
    }
    shell.showItemInFolder(p)
  })
  ipcMain.on('shell:open-external', (_e, url: string) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(url)
      }
    } catch {
      // ignore malformed URLs
    }
  })

  ipcMain.handle('system:info', async () => {
    const os = require('os') as typeof import('os')
    const cpus = os.cpus()
    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      chromeVersion: process.versions.chrome,
      v8Version: process.versions.v8,
      platform: process.platform,
      arch: process.arch,
      osType: os.type(),
      osRelease: os.release(),
      osArch: os.arch(),
      hostname: os.hostname(),
      locale: app.getLocale(),
      cpuModel: cpus[0]?.model || 'unknown',
      cpuCount: cpus.length,
      totalMem: os.totalmem(),
      freeMem: os.freemem(),
      uptime: os.uptime(),
      appPath: app.getAppPath(),
      exePath: process.execPath,
      dataDir: getDataDir(),
      userDataDir: app.getPath('userData'),
    }
  })

  ipcMain.handle('system:open-data-dir', async () => {
    shell.openPath(getDataDir())
    return true
  })

  ipcMain.handle('system:db-info', async () => {
    const { all } = await import('../database')
    const dbFile = path.join(getDataDir(), 'aiworkspace.db')
    const sizes = { db: 0, wal: 0, shm: 0 }
    for (const [key, suffix] of [['db', ''], ['wal', '-wal'], ['shm', '-shm']] as const) {
      try { sizes[key] = fs.statSync(dbFile + suffix).size } catch { sizes[key] = 0 }
    }
    const tables = await all<any>('SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE ? ORDER BY name', ['table', 'sqlite_%'])
    const rows: { name: string; count: number }[] = []
    for (const t of tables) {
      try {
        const r = await all<any>(`SELECT COUNT(*) AS c FROM "${t.name}"`)
        rows.push({ name: t.name, count: r[0]?.c || 0 })
      } catch {
        rows.push({ name: t.name, count: -1 })
      }
    }
    let journalMode = 'unknown'
    try {
      const jm = await all<any>('PRAGMA journal_mode')
      journalMode = jm[0]?.journal_mode || 'unknown'
    } catch {}
    return { dbFile, sizes, tables: rows, journalMode }
  })

  ipcMain.handle('system:analytics', async () => {
    const os = require('os') as typeof import('os')
    const { all } = await import('../database')
    const mem = process.memoryUsage()
    const cpus = os.cpus()

    let usage: any = null
    try {
      const agg = await all<any>(
        `SELECT COUNT(*) AS requests,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS ok,
                SUM(prompt_tokens) AS promptTokens,
                SUM(completion_tokens) AS completionTokens,
                SUM(total_tokens) AS totalTokens,
                SUM(cost) AS cost,
                AVG(response_time_ms) AS avgResponseMs,
                COUNT(DISTINCT chat_id) AS conversations
         FROM usage`
      )
      usage = { ...agg[0], successRate: (agg[0]?.ok || 0) / Math.max((agg[0]?.requests || 0), 1) }
    } catch {}

    let chatCount = 0
    let messageCount = 0
    let memoryCount = 0
    let promptCount = 0
    try {
      chatCount = (await all<any>('SELECT COUNT(*) AS c FROM chats'))[0]?.c || 0
      messageCount = (await all<any>('SELECT COUNT(*) AS c FROM messages'))[0]?.c || 0
      memoryCount = (await all<any>('SELECT COUNT(*) AS c FROM memories'))[0]?.c || 0
      promptCount = (await all<any>('SELECT COUNT(*) AS c FROM prompts'))[0]?.c || 0
    } catch {}

    const osFree = os.freemem()
    const osTotal = os.totalmem()
    return {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers || 0,
      uptime: process.uptime(),
      cpuLoad: cpus.map((c) => c.times).reduce((p, c) => p + c.user + c.nice + c.sys + c.idle, 0) as number,
      cpuCount: cpus.length,
      osFreeMem: osFree,
      osTotalMem: osTotal,
      memUsagePct: osTotal > 0 ? Math.round(((osTotal - osFree) / osTotal) * 100) : 0,
      usage: usage || { requests: 0, ok: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0, avgResponseMs: 0, conversations: 0, successRate: 0 },
      counts: { chats: chatCount, messages: messageCount, memories: memoryCount, prompts: promptCount },
    }
  })

  ipcMain.handle('ai:complete', async (_e, payload: any) => {
    const { providerId, modelId, messages, temperature, maxTokens } = payload
    const provider = await getProviderById(providerId)
    if (!provider) throw new Error('Provider not found')
    const model = provider.models.find((m: ModelConfig) => m.id === modelId)
    if (!model) throw new Error('Model not found')
    sqliteBackupMiddleware(provider)
    const secretManager = getSecretManager()
    const result = await secretManager.withProviderSecret(providerId, async (secret) => {
      const p = { ...provider, apiKey: secret || provider.apiKey || '' }
      return await completeChat(p, model, messages, { temperature, maxTokens })
    })
    return result
  })

  ipcMain.handle('ai:auto-route', async (_e, payload: any) => {
    const { message, workspaceId } = payload
    const { all } = await import('../database')
    const rows = await all<any>('SELECT * FROM providers WHERE enabled = 1')
    const providers = rows.map((r: any) => ({
      id: r.id, name: r.name, type: r.type, baseUrl: r.base_url, apiKey: '',
      models: JSON.parse(r.models || '[]'), enabled: !!r.enabled, isCustom: !!r.is_custom,
      color: r.color, createdAt: r.created_at, updatedAt: r.updated_at,
    }))
    if (providers.length === 0) return null

    // Workspace preference wins — remember preferred provider/model per workspace
    if (workspaceId && workspaceId !== 'global') {
      const wsRows = await all<any>('SELECT settings FROM workspaces WHERE id = ?', [workspaceId])
      const wsSettings = wsRows[0]?.settings ? JSON.parse(wsRows[0].settings) : {}
      const prefProviderId = wsSettings.defaultProviderId
      const prefModelId = wsSettings.defaultModelId
      const prefProvider = prefProviderId
        ? providers.find((p: any) => p.id === prefProviderId)
        : null
      if (prefProvider && prefProvider.models.length > 0) {
        const model = prefProvider.models.find((m: any) => m.id === prefModelId) || prefProvider.models[0]
        return { providerId: prefProvider.id, modelId: model?.id }
      }
    }

    // Spend-weighted routing: the main process owns the usage aggregate so the
    // renderer never has to ship a usage map with every request.
    let usage: Record<string, { totalTokens: number; cost: number }> = {}
    try {
      const usageRows = await all<any>(
        'SELECT provider_id as providerId, SUM(total_tokens) as totalTokens, SUM(cost) as cost FROM usage GROUP BY provider_id'
      )
      for (const r of usageRows) {
        usage[r.providerId] = { totalTokens: r.totalTokens || 0, cost: r.cost || 0 }
      }
    } catch { /* usage unavailable */ }

    // Favourite models nudge routing toward the models the user already prefers.
    let favourites: Record<string, string> = {}
    try {
      const row = await get<any>("SELECT value FROM settings WHERE key = 'favorite_models'")
      if (row?.value) {
        const parsed = JSON.parse(row.value)
        if (parsed && typeof parsed === 'object') favourites = parsed
      }
    } catch { /* favourites unavailable */ }

    const needsVision = containsImageHint(message)
    const scorer = providers.map((p: any, order: number) => {
      let score = 0
      const pUsage = usage[p.id]
      if (pUsage) {
        score -= Math.min((pUsage.totalTokens || 0) / 2000000, 0.3)
      }
      const hasModels = p.models.length > 0
      if (!hasModels) score -= 100
      if (needsVision) {
        score += p.models.some((m: ModelConfig) => m.supportsVision) ? 2 : -2
      }
      if (favourites[p.id]) score += 0.25
      // Deterministic tie-break keeps routing stable across identical requests.
      score -= order * 0.0001
      return { provider: p, score }
    })
    scorer.sort((a: any, b: any) => b.score - a.score)
    const chosen = scorer[0]
    const favouriteModel = favourites[chosen.provider.id]
    const model =
      (favouriteModel && chosen.provider.models.find((m: any) => m.id === favouriteModel)) ||
      chosen.provider.models[0]
    return { providerId: chosen.provider.id, modelId: model?.id }
  })

  ipcMain.handle('ai:recommend', async (_e, payload: any) => {
    const { task, workspaceId } = payload
    const { all } = await import('../database')
    const rows = await all<any>('SELECT * FROM providers WHERE enabled = 1')
    const providers: ProviderConfig[] = rows.map((r: any) => ({
      id: r.id, name: r.name, type: r.type, baseUrl: r.base_url, apiKey: r.api_key,
      models: JSON.parse(r.models || '[]'), enabled: !!r.enabled, isCustom: !!r.is_custom,
      color: r.color, capabilities: r.capabilities ? JSON.parse(r.capabilities) : undefined,
      createdAt: r.created_at, updatedAt: r.updated_at,
    }))
    let index = null
    if (workspaceId && workspaceId !== 'global') {
      try {
        const idxRow = await get<any>('SELECT data FROM workspace_index WHERE workspace_id = ?', [workspaceId])
        index = idxRow?.data ? JSON.parse(idxRow.data) : null
      } catch { /* no index */ }
    }
    const { recommend } = await import('../services/ai/orchestrate')
    return recommend({ task: task || '', providers, index })
  })

  ipcMain.on('ai:stream-chat', async (e, payload: any) => {
    const sender = e.sender
    const requestId = payload.requestId || randomUUID()
    const { providerId, modelId, messages, temperature, maxTokens, chatId, workspaceId } = payload
    const controller = new AbortController()
    activeStreams.set(requestId, controller)
    // A closed window must not leave the upstream request running.
    const abortOnWindowClose = () => controller.abort()
    sender.once('destroyed', abortOnWindowClose)
    persistNotification({ title: 'Stream Started', message: `Streaming to ${modelId}`, type: 'info' })

    const startedAt = Date.now()
    let accumulatedText = ''
    try {
      const provider = await getProviderById(providerId)
      if (!provider) throw new Error('Provider not found')
      const model = provider.models.find((m: any) => m.id === modelId)
      if (!model) throw new Error(`Model ${modelId} not found`)

      const secretManager = getSecretManager()
      await secretManager.withProviderSecret(providerId, async (secret) => {
        const p = { ...provider, apiKey: secret || provider.apiKey || '' }
        await streamChat(p, model, messages, {
        onChunk: (text) => {
          accumulatedText += text
          if (!sender.isDestroyed()) {
            sender.send('ai:chunk', { requestId, delta: text })
          }
        },
        onDone: async (result) => {
          activeStreams.delete(requestId)
          sender.off('destroyed', abortOnWindowClose)
          const elapsed = Date.now() - startedAt
          const usage = result.usage
          const cost = estimateCost(model, usage)
          await recordUsage({
            providerId, model: model.id, chatId, workspaceId,
            promptTokens: usage?.promptTokens || 0,
            completionTokens: usage?.completionTokens || accumulatedText.length,
            totalTokens: usage?.totalTokens || Math.max(accumulatedText.length,
              (startedAt && messages.reduce((a: number, m: AIMessageParam) => a + m.content.length, 0) || 0)),
            cost,
            responseTimeMs: elapsed,
            streaming: 1,
            status: 'success',
          })
          const memoryPrompt = await buildMemoryContext(workspaceId, messages as AIMessageParam[])
          if (memoryPrompt) {
            sender.send('ai:memory-context', { requestId, memoryPrompt })
          }
          if (!sender.isDestroyed()) {
            sender.send('ai:done', {
              requestId,
              content: accumulatedText,
              usage,
              model: result.model || model.id,
              cost,
            })
          }
        },
        onError: (err) => {
          activeStreams.delete(requestId)
          sender.off('destroyed', abortOnWindowClose)
          recordUsage({
            providerId, model: model.id, chatId, workspaceId,
            promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0,
            responseTimeMs: Date.now() - startedAt, streaming: 0, status: 'error',
          }).catch(() => {})
          if (!sender.isDestroyed()) {
            sender.send('ai:error', { requestId, error: err.message })
          }
        },
        signal: controller.signal,
      }, { temperature, maxTokens })
      })
    } catch (err: any) {
      activeStreams.delete(requestId)
      sender.off('destroyed', abortOnWindowClose)
      if (!sender.isDestroyed()) {
        sender.send('ai:error', { requestId, error: err.message })
      }
    }
  })

  ipcMain.on('ai:stop', (_e, requestId: string) => {
    const controller = activeStreams.get(requestId)
    if (controller) {
      controller.abort()
      activeStreams.delete(requestId)
    }
  })

  ipcMain.handle('terminal:run', async (_e, payload: any, legacyCommand?: string, legacyCwd?: string) => {
    const request =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? {
            workspaceId: payload.workspaceId,
            command: payload.command,
            cwd: payload.cwd,
            timeoutMs: payload.timeoutMs,
          }
        : { workspaceId: payload, command: legacyCommand, cwd: legacyCwd }
    return runTerminalCommand(request)
  })

  ipcMain.handle('terminal:cancel', async (_e, runId: string) => cancelTerminalRun(runId))

  ipcMain.handle('terminal:activity', async (_e, workspaceId?: string) => {
    const { all } = await import('../database')
    const rows = workspaceId
      ? await all<any>(
          `SELECT * FROM terminal_history WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 12`,
          [workspaceId]
        )
      : await all<any>(`SELECT * FROM terminal_history ORDER BY created_at DESC LIMIT 12`)
    return {
      running: listRunningCommands(),
      recent: rows.map(mapTerminalHistoryRow),
      generatedAt: Date.now(),
    }
  })

  ipcMain.handle('terminal:context', async (_e, workspaceId: string) => getTerminalContext(workspaceId))

  ipcMain.handle('terminal:recommendations', async (_e, workspaceId: string) =>
    getTerminalRecommendations(workspaceId)
  )

  ipcMain.handle('terminal:history', async (_e, workspaceId: string) => {
    const { all } = await import('../database')
    const rows = await all<any>(
      'SELECT * FROM terminal_history WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 200',
      [workspaceId]
    )
    return rows.map(mapTerminalHistoryRow)
  })

  ipcMain.handle('git:status', async (_e, cwd: string) => {
    const simpleGit = (await import('simple-git')).default
    const git = simpleGit(cwd)
    try {
      const status = await git.status()
      return {
        branch: status.current || '',
        changes: status.files.map((f) => ({ path: f.path, status: f.index + f.working_dir })),
        ahead: status.ahead,
        behind: status.behind,
      }
    } catch {
      return { branch: '', changes: [], ahead: 0, behind: 0 }
    }
  })

  ipcMain.handle('git:commit', async (_e, cwd: string, message: string) => {
    const simpleGit = (await import('simple-git')).default
    const git = simpleGit(cwd)
    await git.add('.')
    const result = await git.commit(message)
    return result.commit
  })

  ipcMain.handle('git:diff', async (_e, cwd: string, filePath?: string) => {
    const simpleGit = (await import('simple-git')).default
    const git = simpleGit(cwd)
    const args = ['HEAD']
    if (filePath) args.push('--', filePath)
    const diff = await git.diff(args)
    return diff
  })

  ipcMain.handle('backup:create', async (_e) => {
    const { createBackup } = require('../database/backup') as typeof import('../database/backup')
    const p = await createBackup()
    sendNotification('Backup Created', `Backup saved: ${path.basename(p)}`, 'success')
    return p
  })

  ipcMain.handle('backup:list', async () => {
    const { listBackups } = require('../database/backup') as typeof import('../database/backup')
    return listBackups()
  })

  ipcMain.handle('backup:restore', async (_e, backupPath: string) => {
    const { restoreBackup } = require('../database/backup') as typeof import('../database/backup')
    const result = await restoreBackup(backupPath)
    setTimeout(() => {
      app.relaunch()
      app.exit(0)
    }, 250)
    return { ok: true, ...result, relaunching: true }
  })

  ipcMain.handle('backup:export-file', async (_e) => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showSaveDialog(win!, {
      title: 'Export Database Backup',
      defaultPath: path.join(getDataDir(), `fluxora-${Date.now()}.db`),
      filters: [{ name: 'Database', extensions: ['db'] }],
    })
    if (result.canceled || !result.filePath) return null
    const { exportDatabase } = require('../database/backup') as typeof import('../database/backup')
    const manifest = await exportDatabase(result.filePath)
    return { path: result.filePath, manifest }
  })

  ipcMain.handle('backup:import-file', async (_e) => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      title: 'Import Database Backup',
      filters: [{ name: 'Database', extensions: ['db'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const { importDatabase } = require('../database/backup') as typeof import('../database/backup')
    const preRestorePath = await importDatabase(result.filePaths[0])
    sendNotification('Restore Complete', 'Database restored from backup. Relaunching…', 'warning')
    setTimeout(() => {
      app.relaunch()
      app.exit(0)
    }, 250)
    return { ok: true, path: result.filePaths[0], preRestorePath, relaunching: true }
  })

  ipcMain.handle('backup:get-settings', async () => {
    const { getBackupSettings } = require('../database/backup') as typeof import('../database/backup')
    return getBackupSettings()
  })

  ipcMain.handle('backup:set-settings', async (_e, settings: any) => {
    const { setBackupSettings } = require('../database/backup') as typeof import('../database/backup')
    await setBackupSettings(settings)
    return true
  })
}

function sqliteBackupMiddleware(provider: any) {
  if (provider.type === 'openai' && provider.baseUrl.includes('api.openai.com')) {
    return
  }
}

function containsImageHint(message: string): boolean {
  return /image|screenshot|photo|picture|ocr|pdf|analyze.*image|look at/i.test(message)
}

async function recordUsage(data: any) {
  try {
    const { run } = await import('../database')
    await run(
      'INSERT INTO usage (provider_id, model, chat_id, workspace_id, prompt_tokens, completion_tokens, total_tokens, cost, response_time_ms, streaming, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [data.providerId, data.model, data.chatId || null, data.workspaceId || null,
       data.promptTokens, data.completionTokens, data.totalTokens || (data.promptTokens + data.completionTokens),
       data.cost, data.responseTimeMs, data.streaming, data.status, Date.now()]
    )
  } catch {}
}

const PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5 / 1000, output: 10 / 1000 },
  'gpt-4o-mini': { input: 0.15 / 1000, output: 0.6 / 1000 },
  'claude-3-5-sonnet-20240620': { input: 3 / 1000, output: 15 / 1000 },
  'claude-3-opus-20240229': { input: 15 / 1000, output: 75 / 1000 },
  'gemini-1.5-pro': { input: 1.25 / 1000, output: 5 / 1000 },
  'gemini-1.5-flash': { input: 0.075 / 1000, output: 0.3 / 1000 },
  'llama-3.3-70b-versatile': { input: 0.59 / 1000, output: 0.79 / 1000 },
  'llama-3.1-70b-versatile': { input: 0.59 / 1000, output: 0.79 / 1000 },
}

function estimateCost(model: ModelConfig, usage?: TokenUsage): number {
  if (!usage) return 0
  const price = PRICING[model.id]
  if (!price) return 0
  return (usage.promptTokens / 1000) * price.input + (usage.completionTokens / 1000) * price.output
}

async function buildMemoryContext(workspaceId: string, messages: AIMessageParam[]): Promise<string | null> {
  try {
    const workspaceSettings = await getWorkspaceSettings(workspaceId)
    if (workspaceSettings.memoryEnabled === false) return null
    const { all } = await import('../database')
    const rows = await all<any>('SELECT * FROM memories WHERE workspace_id = ? OR workspace_id = ? ORDER BY pinned DESC, updated_at DESC LIMIT 20', [workspaceId, 'global'])
    if (rows.length === 0) return null
    const context = rows.map((r) => `- [${r.scope}/${r.type}] ${r.content}`).join('\n')
    return context
  } catch {
    return null
  }
}

function mapTerminalHistoryRow(row: any) {
  const status =
    row.status ||
    (row.exit_code === 0 ? 'success' : row.exit_code === null || row.exit_code === undefined ? 'failed' : 'failed')
  return {
    id: row.id,
    runId: row.id,
    workspaceId: row.workspace_id,
    command: row.command,
    output: row.output,
    exitCode: row.exit_code,
    cwd: row.cwd,
    createdAt: row.created_at,
    startedAt: row.created_at,
    finishedAt: row.finished_at ?? null,
    durationMs: row.duration_ms,
    approvedBy: row.approved_by,
    commandHash: row.command_hash,
    approvalId: row.approval_id,
    status,
    outputSize: row.output_size || 0,
    truncated: Boolean(row.truncated),
    cancelled: Boolean(row.cancelled),
  }
}
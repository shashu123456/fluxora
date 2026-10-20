import { ipcMain, BrowserWindow, app, shell, dialog } from 'electron'
import { randomUUID } from 'crypto'
import { get } from '../database'
import { streamChat, completeChat, getProviderById } from '../services/ai'
import { ModelConfig, TokenUsage, AIMessageParam } from '../../src/types'
import { getDataDir } from '../config'
import { getWorkspaceSettings } from './workspace'
import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'

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
    const model = provider.models.find((m: any) => m.id === modelId)
    if (!model) throw new Error(`Model ${modelId} not found`)
    sqliteBackupMiddleware(provider)
    const result = await completeChat(provider, model, messages, { temperature, maxTokens })
    return result
  })

  ipcMain.handle('ai:auto-route', async (_e, payload: any) => {
    const { message, usage, workspaceId } = payload
    const { all } = await import('../database')
    const rows = await all<any>('SELECT * FROM providers WHERE enabled = 1')
    const providers = rows.map((r: any) => ({
      id: r.id, name: r.name, type: r.type, baseUrl: r.base_url, apiKey: r.api_key,
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

    const needsVision = containsImageHint(message)
    const scorer = providers.map((p: any) => {
      let score = Math.random() * 0.3
      const pUsage = usage?.[p.id]
      if (pUsage) {
        score -= Math.min((pUsage.totalTokens || 0) / 2000000, 0.3)
      }
      const hasModels = p.models.length > 0
      if (!hasModels) score -= 100
      if (needsVision) {
        score += p.models.some((m: ModelConfig) => m.supportsVision) ? 2 : -2
      }
      return { provider: p, score }
    })
    scorer.sort((a: any, b: any) => b.score - a.score)
    const chosen = scorer[0]
    const model = chosen.provider.models[0]
    return { providerId: chosen.provider.id, modelId: model?.id }
  })

  ipcMain.on('ai:stream-chat', async (e, payload: any) => {
    const sender = e.sender
    const requestId = payload.requestId || randomUUID()
    const { providerId, modelId, messages, temperature, maxTokens, chatId, workspaceId } = payload
    const controller = new AbortController()
    activeStreams.set(requestId, controller)
    persistNotification({ title: 'Stream Started', message: `Streaming to ${modelId}`, type: 'info' })

    const startedAt = Date.now()
    let accumulatedText = ''
    try {
      const provider = await getProviderById(providerId)
      if (!provider) throw new Error('Provider not found')
      const model = provider.models.find((m: any) => m.id === modelId)
      if (!model) throw new Error(`Model ${modelId} not found`)

      await streamChat(provider, model, messages, {
        onChunk: (text) => {
          accumulatedText += text
          if (!sender.isDestroyed()) {
            sender.send('ai:chunk', { requestId, delta: text })
          }
        },
        onDone: async (result) => {
          activeStreams.delete(requestId)
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
    } catch (err: any) {
      activeStreams.delete(requestId)
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

  ipcMain.handle('terminal:run', async (_e, workspaceId: string, command: string, cwd: string, approved?: boolean) => {
    const { all, run } = await import('../database')
    const startedAt = Date.now()

    let approvedBy: string | null = null
    const reason = blockedCommandReason(command)
    if (reason) {
      const allowlist = await getTerminalAllowlist(all)
      const isAllowlisted = allowlist.some((p) => command.trim().toLowerCase().startsWith(p.toLowerCase()))
      if (isAllowlisted) {
        approvedBy = 'allowlist'
      } else if (approved) {
        approvedBy = 'user'
      } else {
        return { needsApproval: true, command, reason }
      }
    }

    return new Promise((resolve) => {
      const isWindows = process.platform === 'win32'
      const useCmd = isWindows
      const shellBin = isWindows ? 'cmd.exe' : '/bin/bash'
      const args = useCmd ? ['/c', command] : ['-c', command]
      const child = spawn(shellBin, args, {
        cwd,
        shell: false,
        env: { ...process.env },
        windowsHide: true,
      })
      let stdout = ''
      let stderr = ''
      let timedOut = false
      const timeoutMs = 60000
      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGKILL')
      }, timeoutMs)

      child.stdout.on('data', (d) => { stdout += d.toString() })
      child.stderr.on('data', (d) => { stderr += d.toString() })

      child.on('error', (err) => {
        clearTimeout(timer)
        resolve({
          exitCode: 1,
          output: `Failed to run command: ${err.message}`,
          durationMs: Date.now() - startedAt,
        })
      })

      child.on('close', async (code) => {
        clearTimeout(timer)
        const output = `${stdout}${stderr ? (stdout ? '\n' : '') + stderr : ''}${timedOut ? '\n[Command timed out after 60s]' : ''}`
        const result = {
          exitCode: code,
          output: output || '(no output)',
          durationMs: Date.now() - startedAt,
        }
        try {
          const { run } = await import('../database')
          await run(
            'INSERT INTO terminal_history (id, workspace_id, command, output, exit_code, cwd, created_at, duration_ms, approved_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [randomUUID(), workspaceId, command, output.slice(0, 50000), code, cwd, Date.now(), result.durationMs, approvedBy]
          )
        } catch {}
        resolve(result)
      })
    })
  })

  ipcMain.handle('terminal:history', async (_e, workspaceId: string) => {
    const { all } = await import('../database')
    const rows = await all<any>(
      'SELECT * FROM terminal_history WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 200',
      [workspaceId]
    )
    return rows.map((r) => ({
      id: r.id, workspaceId: r.workspace_id, command: r.command, output: r.output,
      exitCode: r.exit_code, cwd: r.cwd, createdAt: r.created_at, durationMs: r.duration_ms,
      approvedBy: r.approved_by,
    }))
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
    await restoreBackup(backupPath)
    return true
  })

  ipcMain.handle('backup:export-file', async (_e) => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showSaveDialog(win!, {
      title: 'Export Database Backup',
      defaultPath: path.join(getDataDir(), `ai-workspace-${Date.now()}.db`),
      filters: [{ name: 'Database', extensions: ['db'] }],
    })
    if (result.canceled || !result.filePath) return null
    const { exportDatabase } = require('../database/backup') as typeof import('../database/backup')
    await exportDatabase(result.filePath)
    return result.filePath
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
    await importDatabase(result.filePaths[0])
    sendNotification('Restore Complete', 'Database restored from backup. Please restart the app.', 'warning')
    return result.filePaths[0]
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

const BLOCKED_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /rm\s+-(?:[a-z]*[rf][a-z]*)/i, label: 'recursive force delete (rm -r/-f)' },
  { re: /(?:rd|rmdir)\s+\/s(?:[^&|]*)?/i, label: 'recursive directory delete (rd /s)' },
  { re: /(?:del|erase|delthread)\s+\/[a-z]*[s][a-z]*/i, label: 'recursive file delete (del /s)' },
  { re: /del\s+\/f(?:\s|$)/i, label: 'force file delete (del /f)' },
  { re: /git\s+push\s+.*(--force|-f)(?:\s|$)/i, label: 'force push (git push --force)' },
  { re: /git\s+reset\s+--hard/i, label: 'git reset --hard' },
  { re: /drop\s+(table|database)/i, label: 'drop table/database' },
  { re: /format\s+[a-z]:/i, label: 'disk format' },
  { re: /diskpart/i, label: 'diskpart' },
  { re: /^shutdown(?:\s|$)/i, label: 'system shutdown' },
  { re: /reg\s+delete/i, label: 'registry delete' },
  { re: /taskkill\s+\/f/i, label: 'force task kill' },
  { re: /pkexec\s+rm\s/i, label: 'privileged delete' },
]

function blockedCommandReason(command: string): string | null {
  for (const { re, label } of BLOCKED_PATTERNS) {
    if (re.test(command)) return label
  }
  return null
}

async function getTerminalAllowlist(all: any): Promise<string[]> {
  try {
    const row = await all("SELECT value FROM settings WHERE key = 'terminal.allowlist' LIMIT 1")
    if (!row?.[0]?.value) return []
    const parsed = JSON.parse(row[0].value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
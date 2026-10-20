import { app, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import { getDataDir } from '../config'
import { getDb, all, run } from './index'

export function startAutoBackup() {
  try {
    readBackupSettings().then(({ backupEnabled, intervalHours }) => {
      if (!backupEnabled) return
      const interval = Math.max(1, intervalHours) * 3600 * 1000
      backupTimer = setInterval(() => {
        createBackup().catch((err) => console.error('Auto backup failed', err))
      }, interval)
    })
  } catch (e) {
    console.error('Failed to start auto backup', e)
  }
}

export function stopAutoBackup() {
  if (backupTimer) {
    clearInterval(backupTimer)
    backupTimer = null
  }
}

let backupTimer: NodeJS.Timeout | null = null

function readBackupSettings() {
  const db = getDb()
  return new Promise<{ backupEnabled: boolean; intervalHours: number }>((resolve) => {
    db.get("SELECT value FROM settings WHERE key = 'backup_settings'", (err, row) => {
      if (err || !row) {
        resolve({ backupEnabled: true, intervalHours: 24 })
        return
      }
      try {
        const val = JSON.parse((row as any).value)
        resolve({
          backupEnabled: val.backupEnabled !== false,
          intervalHours: val.intervalHours || 24,
        })
      } catch {
        resolve({ backupEnabled: true, intervalHours: 24 })
      }
    })
  })
}

export async function listBackups(): Promise<{ name: string; path: string; size: number; createdAt: number }[]> {
  const dir = path.join(getDataDir(), 'backups')
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.db'))
  return files
    .map((f) => {
      const full = path.join(dir, f)
      const stat = fs.statSync(full)
      return {
        name: f,
        path: full,
        size: stat.size,
        createdAt: stat.mtimeMs,
      }
    })
    .sort((a, b) => b.createdAt - a.createdAt)
}

export async function createBackup(): Promise<string> {
  const backupsDir = path.join(getDataDir(), 'backups')
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true })
  }
  const dbPath = path.join(getDataDir(), 'aiworkspace.db')
  if (!fs.existsSync(dbPath)) {
    throw new Error('Database does not exist yet')
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(backupsDir, `backup-${ts}.db`)
  fs.copyFileSync(dbPath, backupPath)
  cleanupOldBackups()
  return backupPath
}

function cleanupOldBackups(maxKeep = 10) {
  const backupsDir = path.join(getDataDir(), 'backups')
  if (!fs.existsSync(backupsDir)) return
  const files = fs.readdirSync(backupsDir)
    .filter((f) => f.endsWith('.db'))
    .map((f) => ({ f, stat: fs.statSync(path.join(backupsDir, f)) }))
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
  if (files.length > maxKeep) {
    for (const excess of files.slice(maxKeep)) {
      fs.unlinkSync(path.join(backupsDir, excess.f))
    }
  }
}

export async function restoreBackup(savePath: string): Promise<void> {
  const stat = fs.statSync(savePath)
  if (!stat.isFile()) {
    throw new Error('Invalid backup file')
  }
  const dbPath = path.join(getDataDir(), 'aiworkspace.db')
  const currentBackup = path.join(getDataDir(), 'backups', 'pre-restore.db')
  if (fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, currentBackup)
  }
  fs.copyFileSync(savePath, dbPath)
  await new Promise((resolve) => setTimeout(resolve, 100))
}

export async function exportDatabase(targetPath: string): Promise<void> {
  const dbPath = path.join(getDataDir(), 'aiworkspace.db')
  fs.copyFileSync(dbPath, targetPath)
}

export async function importDatabase(sourcePath: string): Promise<string> {
  const current = await backupBeforeImport()
  const dbPath = path.join(getDataDir(), 'aiworkspace.db')
  fs.copyFileSync(sourcePath, dbPath)
  await new Promise((resolve) => setTimeout(resolve, 100))
  return current
}

async function backupBeforeImport(): Promise<string> {
  const backupsDir = path.join(getDataDir(), 'backups')
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true })
  const dbPath = path.join(getDataDir(), 'aiworkspace.db')
  if (!fs.existsSync(dbPath)) return ''
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(backupsDir, `auto-before-import-${ts}.db`)
  fs.copyFileSync(dbPath, backupPath)
  return backupPath
}

export async function backupNow(dialogWindow?: any): Promise<string> {
  if (dialogWindow) {
    const result = await dialog.showSaveDialog(dialogWindow, {
      title: 'Save Backup',
      defaultPath: path.join(app.getPath('downloads'), 'ai-workspace-backup.db'),
    })
    if (result.canceled || !result.filePath) return ''
    await exportDatabase(result.filePath)
    return result.filePath
  }
  return createBackup()
}

export async function restoreBackupFile(...args: any[]): Promise<{ path: string } | null> {
  return null
}

export async function getBackupSettings() {
  const rows = await all("SELECT * FROM settings WHERE key LIKE 'backup_%'")
  const result: Record<string, string> = {}
  for (const row of rows) {
    result[(row as any).key] = (row as any).value
  }
  return {
    backupEnabled: result.backup_settings ? JSON.parse(result.backup_settings).backupEnabled : true,
    intervalHours: result.backup_settings ? JSON.parse(result.backup_settings).intervalHours : 24,
  }
}

export async function setBackupSettings(settings: { backupEnabled: boolean; intervalHours: number }) {
  await run(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    ['backup_settings', JSON.stringify(settings), Date.now()]
  )
}
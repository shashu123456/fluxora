import { app, dialog } from 'electron'
import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'
import { Database, OPEN_READONLY } from 'sqlite3'
import { getDataDir } from '../config'
import { closeDatabase, getDb, initDatabase, all, run } from './index'

const BACKUP_MANIFEST_VERSION = 1
const CURRENT_SCHEMA_VERSION = 1
const MAX_BACKUPS = 10

interface BackupManifest {
  version: number
  schemaVersion: number
  appVersion: string
  createdAt: number
  database: string
  checksum: string
  size: number
  secretMode: 'excluded'
}

let backupTimer: NodeJS.Timeout | null = null

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
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(backupsDir, `backup-${ts}.db`)
  await createSafeSnapshot(backupPath)
  cleanupOldBackups()
  return backupPath
}

function cleanupOldBackups(maxKeep = MAX_BACKUPS) {
  const backupsDir = path.join(getDataDir(), 'backups')
  if (!fs.existsSync(backupsDir)) return
  const files = fs.readdirSync(backupsDir)
    .filter((f) => f.endsWith('.db') && !f.startsWith('pre-restore-'))
    .map((f) => ({ f, stat: fs.statSync(path.join(backupsDir, f)) }))
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
  if (files.length > maxKeep) {
    for (const excess of files.slice(maxKeep)) {
      removeFile(path.join(backupsDir, excess.f))
      removeFile(path.join(backupsDir, `${excess.f}.manifest.json`))
    }
  }
}

function openDatabase(filePath: string, mode?: number): Promise<Database> {
  return new Promise((resolve, reject) => {
    const db = mode === undefined ? new Database(filePath) : new Database(filePath, mode)
    db.once('open', () => resolve(db))
    db.once('error', (err) => reject(err))
  })
}

function dbRun(db: Database, sql: string, params: unknown[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()))
  })
}

function dbGet<T>(db: Database, sql: string, params: unknown[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row as T | undefined)))
  })
}

function dbAll<T>(db: Database, sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows as T[])))
  })
}

function dbExec(db: Database, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => (err ? reject(err) : resolve()))
  })
}

function closeDb(db: Database): Promise<void> {
  return new Promise((resolve, reject) => {
    db.close((err) => (err ? reject(err) : resolve()))
  })
}

function sha256(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function removeFile(filePath: string) {
  try {
    fs.unlinkSync(filePath)
  } catch {
    /* already absent */
  }
}

async function assertIntegrity(filePath: string) {
  if (!fs.existsSync(filePath)) throw new Error('Backup file does not exist')
  const db = await openDatabase(filePath, OPEN_READONLY)
  try {
    const rows = await dbAll<{ integrity_check: string }>(db, 'PRAGMA integrity_check')
    const messages = rows.map((row) => row.integrity_check).filter(Boolean)
    if (messages.length !== 1 || messages[0].toLowerCase() !== 'ok') {
      throw new Error(`Backup integrity check failed: ${messages.join('; ') || 'unknown error'}`)
    }
    const tables = await dbAll<{ name: string }>(db, "SELECT name FROM sqlite_master WHERE type = 'table'")
    const names = new Set(tables.map((table) => table.name))
    if (!names.has('providers') || !names.has('settings')) {
      throw new Error('Backup is missing required Fluxora tables')
    }
  } finally {
    await closeDb(db).catch(() => undefined)
  }
}

async function stripSecrets(filePath: string) {
  const db = await openDatabase(filePath)
  try {
    await dbExec(db, "DELETE FROM secret_records; UPDATE providers SET api_key = '';")
    await dbExec(db, 'VACUUM')
  } finally {
    await closeDb(db).catch(() => undefined)
  }
}

async function createSafeSnapshot(targetPath: string) {
  if (fs.existsSync(targetPath)) removeFile(targetPath)
  const dbPath = path.join(getDataDir(), 'aiworkspace.db')
  if (!fs.existsSync(dbPath)) {
    throw new Error('Database does not exist yet')
  }

  await run('VACUUM INTO ?', [targetPath])
  await stripSecrets(targetPath)
  await assertIntegrity(targetPath)

  const manifest: BackupManifest = {
    version: BACKUP_MANIFEST_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appVersion: app.getVersion(),
    createdAt: Date.now(),
    database: path.basename(targetPath),
    checksum: sha256(targetPath),
    size: fs.statSync(targetPath).size,
    secretMode: 'excluded',
  }
  fs.writeFileSync(`${targetPath}.manifest.json`, JSON.stringify(manifest, null, 2), 'utf8')
  return manifest
}

function copyRawDatabase(destination: string) {
  const dbPath = path.join(getDataDir(), 'aiworkspace.db')
  if (!fs.existsSync(dbPath)) return
  fs.copyFileSync(dbPath, destination)
  for (const sidecar of ['-wal', '-shm']) {
    const source = `${dbPath}${sidecar}`
    if (fs.existsSync(source)) fs.copyFileSync(source, `${destination}${sidecar}`)
  }
}

function removeSidecars(filePath: string) {
  removeFile(`${filePath}-wal`)
  removeFile(`${filePath}-shm`)
}

export async function restoreBackup(savePath: string): Promise<{ preRestorePath: string }> {
  await assertIntegrity(savePath)

  const backupsDir = path.join(getDataDir(), 'backups')
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const preRestorePath = path.join(backupsDir, `pre-restore-${ts}.db`)
  const dbPath = path.join(getDataDir(), 'aiworkspace.db')

  await closeDatabase()
  copyRawDatabase(preRestorePath)

  try {
    fs.copyFileSync(savePath, dbPath)
    removeSidecars(dbPath)
    await initDatabase()
    await assertIntegrity(dbPath)
  } catch (error) {
    removeFile(dbPath)
    removeSidecars(dbPath)
    if (fs.existsSync(preRestorePath)) {
      fs.copyFileSync(preRestorePath, dbPath)
      await initDatabase()
    }
    throw error
  }

  return { preRestorePath }
}

export async function exportDatabase(targetPath: string): Promise<void> {
  await createSafeSnapshot(targetPath)
}

export async function importDatabase(sourcePath: string): Promise<string> {
  const result = await restoreBackup(sourcePath)
  return result.preRestorePath
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

export async function getBackupSettings() {
  const rows = await all("SELECT * FROM settings WHERE key LIKE 'backup_%'")
  const result: Record<string, string> = {}
  for (const row of rows) {
    result[(row as any).key] = (row as any).value
  }
  const settings = result.backup_settings ? JSON.parse(result.backup_settings) : {}
  return {
    backupEnabled: settings.backupEnabled !== false,
    intervalHours: settings.intervalHours || 24,
  }
}

export async function setBackupSettings(settings: { backupEnabled: boolean; intervalHours: number }) {
  await run(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    ['backup_settings', JSON.stringify(settings), Date.now()]
  )
}

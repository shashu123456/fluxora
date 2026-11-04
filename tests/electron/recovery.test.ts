import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { initDatabase, closeDatabase, run, all } from '../../electron/database'

// `electron/database/backup.ts` pulls `electron` in at import time; the test only
// needs the settings helpers, so provide the minimum surface they touch.
vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? os.tmpdir() : os.tmpdir()),
    getVersion: () => '1.0.0',
    isPackaged: false,
  },
  dialog: { showSaveDialog: vi.fn() },
}))

const { getBackupSettings, setBackupSettings } = await import('../../electron/database/backup')

// Phase 6 — crash recovery. These exercise the fail-closed guarantees that matter
// when a file on disk is damaged: the app must refuse to proceed rather than
// silently replace or truncate user data.

let tempDir: string
let dbPath: string

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fluxora-recovery-'))
  dbPath = path.join(tempDir, 'aiworkspace.db')
})

afterEach(async () => {
  await closeDatabase().catch(() => undefined)
  // Windows can hold a handle for a moment after a failed open.
  fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
})

describe('corrupt database', () => {
  it('rejects a file that is not a database instead of recreating it', async () => {
    const garbage = Buffer.from('this is not a sqlite database'.repeat(64))
    fs.writeFileSync(dbPath, garbage)

    await expect(initDatabase(dbPath)).rejects.toBeTruthy()

    // The damaged file must survive untouched for recovery: no silent overwrite,
    // truncation or sidecar replacement.
    expect(fs.existsSync(dbPath)).toBe(true)
    expect(fs.readFileSync(dbPath).equals(garbage)).toBe(true)
  })

  it('rejects a truncated database header', async () => {
    fs.writeFileSync(dbPath, Buffer.from('SQLite format 3\u0000', 'binary'))

    await expect(initDatabase(dbPath)).rejects.toBeTruthy()
    expect(fs.readFileSync(dbPath).length).toBe(16)
  })

  it('still opens a healthy database in the same directory afterwards', async () => {
    fs.writeFileSync(dbPath, Buffer.from('corrupt'.repeat(32)))
    await expect(initDatabase(dbPath)).rejects.toBeTruthy()

    const goodPath = path.join(tempDir, 'recovered.db')
    await initDatabase(goodPath)
    const tables = await all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table'"
    )
    expect(tables.length).toBeGreaterThan(10)
  })
})

describe('malformed backup settings', () => {
  beforeEach(async () => {
    await initDatabase(dbPath)
  })

  const setRaw = (value: string) =>
    run(
      "INSERT INTO settings (key, value, updated_at) VALUES ('backup_settings', ?, ?) " +
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      [value, Date.now()]
    )

  it('falls back to defaults on invalid JSON', async () => {
    await setRaw('{not json at all')
    await expect(getBackupSettings()).resolves.toEqual({
      backupEnabled: true,
      intervalHours: 24,
    })
  })

  it('falls back to defaults on a JSON value of the wrong shape', async () => {
    await setRaw('"a string"')
    await expect(getBackupSettings()).resolves.toEqual({
      backupEnabled: true,
      intervalHours: 24,
    })
  })

  it('rejects a non-numeric or non-positive interval', async () => {
    await setRaw(JSON.stringify({ backupEnabled: false, intervalHours: 'soon' }))
    await expect(getBackupSettings()).resolves.toEqual({
      backupEnabled: false,
      intervalHours: 24,
    })

    await setRaw(JSON.stringify({ backupEnabled: true, intervalHours: -4 }))
    await expect(getBackupSettings()).resolves.toEqual({
      backupEnabled: true,
      intervalHours: 24,
    })
  })

  it('round-trips valid settings', async () => {
    await setBackupSettings({ backupEnabled: false, intervalHours: 6 })
    await expect(getBackupSettings()).resolves.toEqual({
      backupEnabled: false,
      intervalHours: 6,
    })
  })
})

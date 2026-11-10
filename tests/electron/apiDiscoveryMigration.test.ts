import { describe, it, expect, beforeEach, afterEach } from 'vitest'
// Mock Electron config before any module that imports it loads
vi.mock('../../electron/config', () => ({
  getDataDir: () => process.cwd(),
  ensureDataDir: () => process.cwd(),
  setDataDir: () => {},
  isPortableMode: () => false,
  getPortableDir: () => process.cwd(),
}))

vi.mock('../../electron/services/secrets/vault', () => ({
  getSecretVault: () => ({
    seal: (value: string) => ({ payload: Buffer.from(value).toString('base64'), storageMode: 'plaintext' as const }),
    open: (payload: string) => { try { return Buffer.from(payload, 'base64').toString('utf8') } catch { return '' } },
  }),
  resetSecretVaultForTests: () => {},
}))

vi.mock('../../electron/services/secrets/keyProvider', () => ({
  OsKeyProvider: class { mode = 'os' as const; isAvailable() { return true } encrypt() { return Buffer.from([]) } decrypt() { return Buffer.from([]) } },
  LocalFallbackKeyProvider: class { mode = 'plaintext' as const; isAvailable() { return true } encrypt() { return Buffer.from([]) } decrypt() { return Buffer.from([]) } },
}))

import { get, run, all } from '../../electron/database'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, 'test-migration.db')

describe('API discovery database migration', () => {
  beforeEach(async () => {
    try { fs.unlinkSync(DB_PATH) } catch {}
    process.env.FLUXORA_TEST_DB = DB_PATH
    const { initDatabase } = await import('../../electron/database')
    await initDatabase()
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../../electron/database')
    try { await closeDatabase() } catch {}
    try { fs.unlinkSync(DB_PATH) } catch {}
    try { fs.unlinkSync(DB_PATH + '-wal') } catch {}
    try { fs.unlinkSync(DB_PATH + '-shm') } catch {}
    delete process.env.FLUXORA_TEST_DB
  })

  it('creates api_connections and api_audit_log on a fresh database', async () => {
    const tables = await all<any>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    const names = tables.map((t: any) => t.name)
    expect(names).toContain('api_connections')
    expect(names).toContain('api_audit_log')
  })

  it('idempotently creates the API discovery tables on repeated init', async () => {
    const { initDatabase } = await import('../../electron/database')
    await initDatabase()
    const tables1 = await all<any>("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('api_connections', 'api_audit_log')")
    expect(tables1).toHaveLength(2)

    // Re-init should be idempotent — no constraint errors
    await initDatabase()
    const tables2 = await all<any>("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('api_connections', 'api_audit_log')")
    expect(tables2).toHaveLength(2)
  })

  it('preserves existing data when API discovery tables already exist', async () => {
    await run("INSERT OR IGNORE INTO api_connections (api_id, auth_mode, enabled, created_at, updated_at) VALUES ('preserved', 'none', 1, 0, 0)")
    await run("INSERT OR IGNORE INTO chats (id, workspace_id, title, created_at, updated_at) VALUES ('chat-1', 'ws-1', 'Old Chat', 0, 0)")

    const { initDatabase } = await import('../../electron/database')
    await initDatabase()

    const conn = await get<any>("SELECT * FROM api_connections WHERE api_id = 'preserved'")
    expect(conn).not.toBeUndefined()
    expect(conn.api_id).toBe('preserved')

    const chat = await get<any>("SELECT * FROM chats WHERE id = 'chat-1'")
    expect(chat).not.toBeUndefined()
    expect(chat.title).toBe('Old Chat')
  })
})

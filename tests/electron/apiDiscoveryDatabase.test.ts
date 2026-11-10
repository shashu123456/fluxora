import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { initDatabase, closeDatabase, run, all, getAllTables } from '../../electron/database'
import { AUDIT_RETENTION, listApiAudit, pruneApiAudit, recordApiCall } from '../../electron/services/apiDiscovery/audit'

let tempDir: string
let dbPath: string

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fluxora-api-db-'))
  dbPath = path.join(tempDir, 'test.db')
  await initDatabase(dbPath)
  // Ensure clean state for prune test
  await new Promise(r => setTimeout(r, 10))
})

afterEach(async () => {
  await closeDatabase()
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('API discovery schema', () => {
  it('creates the new tables through production migrations', async () => {
    const rows = await all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    )
    const names = rows.map((row) => row.name)
    expect(names).toContain('api_connections')
    expect(names).toContain('api_audit_log')
    expect([...getAllTables()]).toEqual(expect.arrayContaining(['api_connections', 'api_audit_log']))
  })

  it('creates the declared indexes', async () => {
    const rows = await all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_api_%'"
    )
    expect(rows.map((row) => row.name).sort()).toEqual([
      'idx_api_audit_api',
      'idx_api_audit_created',
      'idx_api_connections_enabled',
    ])
  })

  it('stores no secret or response-body columns', async () => {
    for (const table of ['api_connections', 'api_audit_log']) {
      const columns = (await all<{ name: string }>(`PRAGMA table_info(${table})`)).map((c) => c.name)
      expect(columns.join(',')).not.toMatch(/secret|encrypted|api_key|body|response_text/i)
    }
  })

  it('upserts connection state', async () => {
    const now = Date.now()
    await run(
      `INSERT INTO api_connections (api_id, auth_mode, enabled, created_at, updated_at) VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(api_id) DO UPDATE SET enabled = 1, updated_at = excluded.updated_at`,
      ['github-rest', 'none', now, now]
    )
    await run(`UPDATE api_connections SET enabled = 0, last_test_status = ? WHERE api_id = ?`, ['ok:200', 'github-rest'])
    const row = await all<any>('SELECT * FROM api_connections')
    expect(row).toHaveLength(1)
    expect(row[0].enabled).toBe(0)
    expect(row[0].last_test_status).toBe('ok:200')
  })
})

describe('API audit log', () => {
  it('writes newest-first entries', async () => {
    await recordApiCall(
      {
        apiId: 'github-rest',
        endpoint: '/repos/facebook/react',
        method: 'GET',
        statusCode: 200,
        durationMs: 120,
        responseBytes: 512,
        outcome: 'success',
      },
      Date.now()
    )
    await recordApiCall(
      {
        apiId: 'thecatapi',
        endpoint: '/v1/images/search',
        method: 'GET',
        statusCode: null,
        durationMs: 5,
        responseBytes: 0,
        outcome: 'blocked',
        errorCode: 'auth_required',
      },
      Date.now() + 10
    )

    const entries = await listApiAudit(10)
    expect(entries).toHaveLength(2)
    expect(entries[0].apiId).toBe('thecatapi')
    expect(entries[0].outcome).toBe('blocked')
    expect(entries[0].errorCode).toBe('auth_required')
    expect(entries[1].apiId).toBe('github-rest')
  })

  it('prunes to the retention cap', async () => {
    const now = Date.now()
    for (let i = 0; i < AUDIT_RETENTION + 25; i += 1) {
      await run(
        `INSERT INTO api_audit_log
           (request_id, api_id, endpoint, method, status_code, duration_ms, response_bytes, outcome, error_code, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [`req-${i}`, 'github-rest', '/repos', 'GET', 200, 1, 1, 'success', null, now + i]
      )
    }
    await pruneApiAudit(AUDIT_RETENTION)
    const count = await all<{ c: number }>('SELECT COUNT(*) AS c FROM api_audit_log')
    expect(count[0].c).toBe(AUDIT_RETENTION)

    const newest = await all<{ request_id: string }>(
      'SELECT request_id FROM api_audit_log ORDER BY created_at DESC LIMIT 1'
    )
    expect(newest[0].request_id).toBe(`req-${AUDIT_RETENTION + 24}`)
  })

  it('clamps the read limit', async () => {
    expect(await listApiAudit(0)).toHaveLength(0)
    expect(await listApiAudit(9999)).toHaveLength(0)
  })
})

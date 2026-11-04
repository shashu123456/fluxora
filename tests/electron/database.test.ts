import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  initDatabase,
  closeDatabase,
  run,
  all,
  get,
  getAllTables,
} from '../../electron/database'

let tempDir: string
let dbPath: string

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fluxora-db-'))
  dbPath = path.join(tempDir, 'test.db')
  await initDatabase(dbPath)
})

afterEach(async () => {
  await closeDatabase()
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('production database', () => {
  it('creates every production table', async () => {
    const rows = await all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    const actual = rows.map((row) => row.name).sort()
    const expected = [...getAllTables()].sort()
    expect(actual).toEqual(expected)
  })

  it('persists settings through the production helpers', async () => {
    await run(
      'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
      ['theme', 'dark', Date.now()]
    )
    const row = await get<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['theme'])
    expect(row?.value).toBe('dark')
  })

  it('persists providers and JSON model lists', async () => {
    const now = Date.now()
    await run(
      `INSERT INTO providers
        (id, name, type, base_url, api_key, models, enabled, is_custom, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['p1', 'OpenAI', 'openai', 'https://api.openai.com/v1', '', '["gpt-4o"]', 1, 0, now, now]
    )

    const row = await get<{ name: string; models: string }>(
      'SELECT name, models FROM providers WHERE id = ?',
      ['p1']
    )
    expect(row?.name).toBe('OpenAI')
    expect(JSON.parse(row!.models)).toEqual(['gpt-4o'])
  })

  it('supports workspace, chat, and message relationships', async () => {
    const now = Date.now()
    await run(
      `INSERT INTO workspaces (id, name, path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      ['ws1', 'My Project', tempDir, now, now]
    )
    await run(
      `INSERT INTO chats
        (id, workspace_id, title, pinned, archived, favorite, provider_id, model_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['c1', 'ws1', 'Test Chat', 0, 0, 0, 'p1', 'gpt-4o', now, now]
    )
    await run(
      'INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
      ['m1', 'c1', 'user', 'Hello', now]
    )

    const messages = await all<{ content: string }>(
      'SELECT content FROM messages WHERE chat_id = ?',
      ['c1']
    )
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('Hello')
  })

  it('persists and searches memories', async () => {
    const now = Date.now()
    await run(
      `INSERT INTO memories
        (id, workspace_id, scope, type, content, source, pinned, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['m1', 'ws1', 'workspace', 'project', 'Uses PostgreSQL', 'manual', 0, '["db"]', now, now]
    )

    const results = await all<{ content: string }>(
      'SELECT content FROM memories WHERE content LIKE ?',
      ['%PostgreSQL%']
    )
    expect(results).toHaveLength(1)
  })

  it('persists project brain entries', async () => {
    const now = Date.now()
    await run(
      `INSERT INTO project_brain
        (id, workspace_id, title, content, kind, status, tags, pinned, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['b1', 'ws1', 'Auth Decision', 'Use JWT', 'decision', 'open', '["auth"]', 1, 'manual', now, now]
    )

    const entry = await get<{ kind: string; pinned: number }>(
      'SELECT kind, pinned FROM project_brain WHERE id = ?',
      ['b1']
    )
    expect(entry?.kind).toBe('decision')
    expect(entry?.pinned).toBe(1)
  })

  it('upserts workspace index snapshots', async () => {
    const first = JSON.stringify({ languages: [{ lang: 'TypeScript', count: 10 }] })
    const second = JSON.stringify({ languages: [{ lang: 'TypeScript', count: 20 }] })

    await run(
      'INSERT INTO workspace_index (workspace_id, data, indexed_at) VALUES (?, ?, ?)',
      ['ws1', first, Date.now()]
    )
    await run(
      `INSERT INTO workspace_index (workspace_id, data, indexed_at) VALUES (?, ?, ?)
       ON CONFLICT(workspace_id) DO UPDATE SET data = excluded.data, indexed_at = excluded.indexed_at`,
      ['ws1', second, Date.now()]
    )

    const row = await get<{ data: string }>(
      'SELECT data FROM workspace_index WHERE workspace_id = ?',
      ['ws1']
    )
    expect(JSON.parse(row!.data).languages[0].count).toBe(20)
  })

  it('accumulates usage records', async () => {
    const now = Date.now()
    for (let i = 0; i < 3; i++) {
      await run(
        `INSERT INTO usage
          (provider_id, model, prompt_tokens, completion_tokens, total_tokens, cost, response_time_ms, streaming, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['p1', 'gpt-4o', 100, 50, 150, 0.003, 1000, 1, 'success', now]
      )
    }

    const total = await get<{ t: number }>('SELECT SUM(total_tokens) AS t FROM usage')
    expect(total?.t).toBe(450)
  })

  it('applies additive schema migrations', async () => {
    const providers = await all<{ name: string }>('PRAGMA table_info(providers)')
    expect(providers.map((column) => column.name)).toContain('capabilities')

    const prompts = await all<{ name: string }>('PRAGMA table_info(prompts)')
    expect(prompts.map((column) => column.name)).toContain('description')

    const terminal = await all<{ name: string }>('PRAGMA table_info(terminal_history)')
    const terminalColumns = terminal.map((column) => column.name)
    expect(terminalColumns).toEqual(
      expect.arrayContaining([
        'approved_by',
        'command_hash',
        'status',
        'approval_id',
        'output_size',
        'truncated',
        'cancelled',
        'finished_at',
      ])
    )

    const secret = await all<{ name: string }>('PRAGMA table_info(secret_records)')
    expect(secret.map((column) => column.name)).toContain('encrypted_payload')
  })

  it('enables foreign keys on the production connection', async () => {
    const row = await get<{ foreign_keys: number }>('PRAGMA foreign_keys')
    expect(row?.foreign_keys).toBe(1)
  })
})

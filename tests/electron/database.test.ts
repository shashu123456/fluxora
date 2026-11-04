import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { DatabaseSync } from 'node:sqlite'

// In-memory SQLite database mirroring the production schema
let db: InstanceType<typeof DatabaseSync>

function createSchema(database: InstanceType<typeof DatabaseSync>) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY, name TEXT, type TEXT, base_url TEXT, api_key TEXT,
      models TEXT, enabled INTEGER, is_custom INTEGER, color TEXT, capabilities TEXT,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY, name TEXT, path TEXT, color TEXT, icon TEXT,
      created_at TEXT, updated_at TEXT, last_opened_at TEXT, settings TEXT
    );
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY, workspace_id TEXT, title TEXT, pinned INTEGER,
      archived INTEGER, favorite INTEGER, provider_id TEXT, model_id TEXT,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, chat_id TEXT, role TEXT, content TEXT, reasoning TEXT,
      model TEXT, provider_id TEXT, files TEXT, usage TEXT, status TEXT,
      parent_id TEXT, branch_id TEXT, token_count INTEGER, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY, workspace_id TEXT, scope TEXT, type TEXT, content TEXT,
      source TEXT, pinned INTEGER, tags TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY, workspace_id TEXT, name TEXT, content TEXT, description TEXT,
      category TEXT, pinned INTEGER, variables TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id TEXT, model TEXT,
      chat_id TEXT, workspace_id TEXT, prompt_tokens INTEGER, completion_tokens INTEGER,
      total_tokens INTEGER, cost REAL, response_time_ms INTEGER, streaming INTEGER,
      status TEXT, created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY, title TEXT, message TEXT, type TEXT, timestamp TEXT, read INTEGER
    );
    CREATE TABLE IF NOT EXISTS terminal_history (
      id TEXT PRIMARY KEY, workspace_id TEXT, command TEXT, output TEXT,
      exit_code INTEGER, cwd TEXT, approved_by TEXT, created_at TEXT, duration_ms INTEGER
    );
    CREATE TABLE IF NOT EXISTS workspace_index (
      workspace_id TEXT PRIMARY KEY, data TEXT, indexed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS project_brain (
      id TEXT PRIMARY KEY, workspace_id TEXT, title TEXT, content TEXT, kind TEXT,
      status TEXT, tags TEXT, pinned INTEGER, source TEXT, created_at TEXT, updated_at TEXT
    );
  `)
}

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  createSchema(db)
})

afterAll(() => {
  db.close()
})

describe('Database schema', () => {
  it('creates all 12 tables', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all().map((r: any) => r.name).sort()
    expect(tables).toEqual([
      'chats', 'memories', 'messages', 'notifications', 'project_brain', 'prompts',
      'providers', 'settings', 'terminal_history', 'usage', 'workspace_index', 'workspaces',
    ])
  })

  it('settings table works', () => {
    db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('theme', 'dark', new Date().toISOString())
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('theme') as any
    expect(row.value).toBe('dark')
  })

  it('providers CRUD works', () => {
    db.prepare(`INSERT INTO providers (id, name, type, base_url, api_key, models, enabled, is_custom, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('p1', 'OpenAI', 'openai', 'https://api.openai.com/v1', 'sk-test', '["gpt-4o"]', 1, 0, '2026-01-01', '2026-01-01')
    const row = db.prepare('SELECT * FROM providers WHERE id = ?').get('p1') as any
    expect(row.name).toBe('OpenAI')
    expect(JSON.parse(row.models)).toEqual(['gpt-4o'])
  })

  it('workspaces CRUD works', () => {
    db.prepare(`INSERT INTO workspaces (id, name, path, color, icon, created_at, updated_at, last_opened_at, settings)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('ws1', 'My Project', 'C:/projects/my-app', '#gold', '📁', '2026-01-01', '2026-01-01', '2026-01-01', '{}')
    const row = db.prepare('SELECT * FROM workspaces WHERE id = ?').get('ws1') as any
    expect(row.name).toBe('My Project')
  })

  it('chats + messages relationship works', () => {
    db.prepare(`INSERT INTO chats (id, workspace_id, title, pinned, archived, favorite, provider_id, model_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('c1', 'ws1', 'Test Chat', 0, 0, 0, 'p1', 'gpt-4o', '2026-01-01', '2026-01-01')
    db.prepare(`INSERT INTO messages (id, chat_id, role, content, created_at)
      VALUES (?, ?, ?, ?, ?)`)
      .run('m1', 'c1', 'user', 'Hello', '2026-01-01')
    const msgs = db.prepare('SELECT * FROM messages WHERE chat_id = ?').all('c1')
    expect(msgs).toHaveLength(1)
    expect((msgs[0] as any).content).toBe('Hello')
  })

  it('memories search by content works', () => {
    db.prepare(`INSERT INTO memories (id, workspace_id, scope, type, content, source, pinned, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('m1', 'ws1', 'workspace', 'project', 'Uses PostgreSQL', 'manual', 0, '["db"]', '2026-01-01', '2026-01-01')
    const results = db.prepare('SELECT * FROM memories WHERE content LIKE ?').all('%PostgreSQL%')
    expect(results).toHaveLength(1)
  })

  it('project_brain CRUD works', () => {
    db.prepare(`INSERT INTO project_brain (id, workspace_id, title, content, kind, status, tags, pinned, source, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('b1', 'ws1', 'Auth Decision', 'Use JWT', 'decision', 'open', '["auth"]', 1, 'manual', '2026-01-01', '2026-01-01')
    const entry = db.prepare('SELECT * FROM project_brain WHERE id = ?').get('b1') as any
    expect(entry.kind).toBe('decision')
    expect(entry.pinned).toBe(1)
  })

  it('workspace_index upsert works', () => {
    const data = JSON.stringify({ languages: [{ lang: 'TypeScript', count: 10 }] })
    db.prepare('INSERT INTO workspace_index (workspace_id, data, indexed_at) VALUES (?, ?, ?)')
      .run('ws1', data, Date.now())
    // Upsert
    db.prepare(`INSERT INTO workspace_index (workspace_id, data, indexed_at) VALUES (?, ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET data = excluded.data, indexed_at = excluded.indexed_at`)
      .run('ws1', JSON.stringify({ languages: [{ lang: 'TypeScript', count: 20 }] }), Date.now())
    const row = db.prepare('SELECT data FROM workspace_index WHERE workspace_id = ?').get('ws1') as any
    expect(JSON.parse(row.data).languages[0].count).toBe(20)
  })

  it('usage records accumulate', () => {
    for (let i = 0; i < 3; i++) {
      db.prepare(`INSERT INTO usage (provider_id, model, prompt_tokens, completion_tokens, total_tokens, cost, response_time_ms, streaming, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run('p1', 'gpt-4o', 100, 50, 150, 0.003, 1000, 1, 'success', '2026-01-01')
    }
    const total = db.prepare('SELECT SUM(total_tokens) as t FROM usage').get() as any
    expect(total.t).toBe(450)
  })

  it('ensureColumn pattern works (additive migration)', () => {
    const cols = db.prepare('PRAGMA table_info(providers)').all().map((c: any) => c.name)
    expect(cols).toContain('capabilities')
    // Add a new column
    db.exec('ALTER TABLE providers ADD COLUMN notes TEXT')
    const newCols = db.prepare('PRAGMA table_info(providers)').all().map((c: any) => c.name)
    expect(newCols).toContain('notes')
  })

  it('foreign keys pragma is ON', () => {
    const fk = db.prepare('PRAGMA foreign_keys').get() as any
    expect(fk.foreign_keys).toBe(1)
  })
})

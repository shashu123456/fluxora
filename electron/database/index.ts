import { Database } from 'sqlite3'
import { ensureDataDir } from '../config'
import path from 'path'

let db: Database | null = null

export function getDb(): Database {
  if (!db) {
    throw new Error('Database not initialized')
  }
  return db
}

export function initDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const dataDir = ensureDataDir()
    const dbPath = path.join(dataDir, 'aiworkspace.db')
    db = new Database(dbPath, (err) => {
      if (err) {
        reject(err)
        return
      }
      try {
        db!.configure('busyTimeout', 3000)
        db!.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA auto_vacuum = INCREMENTAL;')
      } catch (pragmaErr) {
        reject(pragmaErr)
        return
      }
      runMigrations()
        .then(() => resolve())
        .catch(reject)
    })
  })
}

export function closeDatabase(): Promise<void> {
  return new Promise((resolve) => {
    if (!db) {
      resolve()
      return
    }
    db.close(() => {
      db = null
      resolve()
    })
  })
}

export function run(sql: string, params: any[] = []): Promise<any> {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function (err) {
      if (err) reject(err)
      else resolve({ lastID: this.lastID, changes: this.changes })
    })
  })
}

export function all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows as T[])
    })
  })
}

export function get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) reject(err)
      else resolve(row as T | undefined)
    })
  })
}

export function transaction<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise(async (resolve, reject) => {
    try {
      await run('BEGIN TRANSACTION')
      const result = await fn()
      await run('COMMIT')
      resolve(result)
    } catch (err) {
      await run('ROLLBACK').catch(() => {})
      reject(err)
    }
  })
}

async function ensureColumn(table: string, column: string, ddl: string) {
  const rows = await all<{ name: string }>(`PRAGMA table_info(${table})`)
  if (!rows.some((r) => r.name === column)) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  }
}

async function runMigrations() {
  const migrations = [
    `
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    `,
    `
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL DEFAULT '',
      models TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      is_custom INTEGER NOT NULL DEFAULT 0,
      color TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    `,
    `
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT,
      color TEXT,
      icon TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_opened_at INTEGER,
      settings TEXT
    );
    `,
    `
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      title TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      favorite INTEGER NOT NULL DEFAULT 0,
      provider_id TEXT,
      model_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    `,
    `
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      reasoning TEXT,
      model TEXT,
      provider_id TEXT,
      files TEXT,
      usage TEXT,
      status TEXT,
      parent_id TEXT,
      branch_id TEXT,
      token_count INTEGER,
      created_at INTEGER NOT NULL
    );
    `,
    `
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'global',
      type TEXT NOT NULL DEFAULT 'custom',
      content TEXT NOT NULL,
      source TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      tags TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    `,
    `
    CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      pinned INTEGER NOT NULL DEFAULT 0,
      variables TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    `,
    `
    CREATE TABLE IF NOT EXISTS usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id TEXT NOT NULL,
      model TEXT NOT NULL,
      chat_id TEXT,
      workspace_id TEXT,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      response_time_ms INTEGER NOT NULL DEFAULT 0,
      streaming INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'success',
      created_at INTEGER NOT NULL
    );
    `,
    `
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'info',
      timestamp INTEGER NOT NULL,
      read INTEGER NOT NULL DEFAULT 0
    );
    `,
    `
    CREATE TABLE IF NOT EXISTS terminal_history (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      command TEXT NOT NULL,
      output TEXT,
      exit_code INTEGER,
      cwd TEXT,
      created_at INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      approved_by TEXT,
      command_hash TEXT,
      status TEXT,
      approval_id TEXT,
      output_size INTEGER DEFAULT 0,
      truncated INTEGER DEFAULT 0,
      cancelled INTEGER DEFAULT 0,
      finished_at INTEGER
    );
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_chats_workspace ON chats(workspace_id);
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_chats_updated ON chats(updated_at);
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_chats_pinned ON chats(pinned);
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_providers_enabled ON providers(enabled);
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_id);
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_usage_created ON usage(created_at);
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_usage_provider ON usage(provider_id);
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_memories_workspace ON memories(workspace_id);
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_prompts_workspace ON prompts(workspace_id);
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_terminal_workspace ON terminal_history(workspace_id);
    `,
    `
    CREATE TABLE IF NOT EXISTS workspace_index (
      workspace_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      indexed_at INTEGER NOT NULL
    );
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
    `,
    `
    CREATE TABLE IF NOT EXISTS project_brain (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'note',
      status TEXT,
      tags TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_brain_workspace ON project_brain(workspace_id);
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_brain_pinned ON project_brain(pinned);
    `,
    `
    CREATE TABLE IF NOT EXISTS developer_events (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      key TEXT,
      value TEXT,
      workspace_id TEXT,
      created_at INTEGER NOT NULL
    );
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_dev_events_kind ON developer_events(kind);
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_dev_events_created ON developer_events(created_at);
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_dev_events_workspace ON developer_events(workspace_id);
    `,
    `
    CREATE TABLE IF NOT EXISTS work_sessions (
      id TEXT PRIMARY KEY,
      started_at INTEGER NOT NULL,
      ended_at INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      workspace_id TEXT,
      workspace_name TEXT,
      chats_created INTEGER NOT NULL DEFAULT 0,
      ai_requests INTEGER NOT NULL DEFAULT 0,
      recommendations_accepted INTEGER NOT NULL DEFAULT 0,
      files_changed INTEGER NOT NULL DEFAULT 0,
      workspace_switches INTEGER NOT NULL DEFAULT 0,
      summary TEXT,
      created_at INTEGER NOT NULL
    );
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_work_sessions_started ON work_sessions(started_at);
    `,
    `
    CREATE TABLE IF NOT EXISTS secret_records (
      owner_type TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'api-key',
      encrypted_payload TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      fingerprint TEXT NOT NULL,
      storage_mode TEXT NOT NULL,
      validation_status TEXT NOT NULL DEFAULT 'unchecked',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_used_at INTEGER,
      last_rotated_at INTEGER,
      last_validated_at INTEGER,
      expires_at INTEGER,
      PRIMARY KEY (owner_type, owner_id, kind)
    );
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_secret_records_owner ON secret_records(owner_type, owner_id);
    `,
  ]

  for (const migration of migrations) {
    await run(migration)
  }

  const schemaMigrations: Array<[string, string, string]> = [
    ['providers', 'capabilities', 'capabilities TEXT'],
    ['prompts', 'description', 'description TEXT'],
    ['terminal_history', 'approved_by', 'approved_by TEXT'],
    ['terminal_history', 'command_hash', 'command_hash TEXT'],
    ['terminal_history', 'status', 'status TEXT'],
    ['terminal_history', 'approval_id', 'approval_id TEXT'],
    ['terminal_history', 'output_size', 'output_size INTEGER DEFAULT 0'],
    ['terminal_history', 'truncated', 'truncated INTEGER DEFAULT 0'],
    ['terminal_history', 'cancelled', 'cancelled INTEGER DEFAULT 0'],
    ['terminal_history', 'finished_at', 'finished_at INTEGER'],
  ]
  for (const [table, column, ddl] of schemaMigrations) {
    await ensureColumn(table, column, ddl)
  }
}

export function getAllTables(): string[] {
  return ['settings', 'providers', 'workspaces', 'chats', 'messages', 'memories', 'prompts', 'usage', 'notifications', 'terminal_history', 'workspace_index', 'project_brain', 'developer_events', 'work_sessions', 'secret_records']
}
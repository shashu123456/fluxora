import { all, run } from '../database'
import type { TimelineEvent } from '../../src/types/workspaceIntelligence'

const TABLE = 'workspace_intelligence_timeline'

export async function ensureTimelineTable(): Promise<void> {
  await run(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      kind TEXT,
      title TEXT,
      detail TEXT,
      score REAL,
      delta REAL,
      created_at INTEGER
    )`
  )
}

export async function recordTimelineEvents(events: TimelineEvent[]): Promise<void> {
  if (!events.length) return
  await ensureTimelineTable()
  for (const e of events) {
    await run(
      `INSERT OR REPLACE INTO ${TABLE} (id, workspace_id, kind, title, detail, score, delta, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [e.id, e.workspaceId, e.kind, e.title, e.detail ?? null, e.score ?? null, e.delta ?? null, e.createdAt]
    )
  }
}

export async function listTimelineEvents(workspaceId: string, limit = 50): Promise<TimelineEvent[]> {
  await ensureTimelineTable()
  const rows = await all<any>(
    `SELECT * FROM ${TABLE} WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?`,
    [workspaceId, limit]
  )
  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    kind: row.kind,
    title: row.title,
    detail: row.detail ?? undefined,
    score: row.score ?? undefined,
    delta: row.delta ?? undefined,
    createdAt: row.created_at,
  }))
}

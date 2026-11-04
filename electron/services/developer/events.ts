import { randomUUID } from 'crypto'
import { all, get, run } from '../../database'
import type { LearningEvent, LearningEventKind } from '../../../src/types/developer'

const MAX_EVENTS = 5000

export interface RecordEventInput {
  key?: string | null
  value?: string | null
  workspaceId?: string | null
}

function mapRow(row: any): LearningEvent {
  return {
    id: row.id,
    kind: row.kind,
    key: row.key ?? null,
    value: row.value ?? null,
    workspaceId: row.workspace_id ?? null,
    createdAt: row.created_at,
  }
}

export async function recordEvent(kind: LearningEventKind, input: RecordEventInput = {}): Promise<LearningEvent> {
  const event: LearningEvent = {
    id: randomUUID(),
    kind,
    key: input.key ?? null,
    value: input.value ?? null,
    workspaceId: input.workspaceId ?? null,
    createdAt: Date.now(),
  }
  await run(
    'INSERT INTO developer_events (id, kind, key, value, workspace_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [event.id, event.kind, event.key, event.value, event.workspaceId, event.createdAt]
  )
  return event
}

export async function listEvents(limit = 400, since = 0): Promise<LearningEvent[]> {
  const rows = await all<any>(
    'SELECT * FROM developer_events WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?',
    [since, limit]
  )
  return rows.map(mapRow)
}

export async function eventsByKind(kind: LearningEventKind, limit = 400, since = 0): Promise<LearningEvent[]> {
  const rows = await all<any>(
    'SELECT * FROM developer_events WHERE kind = ? AND created_at >= ? ORDER BY created_at DESC LIMIT ?',
    [kind, since, limit]
  )
  return rows.map(mapRow)
}

export async function countEvents(kind?: LearningEventKind, since = 0): Promise<number> {
  const row = kind
    ? await get<any>('SELECT COUNT(*) AS count FROM developer_events WHERE kind = ? AND created_at >= ?', [kind, since])
    : await get<any>('SELECT COUNT(*) AS count FROM developer_events WHERE created_at >= ?', [since])
  return Number(row?.count || 0)
}

export async function countEventsByKey(kind: LearningEventKind, since = 0): Promise<{ key: string; count: number }[]> {
  const rows = await all<any>(
    'SELECT COALESCE(key, value) AS key, COUNT(*) AS count FROM developer_events WHERE kind = ? AND created_at >= ? AND COALESCE(key, value) IS NOT NULL GROUP BY COALESCE(key, value) ORDER BY count DESC',
    [kind, since]
  )
  return rows.map((row) => ({ key: String(row.key), count: Number(row.count) }))
}

export async function latestEventAt(): Promise<number> {
  const row = await get<any>('SELECT MAX(created_at) AS latest FROM developer_events')
  return Number(row?.latest || 0)
}

export async function pruneEvents(): Promise<void> {
  await run(
    'DELETE FROM developer_events WHERE kind NOT IN (?, ?) AND id NOT IN (SELECT id FROM developer_events ORDER BY created_at DESC LIMIT ?)',
    ['session_started', 'session_ended', MAX_EVENTS]
  )
}

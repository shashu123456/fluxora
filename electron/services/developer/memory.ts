import { randomUUID } from 'crypto'
import { all, run } from '../../database'
import type { MemoryEntry } from '../../../src/types'

export const DEVELOPER_WORKSPACE_ID = '__developer__'

function mapRow(row: any): MemoryEntry {
  let tags: string[] | undefined
  try {
    const parsed = row.tags ? JSON.parse(row.tags) : undefined
    tags = Array.isArray(parsed) ? parsed : undefined
  } catch {
    tags = undefined
  }
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    scope: row.scope,
    type: row.type,
    content: row.content,
    source: row.source,
    pinned: row.pinned,
    tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listDeveloperMemories(): Promise<MemoryEntry[]> {
  const rows = await all<any>(
    'SELECT * FROM memories WHERE workspace_id = ? ORDER BY pinned DESC, updated_at DESC',
    [DEVELOPER_WORKSPACE_ID]
  )
  return rows.map(mapRow)
}

export async function createDeveloperMemory(data: Partial<MemoryEntry>): Promise<MemoryEntry> {
  const now = Date.now()
  const entry: MemoryEntry = {
    id: randomUUID(),
    workspaceId: DEVELOPER_WORKSPACE_ID,
    scope: 'developer',
    type: data.type || 'user',
    content: data.content || '',
    source: data.source || 'manual',
    pinned: data.pinned || 0,
    tags: data.tags,
    createdAt: now,
    updatedAt: now,
  }
  await run(
    'INSERT INTO memories (id, workspace_id, scope, type, content, source, pinned, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      entry.id,
      entry.workspaceId,
      entry.scope,
      entry.type,
      entry.content,
      entry.source,
      entry.pinned,
      entry.tags ? JSON.stringify(entry.tags) : null,
      now,
      now,
    ]
  )
  return entry
}

export async function updateDeveloperMemory(id: string, data: Partial<MemoryEntry>): Promise<MemoryEntry | null> {
  const now = Date.now()
  const fields: string[] = []
  const values: any[] = []
  if (data.content !== undefined) {
    fields.push('content = ?')
    values.push(data.content)
  }
  if (data.type !== undefined) {
    fields.push('type = ?')
    values.push(data.type)
  }
  if (data.pinned !== undefined) {
    fields.push('pinned = ?')
    values.push(data.pinned)
  }
  if (data.tags !== undefined) {
    fields.push('tags = ?')
    values.push(JSON.stringify(data.tags))
  }
  fields.push('updated_at = ?')
  values.push(now)
  values.push(id)
  values.push(DEVELOPER_WORKSPACE_ID)
  await run(`UPDATE memories SET ${fields.join(', ')} WHERE id = ? AND workspace_id = ?`, values)
  const rows = await all<any>('SELECT * FROM memories WHERE id = ? AND workspace_id = ?', [id, DEVELOPER_WORKSPACE_ID])
  return rows.length ? mapRow(rows[0]) : null
}

export async function deleteDeveloperMemory(id: string): Promise<boolean> {
  await run('DELETE FROM memories WHERE id = ? AND workspace_id = ?', [id, DEVELOPER_WORKSPACE_ID])
  return true
}

export async function clearDeveloperMemories(): Promise<void> {
  await run('DELETE FROM memories WHERE workspace_id = ?', [DEVELOPER_WORKSPACE_ID])
}

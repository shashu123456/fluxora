import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { all, get, run } from '../database'
import { ProjectBrainEntry } from '../../src/types'

function mapRow(row: any): ProjectBrainEntry {
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
    title: row.title,
    content: row.content,
    kind: row.kind,
    status: row.status,
    tags,
    pinned: row.pinned,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function registerBrainIpc() {
  ipcMain.handle('brain:list', async (_e, workspaceId: string) => {
    const rows = await all<any>(
      'SELECT * FROM project_brain WHERE workspace_id = ? ORDER BY pinned DESC, updated_at DESC',
      [workspaceId]
    )
    return rows.map(mapRow)
  })

  ipcMain.handle('brain:get', async (_e, id: string) => {
    const row = await get<any>('SELECT * FROM project_brain WHERE id = ?', [id])
    return row ? mapRow(row) : null
  })

  ipcMain.handle('brain:create', async (_e, data: Partial<ProjectBrainEntry>) => {
    const now = Date.now()
    const entry: ProjectBrainEntry = {
      id: randomUUID(),
      workspaceId: data.workspaceId || 'global',
      title: data.title || 'Untitled note',
      content: data.content || '',
      kind: data.kind || 'note',
      status: data.status,
      tags: data.tags,
      pinned: data.pinned || 0,
      source: data.source || 'manual',
      createdAt: now,
      updatedAt: now,
    }
    await run(
      'INSERT INTO project_brain (id, workspace_id, title, content, kind, status, tags, pinned, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [entry.id, entry.workspaceId, entry.title, entry.content, entry.kind, entry.status || null, entry.tags ? JSON.stringify(entry.tags) : null, entry.pinned, entry.source, now, now]
    )
    return entry
  })

  ipcMain.handle('brain:update', async (_e, id: string, data: Partial<ProjectBrainEntry>) => {
    const now = Date.now()
    const fields: string[] = []
    const values: any[] = []
    const mapping: Record<string, string> = {
      title: 'title',
      content: 'content',
      kind: 'kind',
      status: 'status',
      pinned: 'pinned',
      source: 'source',
    }
    for (const [tsKey, dbKey] of Object.entries(mapping)) {
      const v = (data as any)[tsKey]
      if (v !== undefined) {
        fields.push(dbKey)
        values.push(tsKey === 'status' && v === null ? null : v)
      }
    }
    if (data.tags !== undefined) {
      fields.push('tags')
      values.push(data.tags ? JSON.stringify(data.tags) : null)
    }
    fields.push('updated_at')
    values.push(now)
    values.push(id)
    await run(`UPDATE project_brain SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, values)
    const row = await get<any>('SELECT * FROM project_brain WHERE id = ?', [id])
    return row ? mapRow(row) : null
  })

  ipcMain.handle('brain:delete', async (_e, id: string) => {
    await run('DELETE FROM project_brain WHERE id = ?', [id])
    return true
  })

  ipcMain.handle('brain:search', async (_e, workspaceId: string, query: string) => {
    const like = `%${query}%`
    const rows = await all<any>(
      `SELECT * FROM project_brain WHERE workspace_id = ? AND (title LIKE ? OR content LIKE ?) ORDER BY pinned DESC, updated_at DESC`,
      [workspaceId, like, like]
    )
    return rows.map(mapRow)
  })
}
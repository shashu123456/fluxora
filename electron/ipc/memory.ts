import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { all, get, run } from '../database'
import { MemoryEntry } from '../../src/types'

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

export function registerMemoryIpc() {
  ipcMain.handle('memory:list', async (_e, workspaceId: string) => {
    const rows = await all<any>(
      'SELECT * FROM memories WHERE workspace_id = ? ORDER BY pinned DESC, updated_at DESC',
      [workspaceId]
    )
    return rows.map(mapRow)
  })

  ipcMain.handle('memory:create', async (_e, data: Partial<MemoryEntry>) => {
    const now = Date.now()
    const entry: MemoryEntry = {
      id: randomUUID(),
      workspaceId: data.workspaceId || 'global',
      scope: data.scope || 'global',
      type: data.type || 'custom',
      content: data.content || '',
      source: data.source,
      pinned: data.pinned || 0,
      tags: data.tags,
      createdAt: now,
      updatedAt: now,
    }
    await run(
      'INSERT INTO memories (id, workspace_id, scope, type, content, source, pinned, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [entry.id, entry.workspaceId, entry.scope, entry.type, entry.content, entry.source, entry.pinned, entry.tags ? JSON.stringify(entry.tags) : null, now, now]
    )
    return entry
  })

  ipcMain.handle('memory:update', async (_e, id: string, data: Partial<MemoryEntry>) => {
    const now = Date.now()
    const fields: string[] = []
    const values: any[] = []
    const mapping: Record<string, string> = {
      workspaceId: 'workspace_id',
      scope: 'scope',
      type: 'type',
      content: 'content',
      source: 'source',
      pinned: 'pinned',
    }
    for (const [tsKey, dbKey] of Object.entries(mapping)) {
      const v = (data as any)[tsKey]
      if (v !== undefined) {
        fields.push(dbKey)
        values.push(v)
      }
    }
    if (data.tags !== undefined) {
      fields.push('tags')
      values.push(JSON.stringify(data.tags))
    }
    fields.push('updated_at')
    values.push(now)
    values.push(id)
    await run(`UPDATE memories SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, values)
    const row = await get<any>('SELECT * FROM memories WHERE id = ?', [id])
    return row ? mapRow(row) : null
  })

  ipcMain.handle('memory:delete', async (_e, id: string) => {
    await run('DELETE FROM memories WHERE id = ?', [id])
    return true
  })

  ipcMain.handle('memory:search', async (_e, workspaceId: string, query: string) => {
    const like = `%${query}%`
    const rows = await all<any>(
      'SELECT * FROM memories WHERE workspace_id = ? AND content LIKE ? ORDER BY pinned DESC, updated_at DESC',
      [workspaceId, like]
    )
    return rows.map(mapRow)
  })

  ipcMain.handle('memory:toggle', async (_e, workspaceId: string, enabled: boolean) => {
    await setWorkspaceMemorySetting(workspaceId, 'memoryEnabled', enabled)
    return enabled
  })

  ipcMain.handle('memory:settings', async () => {
    const rows = await all<any>("SELECT * FROM settings WHERE key LIKE 'memory_%'")
    const result: Record<string, any> = {}
    for (const row of rows) {
      try {
        result[row.key] = JSON.parse(row.value)
      } catch {
        result[row.key] = row.value
      }
    }
    return result
  })

  ipcMain.handle('memory:auto-remember', async (_e, workspaceId: string, enabled: boolean) => {
    await setWorkspaceMemorySetting(workspaceId, 'autoRemember', enabled)
    return enabled
  })

  ipcMain.handle('memory:auto-extract', async (_e, workspaceId: string, content: string) => {
    const extracted = await extractMemories(content)
    const now = Date.now()
    const created: MemoryEntry[] = []
    for (const mem of extracted) {
      const entry: MemoryEntry = {
        id: randomUUID(),
        workspaceId,
        scope: 'workspace',
        type: 'user',
        content: mem,
        source: 'auto-extracted',
        pinned: 0,
        createdAt: now,
        updatedAt: now,
      }
      await run(
        'INSERT INTO memories (id, workspace_id, scope, type, content, source, pinned, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [entry.id, workspaceId, entry.scope, entry.type, entry.content, entry.source, 0, null, now, now]
      )
      created.push(entry)
    }
    return created
  })
}

async function setWorkspaceMemorySetting(workspaceId: string, key: keyof MemorySettings, value: any) {
  const row = await get<any>('SELECT settings FROM workspaces WHERE id = ?', [workspaceId])
  const settings = row?.settings ? JSON.parse(row.settings) : {}
  settings[key] = value
  await run('UPDATE workspaces SET settings = ?, updated_at = ? WHERE id = ?', [JSON.stringify(settings), Date.now(), workspaceId])
}

interface MemorySettings {
  memoryEnabled: boolean
  autoRemember: boolean
  autoExtract: boolean
}

function extractMemories(content: string): string[] {
  const results: string[] = []
  const sentences = content.split(/(?<=[.!?])\s+/)

  const preferences = content.match(/(?:i (?:like|prefer|love|hate|enjoy|dislike|want|need|like to|prefer to|always|never)[^.!?\n]*[.!?])/gi)
  if (preferences) results.push(...preferences.map((m) => m.trim()))

  const facts = content.match(/(?:my (?:name is|age is|email is|birthday is|company is|job is|role is|team is|project is|language is|location is|favorite is|favorite color is)[^.!?\n]*[.!?])/gi)
  if (facts) results.push(...facts.map((m) => m.trim()))

  const decisions = content.match(/(?:we (?:decided|chose|agreed|are using|will use|should use|plan to use)[^.!?\n]*[.!?])/gi)
  if (decisions) results.push(...decisions.map((m) => m.trim()))

  const projectContext = content.match(/(?:the (?:project|app|website|codebase|repo|application)[^.!?\n]{5,180}[.!?])/gi)
  if (projectContext) results.push(...projectContext.map((m) => m.trim()))

  const capped = results.slice(0, 5)
  return Array.from(new Set(capped))
}
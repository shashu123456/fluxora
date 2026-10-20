import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { all, get, run } from '../database'
import { PromptTemplate } from '../../src/types'

function mapRow(row: any): PromptTemplate {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    content: row.content,
    category: row.category,
    pinned: row.pinned,
    variables: JSON.parse(row.variables || '[]'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function registerPromptIpc() {
  ipcMain.handle('prompts:list', async (_e, workspaceId: string) => {
    const rows = await all<any>(
      'SELECT * FROM prompts WHERE workspace_id = ? OR workspace_id = ? ORDER BY pinned DESC, updated_at DESC',
      [workspaceId, 'shared']
    )
    return rows.map(mapRow)
  })

  ipcMain.handle('prompts:create', async (_e, data: Partial<PromptTemplate>) => {
    const now = Date.now()
    const prompt: PromptTemplate = {
      id: randomUUID(),
      workspaceId: data.workspaceId || 'global',
      name: data.name || 'New Prompt',
      content: data.content || '',
      category: data.category || 'General',
      pinned: data.pinned || 0,
      variables: data.variables || [],
      createdAt: now,
      updatedAt: now,
    }
    await run(
      'INSERT INTO prompts (id, workspace_id, name, content, category, pinned, variables, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [prompt.id, prompt.workspaceId, prompt.name, prompt.content, prompt.category, prompt.pinned, JSON.stringify(prompt.variables), now, now]
    )
    return prompt
  })

  ipcMain.handle('prompts:update', async (_e, id: string, data: Partial<PromptTemplate>) => {
    const now = Date.now()
    const fields: string[] = []
    const values: any[] = []
    const mapping: Record<string, string> = {
      name: 'name',
      content: 'content',
      category: 'category',
      pinned: 'pinned',
    }
    for (const [tsKey, dbKey] of Object.entries(mapping)) {
      const v = (data as any)[tsKey]
      if (v !== undefined) {
        fields.push(dbKey)
        values.push(v)
      }
    }
    if (data.variables !== undefined) {
      fields.push('variables')
      values.push(JSON.stringify(data.variables))
    }
    if (fields.length === 0) return null
    fields.push('updated_at')
    values.push(now)
    values.push(id)
    await run(`UPDATE prompts SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, values)
    const row = await get<any>('SELECT * FROM prompts WHERE id = ?', [id])
    return row ? mapRow(row) : null
  })

  ipcMain.handle('prompts:delete', async (_e, id: string) => {
    await run('DELETE FROM prompts WHERE id = ?', [id])
    return true
  })
}
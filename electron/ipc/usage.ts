import { ipcMain } from 'electron'
import { all, get, run } from '../database'
import { UsageRecord } from '../../src/types'

function mapRow(row: any): UsageRecord {
  return {
    id: row.id,
    providerId: row.provider_id,
    model: row.model,
    chatId: row.chat_id,
    workspaceId: row.workspace_id,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.total_tokens,
    cost: row.cost,
    responseTimeMs: row.response_time_ms,
    streaming: row.streaming,
    status: row.status,
    createdAt: row.created_at,
  }
}

export function registerUsageIpc() {
  ipcMain.handle('usage:record', async (_e, data: Partial<UsageRecord>) => {
    const now = data.createdAt || Date.now()
    await run(
      'INSERT INTO usage (provider_id, model, chat_id, workspace_id, prompt_tokens, completion_tokens, total_tokens, cost, response_time_ms, streaming, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        data.providerId || '', data.model || '', data.chatId || null, data.workspaceId || null,
        data.promptTokens || 0, data.completionTokens || 0, data.totalTokens || 0,
        data.cost || 0, data.responseTimeMs || 0, data.streaming ? 1 : 0, data.status || 'success', now,
      ]
    )
    return true
  })

  ipcMain.handle('usage:summary', async (_e, providerId?: string) => {
    const where = providerId ? 'WHERE provider_id = ?' : ''
    const params = providerId ? [providerId] : []
    const row = await get<any>(
      `SELECT COUNT(*) as requests,
              SUM(prompt_tokens) as promptTokens,
              SUM(completion_tokens) as completionTokens,
              SUM(total_tokens) as totalTokens,
              SUM(cost) as cost,
              AVG(response_time_ms) as avgResponseTime,
              SUM(streaming) as streamingCount,
              SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors
       FROM usage ${where}`,
      params
    )
    return row ? {
      requests: row.requests || 0,
      promptTokens: row.promptTokens || 0,
      completionTokens: row.completionTokens || 0,
      totalTokens: row.totalTokens || 0,
      cost: Math.round((row.cost || 0) * 100000) / 100000,
      avgResponseTimeMs: Math.round(row.avgResponseTime || 0),
      streamingCount: row.streamingCount || 0,
      errors: row.errors || 0,
    } : null
  })

  ipcMain.handle('usage:detailed', async (_e, providerId?: string) => {
    const where = providerId ? 'WHERE provider_id = ?' : 'WHERE 1=1'
    const params = providerId ? [providerId] : []
    const rows = await all<any>(
      `SELECT * FROM usage ${where} ORDER BY created_at DESC LIMIT 2000`,
      params
    )
    return rows.map(mapRow)
  })

  ipcMain.handle('usage:by-provider', async () => {
    const rows = await all<any>(
      `SELECT provider_id as providerId,
              model,
              COUNT(*) as requests,
              SUM(prompt_tokens) as promptTokens,
              SUM(completion_tokens) as completionTokens,
              SUM(total_tokens) as totalTokens,
              SUM(cost) as cost,
              AVG(response_time_ms) as avgResponseTime
       FROM usage
       GROUP BY provider_id, model
       ORDER BY requests DESC`
    )
    return rows.map((r) => ({
      providerId: r.providerId || 'unknown',
      model: r.model,
      requests: r.requests,
      promptTokens: r.promptTokens,
      completionTokens: r.completionTokens,
      totalTokens: r.totalTokens,
      cost: r.cost,
      avgResponseTimeMs: Math.round(r.avgResponseTime || 0),
    }))
  })

  ipcMain.handle('usage:clear', async (_e, providerId?: string) => {
    if (providerId) {
      await run('DELETE FROM usage WHERE provider_id = ?', [providerId])
    } else {
      await run('DELETE FROM usage')
    }
    return true
  })
}
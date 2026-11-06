import { randomUUID } from 'node:crypto'
import { all, run } from '../../database'

export const AUDIT_RETENTION = 500

export interface AuditEntryInput {
  apiId: string
  endpoint: string
  method: string
  statusCode: number | null
  durationMs: number
  responseBytes: number
  outcome: 'success' | 'http_error' | 'blocked' | 'failed' | 'rate_limited'
  errorCode?: string | null
}

export interface ApiAuditRow {
  id: number
  requestId: string
  apiId: string
  endpoint: string
  method: string
  statusCode: number | null
  durationMs: number
  responseBytes: number
  outcome: string
  errorCode: string | null
  createdAt: number
}

export interface ApiAuditEntry {
  id: number
  requestId: string
  apiId: string
  endpoint: string
  method: string
  statusCode: number | null
  durationMs: number
  responseBytes: number
  outcome: string
  errorCode: string | null
  createdAt: number
}

function mapRow(row: any): ApiAuditEntry {
  return {
    id: row.id,
    requestId: row.request_id,
    apiId: row.api_id,
    endpoint: row.endpoint,
    method: row.method,
    statusCode: row.status_code,
    durationMs: row.duration_ms,
    responseBytes: row.response_bytes,
    outcome: row.outcome,
    errorCode: row.error_code,
    createdAt: row.created_at,
  }
}

/** Writes one audit row, then trims anything beyond the newest 500. */
export async function recordApiCall(input: AuditEntryInput, now = Date.now()): Promise<string> {
  const requestId = randomUUID()
  await run(
    `INSERT INTO api_audit_log
      (request_id, api_id, endpoint, method, status_code, duration_ms, response_bytes, outcome, error_code, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      requestId,
      input.apiId,
      input.endpoint,
      input.method,
      input.statusCode,
      Math.max(0, Math.round(input.durationMs)),
      Math.max(0, Math.round(input.responseBytes)),
      input.outcome,
      input.errorCode ?? null,
      now,
    ]
  )
  await pruneApiAudit(AUDIT_RETENTION)
  return requestId
}

export async function listApiAudit(limit = 100): Promise<ApiAuditEntry[]> {
  const rows = await all<any>(
    `SELECT * FROM api_audit_log ORDER BY created_at DESC, id DESC LIMIT ?`,
    [Math.min(500, Math.max(1, Math.floor(limit)))]
  )
  return rows.map(mapRow)
}

export async function pruneApiAudit(max = AUDIT_RETENTION): Promise<void> {
  await run(
    `DELETE FROM api_audit_log WHERE id NOT IN (
       SELECT id FROM api_audit_log ORDER BY created_at DESC, id DESC LIMIT ?
     )`,
    [Math.max(1, Math.floor(max))]
  )
}

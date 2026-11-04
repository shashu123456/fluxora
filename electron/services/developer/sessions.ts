import { randomUUID } from 'crypto'
import { all, run } from '../../database'
import type { LearningEventKind, WorkSession } from '../../../src/types/developer'
import { recordEvent } from './events'

const IDLE_MS = 15 * 60 * 1000
const TICK_MS = 60 * 1000

interface RecordInput {
  key?: string | null
  value?: string | null
  workspaceId?: string | null
  workspaceName?: string | null
}

interface ActiveSession {
  id: string
  startedAt: number
  lastActivityAt: number
  workspaceId: string | null
  workspaceName: string | null
  chatsCreated: number
  aiRequests: number
  recommendationsAccepted: number
  files: Set<string>
  workspaceSwitches: number
}

let active: ActiveSession | null = null
let ticker: ReturnType<typeof setInterval> | null = null
let started = false

function ensureSession(workspaceId?: string | null, workspaceName?: string | null): ActiveSession {
  const now = Date.now()
  if (active && now - active.lastActivityAt < IDLE_MS) {
    if (workspaceId && workspaceId !== active.workspaceId) {
      active.workspaceId = workspaceId
      active.workspaceName = workspaceName ?? active.workspaceName
    }
    return active
  }
  if (active) void flush('idle')
  active = {
    id: randomUUID(),
    startedAt: now,
    lastActivityAt: now,
    workspaceId: workspaceId ?? null,
    workspaceName: workspaceName ?? null,
    chatsCreated: 0,
    aiRequests: 0,
    recommendationsAccepted: 0,
    files: new Set<string>(),
    workspaceSwitches: 0,
  }
  void recordEvent('session_started', { workspaceId: workspaceId ?? null })
  return active
}

function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`
}

function summarize(session: ActiveSession, endedAt: number): string {
  const parts: string[] = [formatDuration(endedAt - session.startedAt)]
  if (session.chatsCreated) parts.push(`${session.chatsCreated} chat${session.chatsCreated === 1 ? '' : 's'}`)
  if (session.aiRequests) parts.push(`${session.aiRequests} AI request${session.aiRequests === 1 ? '' : 's'}`)
  if (session.recommendationsAccepted) {
    parts.push(`${session.recommendationsAccepted} recommendation${session.recommendationsAccepted === 1 ? '' : 's'} accepted`)
  }
  if (session.files.size) parts.push(`${session.files.size} file${session.files.size === 1 ? '' : 's'} touched`)
  if (session.workspaceSwitches > 1) parts.push(`${session.workspaceSwitches} workspace switches`)
  return parts.join(' · ')
}

async function flush(_reason: string): Promise<void> {
  const session = active
  if (!session) return
  active = null
  const endedAt = Math.max(session.lastActivityAt, session.startedAt)
  const duration = endedAt - session.startedAt
  const hasActivity =
    session.chatsCreated + session.aiRequests + session.recommendationsAccepted + session.files.size > 0
  if (duration < 60_000 && !hasActivity) return
  await run(
    `INSERT OR REPLACE INTO work_sessions
      (id, started_at, ended_at, duration_ms, workspace_id, workspace_name, chats_created, ai_requests, recommendations_accepted, files_changed, workspace_switches, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      session.id,
      session.startedAt,
      endedAt,
      duration,
      session.workspaceId,
      session.workspaceName,
      session.chatsCreated,
      session.aiRequests,
      session.recommendationsAccepted,
      session.files.size,
      session.workspaceSwitches,
      summarize(session, endedAt),
      Date.now(),
    ]
  )
  await recordEvent('session_ended', { value: String(duration), workspaceId: session.workspaceId })
}

export async function track(kind: LearningEventKind, input: RecordInput = {}): Promise<void> {
  await recordEvent(kind, { key: input.key, value: input.value, workspaceId: input.workspaceId ?? null })
  const session = ensureSession(input.workspaceId, input.workspaceName)
  session.lastActivityAt = Date.now()
  if (input.workspaceId) {
    session.workspaceId = input.workspaceId
    session.workspaceName = input.workspaceName ?? session.workspaceName
  }
  switch (kind) {
    case 'chat_created':
      session.chatsCreated += 1
      break
    case 'ai_request':
      session.aiRequests += 1
      break
    case 'recommendation_accepted':
      session.recommendationsAccepted += 1
      break
    case 'workspace_switched':
      session.workspaceSwitches += 1
      break
    case 'file_opened':
      if (input.key) session.files.add(input.key)
      break
    default:
      break
  }
}

export async function startSessionTracking(): Promise<void> {
  if (started) return
  started = true
  ensureSession()
  ticker = setInterval(() => {
    if (active && Date.now() - active.lastActivityAt >= IDLE_MS) {
      void flush('idle')
    }
  }, TICK_MS)
  ticker.unref?.()
}

export async function stopSessionTracking(): Promise<void> {
  if (ticker) {
    clearInterval(ticker)
    ticker = null
  }
  started = false
  await flush('quit')
}

function mapSession(row: any): WorkSession {
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationMs: row.duration_ms,
    workspaceId: row.workspace_id ?? null,
    workspaceName: row.workspace_name ?? null,
    chatsCreated: Number(row.chats_created || 0),
    aiRequests: Number(row.ai_requests || 0),
    recommendationsAccepted: Number(row.recommendations_accepted || 0),
    filesChanged: Number(row.files_changed || 0),
    workspaceSwitches: Number(row.workspace_switches || 0),
    summary: row.summary || '',
  }
}

export async function getSessions(limit = 20): Promise<WorkSession[]> {
  const rows = await all<any>('SELECT * FROM work_sessions ORDER BY started_at DESC LIMIT ?', [limit])
  return rows.map(mapSession)
}

export async function getLastSession(): Promise<WorkSession | null> {
  const rows = await all<any>('SELECT * FROM work_sessions ORDER BY started_at DESC LIMIT 1')
  return rows.length ? mapSession(rows[0]) : null
}

export async function sessionCount(): Promise<number> {
  const rows = await all<any>('SELECT COUNT(*) AS count FROM work_sessions')
  return Number(rows[0]?.count || 0)
}

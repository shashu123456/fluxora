import type { Recommendation } from './workspaceIntelligence'

export type TerminalRunStatus =
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'timed-out'
  | 'rejected'

export type TerminalApprovalKind = 'once' | 'session'

export interface TerminalRunRequest {
  workspaceId?: string
  command: string
  cwd?: string
  timeoutMs?: number
}

export interface TerminalCommandParts {
  program: string
  args: string[]
  display: string
}

export interface TerminalRunResult {
  runId: string
  status: TerminalRunStatus
  command: string
  cwd: string
  output: string
  exitCode: number | null
  durationMs: number
  outputSize: number
  truncated: boolean
  cancelled: boolean
  timedOut: boolean
  binary: boolean
  error?: string
  approvalId?: string | null
  approvedBy?: TerminalApprovalKind | null
}

export interface TerminalActivityEntry {
  runId: string
  workspaceId: string
  workspaceName?: string
  command: string
  cwd: string
  status: TerminalRunStatus
  exitCode: number | null
  durationMs: number
  startedAt: number
  finishedAt?: number | null
  cancelled: boolean
  truncated: boolean
  approvedBy?: TerminalApprovalKind | null
}

export interface TerminalActivitySnapshot {
  running: TerminalActivityEntry[]
  recent: TerminalActivityEntry[]
  generatedAt: number
}

export interface TerminalSummaryLine {
  label: string
  status: 'success' | 'failed' | 'neutral'
  detail?: string
}

export interface TerminalContextSummary {
  workspaceId: string
  total: number
  success: number
  failed: number
  cancelled: number
  timedOut: number
  lines: TerminalSummaryLine[]
  frequentCommands: { command: string; count: number }[]
  lastCommand?: string
  lastStatus?: TerminalRunStatus
  packageManager?: string
  generatedAt: number
}

export interface TerminalRecommendations {
  workspaceId: string
  recommendations: Recommendation[]
  generatedAt: number
}

export interface TerminalUpdatedEvent {
  runId: string
  workspaceId: string
  entry: TerminalActivityEntry
}

export interface TerminalOutputEvent {
  runId: string
  workspaceId: string
  chunk: string
}

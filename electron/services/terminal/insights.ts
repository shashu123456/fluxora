import { all, run } from '../../database'
import type { Recommendation } from '../../../src/types/workspaceIntelligence'
import type {
  TerminalContextSummary,
  TerminalRecommendations,
  TerminalRunStatus,
  TerminalSummaryLine,
} from '../../../src/types/terminal'

interface TerminalRow {
  command: string
  status: string | null
  exit_code: number | null
  duration_ms: number | null
  output_size: number | null
  created_at: number
}

const TEST_PATTERN = /(^|\s)(test|tests|vitest|jest|pytest|cargo\s+test|go\s+test)(\s|$)/i
const BUILD_PATTERN = /(^|\s)(build|compile|tsc|vite\s+build|webpack|rollup|next\s+build|cargo\s+build)(\s|$)/i
const LINT_PATTERN = /(^|\s)(lint|eslint|prettier|ruff|clippy|tsc\s+--noEmit)(\s|$)/i
const INSTALL_PATTERN = /(^|\s)(install|ci|add|update|upgrade)(\s|$)/i

function resolvedStatus(row: TerminalRow): TerminalRunStatus {
  if (row.status === 'success' || row.status === 'failed' || row.status === 'cancelled' || row.status === 'timed-out') {
    return row.status
  }
  return row.exit_code === 0 ? 'success' : 'failed'
}

function programOf(command: string): string {
  const first = command.trim().split(/\s+/)[0] || 'command'
  return first.replace(/^["']|["']$/g, '').replace(/\.exe$/i, '').toLowerCase()
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  return `${Math.round(ms / 60000)}m`
}

async function loadRows(workspaceId: string, limit = 80): Promise<TerminalRow[]> {
  try {
    return await all<TerminalRow>(
      `SELECT command, status, exit_code, duration_ms, output_size, created_at
       FROM terminal_history
       WHERE workspace_id = ? AND (status IS NULL OR status != 'running') AND (status IS NULL OR status != 'rejected')
       ORDER BY created_at DESC
       LIMIT ?`,
      [workspaceId, limit]
    )
  } catch {
    return []
  }
}

export async function getTerminalContext(workspaceId: string): Promise<TerminalContextSummary> {
  const rows = await loadRows(workspaceId)
  const statuses = rows.map(resolvedStatus)
  const success = statuses.filter((status) => status === 'success').length
  const failed = statuses.filter((status) => status === 'failed').length
  const cancelled = statuses.filter((status) => status === 'cancelled').length
  const timedOut = statuses.filter((status) => status === 'timed-out').length

  const counts = new Map<string, number>()
  for (const row of rows) {
    const program = programOf(row.command)
    counts.set(program, (counts.get(program) || 0) + 1)
  }
  const frequentCommands = Array.from(counts.entries())
    .map(([command, count]) => ({ command, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const lines: TerminalSummaryLine[] = []
  const latest = rows[0]
  if (latest) {
    const status = resolvedStatus(latest)
    lines.push({
      label: `${programOf(latest.command)} ${status === 'success' ? 'succeeded' : status === 'failed' ? 'failed' : status === 'timed-out' ? 'timed out' : 'was cancelled'}`,
      status: status === 'success' ? 'success' : 'failed',
      detail: `Last run ${formatDuration(latest.duration_ms || 0)} ago in this workspace`,
    })
  }

  const lastTest = rows.find((row) => TEST_PATTERN.test(row.command))
  if (lastTest) {
    const status = resolvedStatus(lastTest)
    lines.push({
      label: `Tests last ${status === 'success' ? 'passed' : 'failed'}`,
      status: status === 'success' ? 'success' : 'failed',
      detail: lastTest.command.slice(0, 120),
    })
  }
  const lastBuild = rows.find((row) => BUILD_PATTERN.test(row.command))
  if (lastBuild) {
    const status = resolvedStatus(lastBuild)
    lines.push({
      label: `Build last ${status === 'success' ? 'succeeded' : 'failed'}`,
      status: status === 'success' ? 'success' : 'failed',
      detail: lastBuild.command.slice(0, 120),
    })
  }
  const lastLint = rows.find((row) => LINT_PATTERN.test(row.command))
  if (lastLint && resolvedStatus(lastLint) === 'failed') {
    lines.push({ label: 'Lint is failing', status: 'failed', detail: lastLint.command.slice(0, 120) })
  }
  const lastInstall = rows.find((row) => INSTALL_PATTERN.test(row.command))
  if (lastInstall && resolvedStatus(lastInstall) === 'success') {
    lines.push({ label: 'Dependencies were installed recently', status: 'success', detail: lastInstall.command.slice(0, 120) })
  }
  if (failed >= 2) {
    lines.push({ label: `${failed} failed runs in recent history`, status: 'failed' })
  }
  if (timedOut > 0) {
    lines.push({ label: `${timedOut} command${timedOut === 1 ? '' : 's'} timed out`, status: 'failed' })
  }
  if (lines.length === 0) {
    lines.push({ label: 'No terminal activity yet', status: 'neutral' })
  }

  const durations = rows.map((row) => row.duration_ms || 0).filter((value) => value > 0)
  const averageDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0
  if (averageDuration > 30000) {
    lines.push({ label: `Commands average ${formatDuration(averageDuration)}`, status: 'neutral' })
  }

  const packageManager = ['pnpm', 'yarn', 'bun', 'npm'].find((name) =>
    frequentCommands.some((item) => item.command === name || item.command === `${name}.cmd`)
  )

  return {
    workspaceId,
    total: rows.length,
    success,
    failed,
    cancelled,
    timedOut,
    lines: lines.slice(0, 6),
    frequentCommands,
    lastCommand: latest?.command.slice(0, 160),
    lastStatus: latest ? resolvedStatus(latest) : undefined,
    packageManager,
    generatedAt: Date.now(),
  }
}

export async function getTerminalRecommendations(workspaceId: string): Promise<TerminalRecommendations> {
  const rows = await loadRows(workspaceId)
  const context = await getTerminalContext(workspaceId)
  const recommendations: Recommendation[] = []
  const latest = rows[0]
  const lastTest = rows.find((row) => TEST_PATTERN.test(row.command))
  const lastBuild = rows.find((row) => BUILD_PATTERN.test(row.command))

  if (lastTest && resolvedStatus(lastTest) === 'failed') {
    recommendations.push({
      id: 'terminal-tests-failing',
      category: 'testing',
      title: 'The last test run failed',
      detail: 'Re-run the failing command and fix it before starting new work.',
      why: 'A red test run makes every following change harder to trust.',
      priority: 'high',
      metric: 'Latest test status',
      impact: 90,
      severity: 'critical',
      action: { kind: 'runCommand', label: 'Re-run tests', payload: { command: lastTest.command } },
    })
  }

  if (latest && resolvedStatus(latest) === 'failed' && !recommendations.length) {
    recommendations.push({
      id: 'terminal-last-failed',
      category: 'maintenance',
      title: `The last command failed: ${programOf(latest.command)}`,
      detail: 'Inspect the recent terminal output and resolve the failure before continuing.',
      why: 'Unresolved command failures tend to compound into larger debugging sessions.',
      priority: 'high',
      metric: 'Latest run status',
      impact: 80,
      severity: 'warning',
      action: { kind: 'runCommand', label: 'Run again', payload: { command: latest.command } },
    })
  }

  if (lastBuild && resolvedStatus(lastBuild) === 'success' && (!lastTest || lastTest.created_at < lastBuild.created_at)) {
    recommendations.push({
      id: 'terminal-tests-before-build',
      category: 'testing',
      title: 'Run tests after the successful build',
      detail: 'The latest build passed but no test run has followed it.',
      why: 'Builds prove compilation, not behavior. Tests catch regressions earlier.',
      priority: 'medium',
      metric: 'Build vs test recency',
      impact: 60,
      severity: 'warning',
      action: { kind: 'runCommand', label: 'Run tests' },
    })
  }

  if (lastTest && lastTest.command) {
    const packageCommand = context.packageManager ? `${context.packageManager} test` : 'the test command'
    recommendations.push({
      id: 'terminal-test-workflow',
      category: 'testing',
      title: `Use ${packageCommand} as the standard test command`,
      detail: 'A consistent test entrypoint keeps verification fast and predictable.',
      why: 'Mixing runners slows down feedback and hides failures.',
      priority: 'low',
      metric: 'Preferred package manager',
      impact: 30,
      severity: 'info',
      action: { kind: 'runCommand', label: 'Run tests', payload: { command: packageCommand } },
    })
  }

  if (context.failed >= 3) {
    recommendations.push({
      id: 'terminal-failure-frequency',
      category: 'maintenance',
      title: 'Command failures are recurring',
      detail: `${context.failed} of the last ${context.total} runs failed. Stabilize the routine build and test commands.`,
      why: 'A noisy terminal workflow hides real regressions and slows every iteration.',
      priority: 'high',
      metric: 'Recent failure rate',
      impact: 85,
      severity: 'warning',
    })
  }

  const durations = rows.map((row) => row.duration_ms || 0).filter((value) => value > 0)
  const average = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0
  if (average > 30000) {
    recommendations.push({
      id: 'terminal-slow-commands',
      category: 'performance',
      title: 'Terminal commands are slow',
      detail: `Commands average ${formatDuration(average)}. Consider narrower test targets or caching.`,
      why: 'Slow feedback pushes developers to skip verification.',
      priority: 'medium',
      metric: 'Average duration',
      impact: 55,
      severity: 'warning',
    })
  }

  return { workspaceId, recommendations: recommendations.slice(0, 4), generatedAt: Date.now() }
}

export async function updateProjectBrainFromTerminal(workspaceId: string): Promise<void> {
  if (!workspaceId || workspaceId === 'global') return
  const context = await getTerminalContext(workspaceId)
  if (context.total < 3) return

  const now = Date.now()
  const id = `terminal:${workspaceId}`
  const top = context.frequentCommands.slice(0, 3).map((item) => `${item.command} (${item.count})`).join(', ')
  const lines = [
    `${context.total} recent terminal runs: ${context.success} succeeded, ${context.failed} failed.`,
    top ? `Frequent commands: ${top}.` : '',
    context.packageManager ? `Preferred package manager: ${context.packageManager}.` : '',
    context.lines[0] ? `${context.lines[0].label}.` : '',
  ].filter(Boolean)
  const content = lines.join(' ').slice(0, 1200)
  const tags = JSON.stringify(['terminal', 'workflow'])

  try {
    await run(
      `INSERT INTO project_brain (id, workspace_id, title, content, kind, status, tags, pinned, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         content = excluded.content,
         kind = excluded.kind,
         status = excluded.status,
         tags = excluded.tags,
         updated_at = excluded.updated_at`,
      [id, workspaceId, 'Terminal workflow', content, 'convention', 'active', tags, 'terminal', now, now]
    )
  } catch {
    // Terminal insight is best-effort; never fail a command because of it.
  }
}

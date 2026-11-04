import { all } from '../../database'
import type { SessionBriefing } from '../../../src/types/developer'
import { countEvents } from './events'
import { getLastSession } from './sessions'
import { getWorkspaceIntelligence } from '../workspaceIntelligence'

const HEALTH_LABELS: Array<{ key: string; label: string }> = [
  { key: 'documentationScore', label: 'documentation' },
  { key: 'aiReadinessScore', label: 'AI readiness' },
  { key: 'architectureScore', label: 'architecture' },
  { key: 'codeOrganizationScore', label: 'code organization' },
  { key: 'dependencyHealth', label: 'dependency health' },
  { key: 'securityScore', label: 'security' },
  { key: 'maintainabilityScore', label: 'maintainability' },
  { key: 'performanceScore', label: 'performance' },
]

function greetingFor(hour: number): string {
  if (hour < 5) return 'Still working'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

async function recentTimeline(since: number): Promise<any[]> {
  try {
    return await all<any>(
      'SELECT kind, title, detail, score, delta, created_at FROM intelligence_timeline WHERE created_at >= ? ORDER BY created_at DESC LIMIT 12',
      [since]
    )
  } catch {
    return []
  }
}

async function suggestedFocus(workspaceId: string | null | undefined, focusHint: string | null | undefined): Promise<string> {
  if (focusHint) return focusHint
  if (!workspaceId) return 'Open a workspace and let Fluxora review where to begin.'
  const intelligence = await getWorkspaceIntelligence(workspaceId)
  if (!intelligence) return 'Build workspace intelligence to get a sharper focus for today.'
  const health = intelligence.health as unknown as Record<string, { score?: number } | undefined>
  let lowest: { label: string; score: number } | null = null
  for (const dimension of HEALTH_LABELS) {
    const score = health[dimension.key]?.score
    if (typeof score !== 'number') continue
    if (!lowest || score < lowest.score) lowest = { label: dimension.label, score }
  }
  if (lowest && lowest.score < 75) return `Strengthen ${lowest.label} — currently the weakest area at ${lowest.score}.`
  return 'The workspace is in good shape. Continue the highest-priority recommendation.'
}

export async function getSessionBriefing(
  workspaceId?: string | null,
  focusHint?: string | null
): Promise<SessionBriefing> {
  const lastSession = await getLastSession()
  const now = Date.now()
  const since = lastSession?.endedAt ?? now - 24 * 60 * 60 * 1000

  const [accepted, chats, aiRequests, switches, timeline] = await Promise.all([
    countEvents('recommendation_accepted', since),
    countEvents('chat_created', since),
    countEvents('ai_request', since),
    countEvents('workspace_switched', since),
    recentTimeline(since),
  ])

  const lines: string[] = []
  if (accepted > 0) lines.push(`${accepted} recommendation${accepted === 1 ? '' : 's'} accepted`)
  if (chats > 0) lines.push(`${chats} chat${chats === 1 ? '' : 's'} created`)
  if (aiRequests > 0) lines.push(`${aiRequests} AI request${aiRequests === 1 ? '' : 's'}`)
  if (switches > 1) lines.push(`${switches} workspace switches`)

  const healthEvents = timeline.filter((event) => event.kind === 'health')
  const healthDelta = healthEvents.reduce((sum, event) => sum + Number(event.delta || 0), 0)
  if (healthDelta !== 0) {
    lines.push(`Workspace health ${healthDelta > 0 ? 'improved' : 'declined'} ${Math.abs(Math.round(healthDelta))} points`)
  }
  const docDelta = timeline
    .filter((event) => event.kind === 'documentation')
    .reduce((sum, event) => sum + Number(event.delta || 0), 0)
  if (docDelta > 0) lines.push(`Documentation increased ${Math.round(docDelta)} points`)
  if (timeline.some((event) => event.kind === 'dependencies')) lines.push('Dependencies changed')

  if (lines.length === 0) lines.push('A quiet session since you were last here.')

  const focus = await suggestedFocus(workspaceId, focusHint)
  const sinceLabel = lastSession
    ? 'Since your last session'
    : accepted + chats + aiRequests > 0
      ? 'Since yesterday'
      : 'Welcome to Fluxora'

  return {
    greeting: greetingFor(new Date().getHours()),
    sinceLabel,
    lines: lines.slice(0, 5),
    focus,
    lastSession,
    generatedAt: now,
  }
}

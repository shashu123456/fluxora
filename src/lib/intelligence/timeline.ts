import type { TimelineEvent, TimelineEventKind, WorkspaceIntelligence } from '../../types/workspaceIntelligence'
import { slugify } from './evolution'

/**
 * Intelligence Timeline.
 *
 * Diffs two Workspace Intelligence snapshots into the events that describe how
 * a project evolved. Pure function: the persistence layer only stores them.
 */

function event(
  workspaceId: string,
  kind: TimelineEventKind,
  title: string,
  detail: string,
  extra?: { score?: number; delta?: number }
): TimelineEvent {
  return {
    id: `tl:${workspaceId}:${kind}:${slugify(title)}:${extra?.delta ?? extra?.score ?? ''}`,
    workspaceId,
    kind,
    title,
    detail,
    score: extra?.score,
    delta: extra?.delta,
    createdAt: Date.now(),
  }
}

function countRisks(intel: WorkspaceIntelligence): number {
  const risks = intel.risks
  return Object.values(risks).filter((r) => r.score < 70).length
}

function countDependencies(intel: WorkspaceIntelligence): number {
  return Object.values(intel.profile.dependencies || {}).reduce(
    (n, map) => n + Object.keys(map || {}).length,
    0
  )
}

export function diffIntelligence(
  workspaceId: string,
  previous: WorkspaceIntelligence | null,
  next: WorkspaceIntelligence
): TimelineEvent[] {
  const events: TimelineEvent[] = []

  if (!previous) {
    events.push(
      event(workspaceId, 'indexed', 'Workspace indexed', next.contextSummary, {
        score: next.health.overallWorkspaceHealth.score,
      })
    )
    return events
  }

  const healthDelta =
    next.health.overallWorkspaceHealth.score - previous.health.overallWorkspaceHealth.score
  if (healthDelta !== 0) {
    events.push(
      event(
        workspaceId,
        'health',
        `Health score ${healthDelta > 0 ? 'improved' : 'declined'} by ${Math.abs(healthDelta)} points`,
        `Overall workspace health moved from ${previous.health.overallWorkspaceHealth.score}% to ${next.health.overallWorkspaceHealth.score}%.`,
        { score: next.health.overallWorkspaceHealth.score, delta: healthDelta }
      )
    )
  }

  const docDelta = next.health.documentationScore.score - previous.health.documentationScore.score
  if (docDelta !== 0) {
    events.push(
      event(
        workspaceId,
        'documentation',
        `Documentation ${docDelta > 0 ? 'increased' : 'decreased'} by ${Math.abs(docDelta)} points`,
        next.health.documentationScore.reasons.map((r) => r.reason).join('; ') || 'Documentation signals changed.',
        { score: next.health.documentationScore.score, delta: docDelta }
      )
    )
  }

  if (previous.architectureSummary !== next.architectureSummary) {
    events.push(
      event(
        workspaceId,
        'architecture',
        'Architecture pattern changed',
        `${previous.architectureSummary} → ${next.architectureSummary}.`,
        { score: next.health.architectureScore.score }
      )
    )
  }

  const prevRisks = countRisks(previous)
  const nextRisks = countRisks(next)
  if (prevRisks !== nextRisks) {
    events.push(
      event(
        workspaceId,
        'risk',
        nextRisks < prevRisks
          ? `Risk exposure decreased by ${prevRisks - nextRisks}`
          : `Risk exposure increased by ${nextRisks - prevRisks}`,
        `${prevRisks} → ${nextRisks} risk dimensions below target.`,
        { score: nextRisks, delta: nextRisks - prevRisks }
      )
    )
  }

  const prevDeps = countDependencies(previous)
  const nextDeps = countDependencies(next)
  if (prevDeps !== nextDeps) {
    events.push(
      event(
        workspaceId,
        'dependencies',
        `Dependencies ${nextDeps > prevDeps ? 'added' : 'removed'}`,
        `${prevDeps} → ${nextDeps} dependencies tracked.`,
        { score: nextDeps, delta: nextDeps - prevDeps }
      )
    )
  }

  if (
    previous.repository.branchStatus !== next.repository.branchStatus ||
    previous.repository.dirtyState !== next.repository.dirtyState
  ) {
    events.push(
      event(
        workspaceId,
        'repository',
        'Repository state changed',
        `Branch ${previous.repository.branchStatus} → ${next.repository.branchStatus}; working tree ${
          next.repository.dirtyState ? 'dirty' : 'clean'
        }.`
      )
    )
  }

  return events
}

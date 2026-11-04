import type { EvolutionStep, WorkspaceIntelligence } from '../../types/workspaceIntelligence'
import { buildRecommendations } from './recommendations'

/**
 * Brain Evolution.
 *
 * Turns a Workspace Intelligence snapshot into the reasoning chain the Project
 * Brain stores: Observation → Reasoning → Insight → Recommendation → Learning.
 * Pure function so it can be tested without a database.
 */

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function weakestDimension(intel: WorkspaceIntelligence): { name: string; score: number; why: string } {
  const dimensions: { name: string; score: number; why: string }[] = [
    { name: 'documentation', score: intel.health.documentationScore.score, why: intel.health.documentationScore.reasons.map((r) => r.reason).join('; ') },
    { name: 'security', score: intel.health.securityScore.score, why: intel.health.securityScore.reasons.map((r) => r.reason).join('; ') },
    { name: 'dependency health', score: intel.health.dependencyHealth.score, why: intel.health.dependencyHealth.reasons.map((r) => r.reason).join('; ') },
    { name: 'architecture', score: intel.health.architectureScore.score, why: intel.health.architectureScore.reasons.map((r) => r.reason).join('; ') },
    { name: 'code organization', score: intel.health.codeOrganizationScore.score, why: intel.health.codeOrganizationScore.reasons.map((r) => r.reason).join('; ') },
    { name: 'maintainability', score: intel.health.maintainabilityScore.score, why: intel.health.maintainabilityScore.reasons.map((r) => r.reason).join('; ') },
    { name: 'performance', score: intel.health.performanceScore.score, why: intel.health.performanceScore.reasons.map((r) => r.reason).join('; ') },
    { name: 'AI readiness', score: intel.health.aiReadinessScore.score, why: intel.health.aiReadinessScore.reasons.map((r) => r.reason).join('; ') },
  ]
  dimensions.sort((a, b) => a.score - b.score)
  return dimensions[0]
}

export function buildEvolutionChain(
  intel: WorkspaceIntelligence,
  previous: WorkspaceIntelligence | null
): EvolutionStep[] {
  const health = intel.health.overallWorkspaceHealth.score
  const weakest = weakestDimension(intel)
  const recommendations = buildRecommendations(intel)
  const top = recommendations[0]

  const observationBits = [
    `overall health ${health}%`,
    `${weakest.name} lowest at ${weakest.score}%`,
    `${intel.complexity.complexity} complexity, ${intel.complexity.estimatedProjectSize} size`,
    intel.repository.dirtyState
      ? `branch ${intel.repository.branchStatus} with uncommitted changes`
      : `branch ${intel.repository.branchStatus} clean`,
  ]

  const reasoningBits = [
    `Weakest dimension: ${weakest.name} — ${weakest.why || 'no signal recorded'}.`,
  ]
  if (previous) {
    const delta = health - previous.health.overallWorkspaceHealth.score
    if (delta !== 0) {
      reasoningBits.push(
        `Health moved ${delta > 0 ? '+' : ''}${delta} points since the last snapshot (${previous.health.overallWorkspaceHealth.score} → ${health}).`
      )
    } else {
      reasoningBits.push('Health is unchanged since the last snapshot, so the workspace is holding steady.')
    }
  } else {
    reasoningBits.push('First snapshot for this workspace — every reading is a baseline.')
  }
  if (intel.complexity.technicalDebtIndicators.length) {
    reasoningBits.push(`Debt markers: ${intel.complexity.technicalDebtIndicators.slice(0, 3).join('; ')}.`)
  }

  const insightBits = [
    `${intel.profile.projectName} is a ${intel.architectureSummary.toLowerCase()} at ${intel.insights.currentDevelopmentStage.toLowerCase()} stage.`,
    weakest.score < 60
      ? `The limiting factor is ${weakest.name}, not the stack — the code is structured, the context is not.`
      : `The workspace is balanced; the remaining leverage is in ${weakest.name}.`,
  ]

  const recommendationBits = top
    ? [`${top.title} — ${top.why}`]
    : ['No action required — every measured dimension is above target.']

  const learningBits = [
    intel.insights.strengths.length
      ? `This codebase's durable strength is ${intel.insights.strengths[0].toLowerCase()}.`
      : 'This codebase has no confirmed strength yet — that is the first thing to establish.',
    `Its recurring constraint is ${weakest.name}, so every future plan should budget for it first.`,
  ]

  return [
    { stage: 'observation', title: 'Observation', content: observationBits.join('. ') + '.' },
    { stage: 'reasoning', title: 'Reasoning', content: reasoningBits.join(' ') },
    { stage: 'insight', title: 'Insight', content: insightBits.join(' ') },
    { stage: 'recommendation', title: 'Recommendation', content: recommendationBits.join(' ') },
    { stage: 'learning', title: 'Learning', content: learningBits.join(' ') },
  ]
}

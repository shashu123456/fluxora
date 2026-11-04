import type {
  Recommendation,
  RecommendationCategory,
  ScoredMetric,
  WorkspaceIntelligence,
} from '../../types/workspaceIntelligence'
import type { RecommendationAffinity } from '../../types/developer'

/**
 * The Recommendation Engine.
 *
 * Every recommendation is derived from Workspace Intelligence — it never
 * re-analyses the workspace and never hardcodes a verdict. Each one explains
 * the evidence that produced it so the reasoning stays auditable.
 */

const TARGET = 80

function reasonText(metric: ScoredMetric, limit = 3): string {
  const negatives = metric.reasons.filter((r) => r.impact === 'negative')
  const positives = metric.reasons.filter((r) => r.impact === 'positive')
  const parts = [...negatives, ...positives].slice(0, limit).map((r) => r.reason)
  return parts.length ? parts.join('; ') : 'no contradicting evidence found'
}

function priorityFor(score: number): 'high' | 'medium' | 'low' {
  if (score < 50) return 'high'
  if (score < TARGET) return 'medium'
  return 'low'
}

function severityFor(score: number): 'info' | 'warning' | 'critical' {
  if (score < 45) return 'critical'
  if (score < TARGET) return 'warning'
  return 'info'
}

function make(
  id: string,
  category: RecommendationCategory,
  title: string,
  detail: string,
  metric: ScoredMetric,
  metricName: string
): Recommendation {
  const gap = Math.max(0, TARGET - metric.score)
  return {
    id,
    category,
    title,
    detail,
    why: `${metricName} scored ${metric.score}/100 — ${reasonText(metric)}.`,
    priority: priorityFor(metric.score),
    metric: metricName,
    impact: gap,
    severity: severityFor(metric.score),
  }
}

/**
 * Builds the ranked recommendation list for a workspace.
 * Pure function: the same intelligence always produces the same output.
 * When learned affinity is supplied, categories the developer accepts rank
 * slightly higher and frequently ignored categories rank slightly lower.
 */
export function buildRecommendations(
  intel: WorkspaceIntelligence,
  affinity?: RecommendationAffinity
): Recommendation[] {
  const out: Recommendation[] = []
  const { health, complexity, profile, repository } = intel

  if (health.documentationScore.score < TARGET) {
    out.push(
      make(
        'rec:documentation',
        'documentation',
        'Improve documentation',
        'Add a README section, an architecture note and a contribution guide for the weakest dimensions.',
        health.documentationScore,
        'Documentation'
      )
    )
  }

  if (health.securityScore.score < TARGET) {
    out.push(
      make(
        'rec:security',
        'security',
        'Fix security risks',
        'Resolve the security findings raised by the risk engine before the next release.',
        health.securityScore,
        'Security'
      )
    )
  }

  if (health.dependencyHealth.score < TARGET || profile.packageManagers.length > 1) {
    out.push(
      make(
        'rec:dependencies',
        'dependencies',
        profile.packageManagers.length > 1
          ? 'Consolidate package managers'
          : 'Remove unused dependencies',
        profile.packageManagers.length > 1
          ? `Keep a single package manager so installs stay reproducible (${profile.packageManagers.join(', ')}).`
          : 'Drop dependencies that no longer earn their place in the build.',
        health.dependencyHealth,
        'Dependency health'
      )
    )
  }

  if ((complexity.largeFiles.length > 0 || complexity.complexity === 'high') && complexity.complexity !== 'low') {
    const files = complexity.largeFiles.length
      ? complexity.largeFiles.join(', ')
      : `${profile.projectName} carries high structural complexity`
    out.push({
      id: 'rec:large-files',
      category: 'code-quality',
      title: 'Split large files',
      detail: 'Break the largest modules into focused units that can be changed independently.',
      why: `Complexity is ${complexity.complexity} — ${files}.`,
      priority: complexity.complexity === 'high' ? 'high' : 'medium',
      metric: 'Complexity',
      impact: 20,
      severity: complexity.complexity === 'high' ? 'critical' : 'warning',
    })
  }

  if (health.architectureScore.score < TARGET) {
    out.push(
      make(
        'rec:architecture',
        'architecture',
        'Improve architecture',
        'Tighten module boundaries so the structure matches the documented pattern.',
        health.architectureScore,
        'Architecture'
      )
    )
  }

  if (complexity.technicalDebtIndicators.length > 0) {
    const debt = complexity.technicalDebtIndicators
    out.push({
      id: 'rec:technical-debt',
      category: 'maintenance',
      title: 'Reduce technical debt',
      detail: `Work through the detected debt markers: ${debt.slice(0, 3).join('; ')}.`,
      why: `${debt.length} technical debt indicator${debt.length === 1 ? '' : 's'} were derived from the workspace structure.`,
      priority: debt.length >= 3 ? 'high' : 'medium',
      metric: 'Technical debt',
      impact: 15,
      severity: debt.length >= 3 ? 'warning' : 'info',
    })
  }

  if (health.maintainabilityScore.score < TARGET) {
    out.push(
      make(
        'rec:maintainability',
        'maintenance',
        'Improve maintainability',
        'Reduce the churn between the codebase and the context an agent needs to work safely in it.',
        health.maintainabilityScore,
        'Maintainability'
      )
    )
  }

  if (health.performanceScore.score < TARGET) {
    out.push(
      make(
        'rec:performance',
        'performance',
        'Improve performance',
        'Address the performance signals raised by the indexer before the surface area grows.',
        health.performanceScore,
        'Performance'
      )
    )
  }

  if (health.aiReadinessScore.score < TARGET) {
    out.push(
      make(
        'rec:ai-readiness',
        'ai-readiness',
        'Improve AI readiness',
        'Give the agent more context: tests, entry points and a documented stack make every session cheaper.',
        health.aiReadinessScore,
        'AI readiness'
      )
    )
  }

  if (repository.dirtyState) {
    out.push({
      id: 'rec:commit',
      category: 'maintenance',
      title: 'Commit the working tree',
      detail: 'Checkpoint the current work so the intelligence history stays meaningful.',
      why: `Branch ${repository.branchStatus} has uncommitted changes.`,
      priority: 'medium',
      metric: 'Repository',
      impact: 10,
      severity: 'warning',
    })
  }

  return out.sort(
    (a, b) => rankWithAffinity(a, affinity) - rankWithAffinity(b, affinity) || b.impact - a.impact
  )
}

function affinityAdjustment(r: Recommendation, affinity?: RecommendationAffinity): number {
  if (!affinity) return 0
  const accepted = affinity.acceptedCategories[r.category] || 0
  const ignored = affinity.ignoredCategories[r.category] || 0
  return Math.min(ignored, 5) * 2 - Math.min(accepted, 5)
}

function rankWithAffinity(r: Recommendation, affinity?: RecommendationAffinity): number {
  return rankOf(r) * 10 + affinityAdjustment(r, affinity)
}

function rankOf(r: Recommendation): number {
  const priority = r.priority === 'high' ? 0 : r.priority === 'medium' ? 1 : 2
  const severity = r.severity === 'critical' ? 0 : r.severity === 'warning' ? 1 : 2
  return priority * 10 + severity
}

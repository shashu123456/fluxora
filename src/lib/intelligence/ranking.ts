import type { WorkspaceIntelligence } from '../../types/workspaceIntelligence'

/**
 * Intelligence-aware ranking.
 *
 * Search is not only keyword matching: a result is promoted when it belongs to
 * a healthy, active, architecturally relevant project. The scoring rules live
 * here — pure and shared — so every consumer ranks the same way.
 */

const RISK_TERMS = [
  'bug',
  'error',
  'fail',
  'failure',
  'risk',
  'security',
  'vulnerab',
  'debt',
  'perf',
  'performance',
  'slow',
  'test',
  'todo',
  'fix',
  'break',
  'issue',
]

const ARCHITECTURE_TERMS = [
  'architecture',
  'structure',
  'layout',
  'folder',
  'module',
  'pattern',
  'stack',
  'framework',
  'package',
  'dependency',
  'dependencies',
  'config',
]

export interface IntelligenceRankContext {
  intelligence: WorkspaceIntelligence | null
  brainEntries: number
  isActive: boolean
  tokens: string[]
}

function matches(tokens: string[], terms: string[]): boolean {
  return tokens.some((t) => terms.some((term) => t.startsWith(term) || term.startsWith(t)))
}

export function intelligenceBoost(ctx: IntelligenceRankContext): number {
  const { intelligence, brainEntries, isActive, tokens } = ctx
  let boost = 0

  if (isActive) boost += 0.06

  if (intelligence) {
    // Project health — well-understood projects are more likely to be the answer.
    const health = intelligence.health.overallWorkspaceHealth.score
    boost += ((health - 55) / 100) * 0.12

    // Architecture relevance — query terms that describe the stack itself.
    const architectureWords = [
      intelligence.architectureSummary,
      intelligence.profile.projectName,
      intelligence.profile.projectType,
      ...intelligence.profile.frameworks,
      ...intelligence.profile.languages.map((l) => l.lang),
    ].join(' ').toLowerCase()
    const architectureHit = tokens.some((t) => architectureWords.includes(t))
    if (architectureHit) boost += 0.08

    // Repository activity — active work is worth surfacing first.
    if (intelligence.repository.dirtyState) boost += 0.04
    if (intelligence.repository.gitActivity === 'active') boost += 0.02

    // Risk priority — risk-shaped queries surface the projects that need help.
    if (matches(tokens, RISK_TERMS)) {
      const risky = Object.values(intelligence.risks).filter((r) => r.score < 70).length
      if (risky > 0) boost += Math.min(0.1, 0.03 * risky)
    }

    // Architecture-shaped queries prefer projects with a known pattern.
    if (matches(tokens, ARCHITECTURE_TERMS) && intelligence.architectureSummary !== 'Unknown') {
      boost += 0.05
    }
  }

  // Brain importance — a project with recorded decisions carries more weight.
  if (brainEntries > 0) boost += Math.min(0.06, 0.015 * brainEntries)

  return boost
}

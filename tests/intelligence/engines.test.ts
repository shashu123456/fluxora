import { describe, it, expect } from 'vitest'
import type {
  ScoredMetric,
  WorkspaceIntelligence,
} from '../../src/types/workspaceIntelligence'
import { buildRecommendations } from '../../src/lib/intelligence/recommendations'
import { buildEvolutionChain } from '../../src/lib/intelligence/evolution'
import { diffIntelligence } from '../../src/lib/intelligence/timeline'
import { intelligenceBoost } from '../../src/lib/intelligence/ranking'

function metric(score: number, reason = 'evidence'): ScoredMetric {
  return { score, reasons: [{ reason, impact: score >= 70 ? 'positive' : 'negative' }] }
}

function makeIntelligence(overrides: {
  health?: number
  documentation?: number
  security?: number
  complexity?: 'low' | 'medium' | 'high'
  dirty?: boolean
  packageManagers?: string[]
} = {}): WorkspaceIntelligence {
  const health = overrides.health ?? 72
  const documentation = overrides.documentation ?? 45
  const security = overrides.security ?? 88
  return {
    workspaceId: 'ws_test',
    generatedAt: 1_700_000_000_000,
    profile: {
      projectName: 'fluxora',
      projectType: 'desktop app',
      category: 'developer tool',
      primaryPurpose: 'local AI workspace',
      languages: [{ lang: 'TypeScript', count: 120 }],
      frameworks: ['React', 'Electron'],
      runtime: ['Node'],
      buildSystem: ['Vite'],
      packageManagers: overrides.packageManagers ?? ['npm'],
      gitStatus: { isRepo: true, branch: 'main', hasChanges: overrides.dirty ?? false },
      dependencies: { npm: { react: '^18.2.0', electron: '^28.0.0' } },
      configFiles: [{ name: 'vite.config.ts', path: 'vite.config.ts' }],
      architecturePattern: 'layered',
      folderStructureSummary: ['src', 'electron', 'tests'],
    },
    health: {
      documentationScore: metric(documentation, 'no README sections'),
      aiReadinessScore: metric(70),
      architectureScore: metric(74),
      codeOrganizationScore: metric(76),
      dependencyHealth: metric(65, 'outdated packages'),
      securityScore: metric(security, 'no secrets detected'),
      maintainabilityScore: metric(71),
      performanceScore: metric(68),
      overallWorkspaceHealth: metric(health, 'composite of eight dimensions'),
    },
    complexity: {
      estimatedProjectSize: 'medium',
      complexity: overrides.complexity ?? 'medium',
      technicalDebtIndicators: [],
      largeFiles: [],
      duplicatePatterns: [],
      deadCodeIndicators: [],
      missingDocumentation: ['CHANGELOG'],
      missingConfiguration: [],
    },
    insights: {
      currentDevelopmentStage: 'active development',
      confidenceLevel: 'high',
      recommendedNextSteps: [],
      potentialRisks: [],
      suggestedImprovements: [],
      strengths: ['clear module layout'],
      weaknesses: ['documentation'],
    },
    repository: {
      gitActivity: 'active',
      commitFrequency: 'high',
      branchStatus: 'main',
      dirtyState: overrides.dirty ?? false,
      recentlyModifiedAreas: ['src/components'],
    },
    risks: {
      securityRisk: metric(85),
      dependencyRisk: metric(35, 'unpinned transitive dependency'),
      maintenanceRisk: metric(60),
      architectureRisk: metric(72),
      documentationRisk: metric(40, 'no architecture note'),
      configurationRisk: metric(80),
      performanceRisk: metric(70),
    },
    contextSummary: 'Fluxora is a local AI workspace.',
    architectureSummary: 'Layered React and Electron application.',
    intelligenceVersion: 1,
  }
}

describe('intelligence recommendations', () => {
  it('explains every recommendation with a reason', () => {
    const recs = buildRecommendations(makeIntelligence())
    expect(recs.length).toBeGreaterThan(0)
    for (const rec of recs) {
      expect(rec.why.trim().length).toBeGreaterThan(0)
      expect(rec.id.startsWith('rec:')).toBe(true)
    }
  })

  it('is deterministic for the same intelligence', () => {
    const intel = makeIntelligence()
    expect(buildRecommendations(intel)).toEqual(buildRecommendations(intel))
  })

  it('drops recommendations once dimensions are healthy', () => {
    const healthy = makeIntelligence({ health: 95, documentation: 95, security: 95, complexity: 'low' })
    healthy.health.dependencyHealth = metric(95)
    const recs = buildRecommendations(healthy)
    expect(recs.find((r) => r.id === 'rec:documentation')).toBeUndefined()
    expect(recs.find((r) => r.id === 'rec:security')).toBeUndefined()
  })

  it('prioritises the weakest dimension first', () => {
    const recs = buildRecommendations(makeIntelligence({ documentation: 20 }))
    expect(recs[0].id).toBe('rec:documentation')
    expect(recs[0].priority).toBe('high')
  })
})

describe('intelligence evolution', () => {
  it('produces the full observation to learning chain', () => {
    const chain = buildEvolutionChain(makeIntelligence(), null)
    expect(chain.map((step) => step.stage)).toEqual([
      'observation',
      'reasoning',
      'insight',
      'recommendation',
      'learning',
    ])
    for (const step of chain) expect(step.content.trim().length).toBeGreaterThan(0)
  })

  it('names the weakest dimension in reasoning', () => {
    const chain = buildEvolutionChain(makeIntelligence({ documentation: 10 }), null)
    const reasoning = chain.find((step) => step.stage === 'reasoning')
    expect(reasoning?.content.toLowerCase()).toContain('documentation')
  })

  it('describes the health delta against the previous snapshot', () => {
    const previous = makeIntelligence({ health: 60 })
    const next = makeIntelligence({ health: 75 })
    const chain = buildEvolutionChain(next, previous)
    const reasoning = chain.find((step) => step.stage === 'reasoning')
    expect(reasoning?.content).toContain('+15')
  })
})

describe('intelligence timeline diff', () => {
  it('records a first-snapshot index event', () => {
    const events = diffIntelligence('ws_test', null, makeIntelligence())
    expect(events).toHaveLength(1)
    expect(events[0].kind).toBe('indexed')
    expect(events[0].workspaceId).toBe('ws_test')
  })

  it('detects health, documentation and risk movement', () => {
    const previous = makeIntelligence({ health: 60, documentation: 30 })
    const next = makeIntelligence({ health: 75, documentation: 55 })
    next.risks.maintenanceRisk = metric(88)
    next.risks.documentationRisk = metric(90)
    const events = diffIntelligence('ws_test', previous, next)
    const kinds = events.map((e) => e.kind)
    expect(kinds).toContain('health')
    expect(kinds).toContain('documentation')
    expect(kinds).toContain('risk')
    const health = events.find((e) => e.kind === 'health')
    expect(health?.delta).toBe(15)
  })

  it('returns no events when nothing changed', () => {
    const intel = makeIntelligence()
    expect(diffIntelligence('ws_test', intel, intel)).toHaveLength(0)
  })

  it('uses stable ids for the same change', () => {
    const previous = makeIntelligence({ health: 60 })
    const next = makeIntelligence({ health: 75 })
    const a = diffIntelligence('ws_test', previous, next)
    const b = diffIntelligence('ws_test', previous, next)
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id))
  })
})

describe('intelligence ranking', () => {
  it('boosts the active workspace', () => {
    const base = intelligenceBoost({
      intelligence: null,
      brainEntries: 0,
      isActive: false,
      tokens: ['search'],
    })
    const active = intelligenceBoost({
      intelligence: null,
      brainEntries: 0,
      isActive: true,
      tokens: ['search'],
    })
    expect(active).toBeGreaterThan(base)
  })

  it('boosts risk-shaped queries for risky workspaces', () => {
    const intel = makeIntelligence()
    const risk = intelligenceBoost({ intelligence: intel, brainEntries: 0, isActive: false, tokens: ['security'] })
    const neutral = intelligenceBoost({ intelligence: intel, brainEntries: 0, isActive: false, tokens: ['holiday'] })
    expect(risk).toBeGreaterThan(neutral)
  })

  it('boosts architecture-shaped queries when the pattern is known', () => {
    const intel = makeIntelligence()
    const architecture = intelligenceBoost({
      intelligence: intel,
      brainEntries: 0,
      isActive: false,
      tokens: ['architecture'],
    })
    const neutral = intelligenceBoost({ intelligence: intel, brainEntries: 0, isActive: false, tokens: ['holiday'] })
    expect(architecture).toBeGreaterThan(neutral)
  })

  it('weights brain entries but caps the contribution', () => {
    const intel = makeIntelligence()
    const few = intelligenceBoost({ intelligence: intel, brainEntries: 1, isActive: false, tokens: ['search'] })
    const many = intelligenceBoost({ intelligence: intel, brainEntries: 50, isActive: false, tokens: ['search'] })
    expect(many).toBeGreaterThan(few)
    expect(many - few).toBeLessThanOrEqual(0.045)
  })
})

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { WorkspaceIndex } from '../../src/types'
import { analyzeProfile } from '../../electron/services/intelligence/profileAnalyzer'
import { analyzeHealth } from '../../electron/services/intelligence/healthAnalyzer'
import { analyzeComplexity } from '../../electron/services/intelligence/complexityAnalyzer'
import { analyzeInsights, analyzeRepository } from '../../electron/services/intelligence/repoAnalyzer'
import { analyzeRisks } from '../../electron/services/intelligence/riskEngine'
import { generateContextSummary, generateArchitectureSummary } from '../../electron/services/intelligence/summaryGenerator'

function makeIndex(overrides: Partial<WorkspaceIndex> = {}): WorkspaceIndex {
  return {
    languages: [{ lang: 'TypeScript', count: 120 }],
    fileCount: 240,
    dirCount: 18,
    totalSize: 2_400_000,
    git: { isRepo: true, branch: 'main', hasChanges: false, lastCommit: 'abc1234 feat: ship' },
    packageManagers: ['npm'],
    frameworks: ['React', 'Vite'],
    configFiles: [
      { name: 'package.json', path: 'package.json' },
      { name: 'tsconfig.json', path: 'tsconfig.json' },
    ],
    dependencies: { npm: { react: '18.2.0', vite: '5.0.0' } },
    readme: 'README.md',
    readmeSnippet: 'A small project.',
    topStructure: ['📁 src/ (12)', '📄 package.json'],
    recentFiles: [{ path: 'src/main.tsx', modifiedAt: Date.now() }],
    entryPoints: ['src/main.tsx'],
    docs: ['docs/intro.md'],
    testDirs: ['tests'],
    health: { score: 82, signals: [{ key: 'readme', label: 'README', ok: true, weight: 2 }] },
    indexedAt: 1_700_000_000_000,
    durationMs: 120,
    ...overrides,
  }
}

function tempRoot(pkg?: Record<string, unknown>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fluxora-intel-'))
  if (pkg) fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg))
  return dir
}

describe('profile analyzer', () => {
  it('reads the project name from package.json', () => {
    const root = tempRoot({ name: 'my-app' })
    const profile = analyzeProfile(makeIndex(), root)
    expect(profile.projectName).toBe('my-app')
  })

  it('falls back to the directory name when package.json is absent', () => {
    const root = tempRoot()
    const profile = analyzeProfile(makeIndex(), root)
    expect(profile.projectName).toBe(path.basename(root))
  })

  it('infers a React + Vite SPA architecture', () => {
    const profile = analyzeProfile(makeIndex(), tempRoot())
    expect(profile.architecturePattern).toBe('React + Vite SPA')
    expect(profile.buildSystem).toContain('Vite')
  })

  it('infers an Electron desktop application', () => {
    const profile = analyzeProfile(makeIndex({ frameworks: ['Electron', 'React'] }), tempRoot())
    expect(profile.architecturePattern).toBe('Electron Desktop Application')
    expect(profile.projectType).toBe('Desktop App')
  })

  it('infers an Express REST API', () => {
    const profile = analyzeProfile(makeIndex({ frameworks: ['Express'] }), tempRoot())
    expect(profile.architecturePattern).toBe('Express REST API')
  })
})

describe('health analyzer', () => {
  it('explains every score', () => {
    const health = analyzeHealth(makeIndex(), tempRoot())
    const metrics = [
      health.documentationScore,
      health.aiReadinessScore,
      health.architectureScore,
      health.codeOrganizationScore,
      health.dependencyHealth,
      health.securityScore,
      health.maintainabilityScore,
      health.performanceScore,
      health.overallWorkspaceHealth,
    ]
    for (const metric of metrics) {
      expect(metric.reasons.length).toBeGreaterThan(0)
      expect(metric.score).toBeGreaterThanOrEqual(0)
      expect(metric.score).toBeLessThanOrEqual(100)
    }
  })

  it('scores documentation higher with a README and docs', () => {
    const withDocs = analyzeHealth(makeIndex(), tempRoot())
    const withoutDocs = analyzeHealth(makeIndex({ readme: undefined, docs: [] }), tempRoot())
    expect(withDocs.documentationScore.score).toBeGreaterThan(withoutDocs.documentationScore.score)
    expect(withoutDocs.documentationScore.reasons.some((r) => r.impact === 'negative')).toBe(true)
  })

  it('penalises security when an env file exists without a template', () => {
    const index = makeIndex({
      configFiles: [{ name: '.env', path: '.env' }],
    })
    const health = analyzeHealth(index, tempRoot())
    expect(health.securityScore.score).toBeLessThan(50)
    expect(health.securityScore.reasons.some((r) => r.reason.includes('env'))).toBe(true)
  })

  it('penalises dependency health with multiple package managers', () => {
    const single = analyzeHealth(makeIndex(), tempRoot())
    const multi = analyzeHealth(makeIndex({ packageManagers: ['npm', 'pnpm'] }), tempRoot())
    expect(multi.dependencyHealth.score).toBeLessThan(single.dependencyHealth.score)
  })
})

describe('complexity analyzer', () => {
  it('classifies project size from total bytes', () => {
    expect(analyzeComplexity(makeIndex({ totalSize: 1_000 })).estimatedProjectSize).toBe('small')
    expect(analyzeComplexity(makeIndex({ totalSize: 20_000_000 })).estimatedProjectSize).toBe('medium')
    expect(analyzeComplexity(makeIndex({ totalSize: 90_000_000 })).estimatedProjectSize).toBe('large')
  })

  it('raises complexity for large codebases', () => {
    expect(analyzeComplexity(makeIndex()).complexity).toBe('low')
    expect(analyzeComplexity(makeIndex({ fileCount: 4000 })).complexity).toBe('high')
  })

  it('records missing documentation and technical debt', () => {
    const complexity = analyzeComplexity(makeIndex({ readme: undefined, testDirs: [] }))
    expect(complexity.missingDocumentation).toContain('README missing')
    expect(complexity.technicalDebtIndicators).toContain('Missing README')
  })
})

describe('development insights', () => {
  it('lists strengths and weaknesses from evidence', () => {
    const insights = analyzeInsights(makeIndex())
    expect(insights.strengths).toContain('Clear project documentation')
    expect(insights.confidenceLevel).toBe('high')
    expect(insights.currentDevelopmentStage).toBe('Active Development')
  })

  it('flags an uncommitted working tree as a risk', () => {
    const insights = analyzeInsights(makeIndex({ git: { isRepo: true, branch: 'main', hasChanges: true } }))
    expect(insights.potentialRisks).toContain('Uncommitted changes')
  })
})

describe('repository intelligence', () => {
  it('reports branch, dirty state and recently modified areas', () => {
    const repo = analyzeRepository(makeIndex({ git: { isRepo: true, branch: 'feat/x', hasChanges: true } }))
    expect(repo.branchStatus).toBe('feat/x')
    expect(repo.dirtyState).toBe(true)
    expect(repo.gitActivity).toBe('active')
    expect(repo.recentlyModifiedAreas.length).toBeGreaterThan(0)
  })

  it('reports no activity outside a repository', () => {
    const repo = analyzeRepository(makeIndex({ git: { isRepo: false } }))
    expect(repo.gitActivity).toBe('none')
  })
})

describe('risk engine', () => {
  it('scores every risk category with reasons', () => {
    const risks = analyzeRisks(makeIndex())
    const all = Object.values(risks)
    expect(all.length).toBe(7)
    for (const risk of all) {
      expect(risk.reasons.length).toBeGreaterThan(0)
      expect(risk.score).toBeGreaterThanOrEqual(0)
      expect(risk.score).toBeLessThanOrEqual(100)
    }
  })

  it('raises documentation risk without a README', () => {
    const withReadme = analyzeRisks(makeIndex())
    const withoutReadme = analyzeRisks(makeIndex({ readme: undefined, docs: [] }))
    expect(withoutReadme.documentationRisk.score).toBeLessThan(withReadme.documentationRisk.score)
  })

  it('raises dependency risk with multiple package managers', () => {
    const multi = analyzeRisks(makeIndex({ packageManagers: ['npm', 'yarn'] }))
    expect(multi.dependencyRisk.score).toBeLessThan(70)
    expect(multi.dependencyRisk.reasons.some((r) => r.impact === 'negative')).toBe(true)
  })
})

describe('summary generation', () => {
  it('produces a single human-readable context paragraph', () => {
    const profile = analyzeProfile(makeIndex(), tempRoot())
    const health = analyzeHealth(makeIndex(), tempRoot())
    const complexity = analyzeComplexity(makeIndex())
    const summary = generateContextSummary(profile, health, complexity)
    expect(summary.length).toBeGreaterThan(40)
    expect(summary).toContain('React + Vite SPA')
  })

  it('derives the architecture summary from the profile', () => {
    const profile = analyzeProfile(makeIndex({ frameworks: ['Electron'] }), tempRoot())
    expect(generateArchitectureSummary(profile)).toBe('Electron Desktop Application')
  })
})

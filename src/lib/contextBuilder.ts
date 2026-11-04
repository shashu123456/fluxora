import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useIntelligenceStore } from '@/stores/intelligenceStore'
import type { BrainInsights, ProjectBrainEntry, WorkspaceIndex } from '@/types'
import type { WorkspaceIntelligence } from '@/types/workspaceIntelligence'

export interface SmartContextOptions {
  prompt: string
  workspaceId: string
  memoryEnabled: boolean
  maxChars?: number
}

export interface SmartContext {
  system: string | null
  memoryCount: number
  promptCount: number
  brainCount: number
  insightCount: number
  decisionCount: number
  truncated: boolean
  budgetChars: number
  usedChars: number
}

const CONTENT_CAP = 12000
const MEMORY_ITEM_CAP = 220
const PROMPT_ITEM_CAP = 200
const BRAIN_ITEM_CAP = 260
const README_CAP = 280
const PROJECT_CAP = 2600
const MEMORY_CAP = 1600
const INSTRUCTIONS_CAP = 800
const BRAIN_CAP = 3200
const INSIGHTS_CAP = 1200
const DEVELOPER_CAP = 700

const SYSTEM_HEADER =
  'Below is context about the user and their project. Use it to answer accurately when relevant, but do not mention it explicitly.'

/**
 * Auto brain sections are identified by the tag they carry, not by their kind —
 * `stack` and `goals` are stored as kind `architecture` / `todo` respectively.
 */
const AUTO_BRAIN_TAGS = ['architecture', 'stack', 'dependencies', 'decisions', 'conventions', 'goals']

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'has', 'was', 'were', 'are', 'you',
  'your', 'our', 'can', 'could', 'would', 'should', 'please', 'about', 'into', 'what', 'when',
  'where', 'which', 'how', 'why', 'not', 'but', 'all', 'any', 'how', 'its', 'it', 'is', 'be',
  'do', 'does', 'did', 'to', 'of', 'in', 'on', 'at', 'as', 'by', 'or', 'an', 'a', 'i', 'we',
  'me', 'my', 'make', 'need', 'want', 'add', 'use', 'using', 'there', 'then', 'than', 'also',
])

function tokenize(text: string): string[] {
  const seen = new Set<string>()
  const tokens: string[] = []
  for (const raw of (text || '').toLowerCase().split(/[^a-z0-9_$.-]+/)) {
    const token = raw.replace(/^[.-]+|[.-]+$/g, '')
    if (token.length < 3 || STOPWORDS.has(token) || seen.has(token)) continue
    seen.add(token)
    tokens.push(token)
  }
  return tokens.slice(0, 24)
}

/** Cheap lexical relevance: exact token hits in the title count double. */
function relevance(title: string, body: string, tokens: string[]): number {
  if (tokens.length === 0) return 0
  const titleText = (title || '').toLowerCase()
  const bodyText = (body || '').toLowerCase()
  let score = 0
  for (const token of tokens) {
    if (titleText.includes(token)) score += 2
    else if (bodyText.includes(token)) score += 1
  }
  return score
}

interface ScoredDimension {
  label: string
  score: number
  reason: string
  keywords: string[]
}

/**
 * Health dimensions and risk categories are surfaced only when the prompt
 * touches them; otherwise the weakest ones are shown. This keeps the injected
 * context short and relevant instead of dumping every metric.
 */
function healthDimensions(intel: WorkspaceIntelligence): ScoredDimension[] {
  const h = intel.health
  return [
    { label: 'Documentation', score: h.documentationScore.score, reason: h.documentationScore.reasons.map((r) => r.reason).join('; '), keywords: ['documentation', 'docs', 'readme', 'writing', 'guide'] },
    { label: 'AI readiness', score: h.aiReadinessScore.score, reason: h.aiReadinessScore.reasons.map((r) => r.reason).join('; '), keywords: ['ai', 'context', 'prompt', 'agent', 'readiness'] },
    { label: 'Architecture', score: h.architectureScore.score, reason: h.architectureScore.reasons.map((r) => r.reason).join('; '), keywords: ['architecture', 'design', 'structure'] },
    { label: 'Code organization', score: h.codeOrganizationScore.score, reason: h.codeOrganizationScore.reasons.map((r) => r.reason).join('; '), keywords: ['organization', 'organisation', 'layout', 'folder', 'structure'] },
    { label: 'Dependency health', score: h.dependencyHealth.score, reason: h.dependencyHealth.reasons.map((r) => r.reason).join('; '), keywords: ['dependency', 'dependencies', 'deps', 'package', 'packages'] },
    { label: 'Security', score: h.securityScore.score, reason: h.securityScore.reasons.map((r) => r.reason).join('; '), keywords: ['security', 'secret', 'env', 'auth', 'vulnerability'] },
    { label: 'Maintainability', score: h.maintainabilityScore.score, reason: h.maintainabilityScore.reasons.map((r) => r.reason).join('; '), keywords: ['maintainability', 'maintain', 'debt', 'cleanup', 'refactor'] },
    { label: 'Performance', score: h.performanceScore.score, reason: h.performanceScore.reasons.map((r) => r.reason).join('; '), keywords: ['performance', 'slow', 'speed', 'latency', 'bundle', 'memory'] },
  ]
}

function riskDimensions(intel: WorkspaceIntelligence): ScoredDimension[] {
  const r = intel.risks
  return [
    { label: 'Security', score: r.securityRisk.score, reason: r.securityRisk.reasons.map((x) => x.reason).join('; '), keywords: ['security', 'secret', 'env', 'auth', 'vulnerability'] },
    { label: 'Dependency', score: r.dependencyRisk.score, reason: r.dependencyRisk.reasons.map((x) => x.reason).join('; '), keywords: ['dependency', 'dependencies', 'deps', 'package', 'packages', 'upgrade'] },
    { label: 'Maintenance', score: r.maintenanceRisk.score, reason: r.maintenanceRisk.reasons.map((x) => x.reason).join('; '), keywords: ['maintainability', 'maintain', 'debt', 'cleanup', 'refactor'] },
    { label: 'Architecture', score: r.architectureRisk.score, reason: r.architectureRisk.reasons.map((x) => x.reason).join('; '), keywords: ['architecture', 'design', 'structure'] },
    { label: 'Documentation', score: r.documentationRisk.score, reason: r.documentationRisk.reasons.map((x) => x.reason).join('; '), keywords: ['documentation', 'docs', 'readme'] },
    { label: 'Configuration', score: r.configurationRisk.score, reason: r.configurationRisk.reasons.map((x) => x.reason).join('; '), keywords: ['config', 'configuration', 'ci', 'env', 'setup'] },
    { label: 'Performance', score: r.performanceRisk.score, reason: r.performanceRisk.reasons.map((x) => x.reason).join('; '), keywords: ['performance', 'slow', 'speed', 'latency', 'bundle'] },
  ]
}

function pickDimensions(items: ScoredDimension[], tokens: string[], fallback: number): ScoredDimension[] {
  const matched = items.filter((i) =>
    i.keywords.some((k) => tokens.some((t) => t.includes(k) || k.includes(t)))
  )
  if (matched.length) return matched.slice(0, 3)
  return [...items].sort((a, b) => a.score - b.score).slice(0, fallback)
}

function relTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function shortPath(p: string): string {
  const idx = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
  return idx >= 0 ? p.slice(idx + 1) : p
}

function isWorkspaceScope(workspaceId?: string | null): workspaceId is string {
  return !!workspaceId && workspaceId !== 'global'
}

function trimTo(text: string, cap: number): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim()
  return clean.length > cap ? `${clean.slice(0, cap).trimEnd()}…` : clean
}

export async function buildSmartContext(opts: SmartContextOptions): Promise<SmartContext> {
  const maxChars = opts.maxChars || CONTENT_CAP
  const tokens = tokenize(opts.prompt)
  const sections: string[] = []
  let memoryCount = 0
  let promptCount = 0
  let brainCount = 0
  let insightCount = 0
  let decisionCount = 0
  let truncated = false

  let budget = Math.max(0, maxChars - SYSTEM_HEADER.length - 2)
  const hardCaps = {
    memory: Math.min(MEMORY_CAP, Math.round(maxChars * 0.15)),
    project: Math.min(PROJECT_CAP, Math.round(maxChars * 0.26)),
    instructions: Math.min(INSTRUCTIONS_CAP, Math.round(maxChars * 0.08)),
    brain: Math.min(BRAIN_CAP, Math.round(maxChars * 0.3)),
    insights: Math.min(INSIGHTS_CAP, Math.round(maxChars * 0.11)),
  }

  const pushSection = (label: string, body: string, cap: number) => {
    const trimmedBody = body.trim()
    if (!trimmedBody) return
    const prefix = `[${label}]\n`
    const overhead = prefix.length
    const available = Math.min(cap, budget - overhead)
    if (available <= 0) {
      truncated = true
      return
    }
    let content = trimmedBody
    if (content.length > available) {
      content = content.slice(0, Math.max(0, available - 20)).trimEnd() + '\n…(truncated)'
      truncated = true
    }
    sections.push(`${prefix}${content}`)
    budget -= content.length + overhead
  }

  const workspaceScoped = isWorkspaceScope(opts.workspaceId)

  // 1. Memory — pinned items are always kept; the rest must match the prompt.
  if (opts.memoryEnabled) {
    try {
      const query = opts.prompt.slice(0, 240)
      const globalHits: any[] = await window.api.memory.search('global', query)
      const wsHits: any[] = workspaceScoped ? await window.api.memory.search(opts.workspaceId, query) : []
      const seen = new Set<string>()
      const merged: any[] = []
      for (const m of [...globalHits, ...wsHits]) {
        if (!m || !m.content || seen.has(m.id)) continue
        seen.add(m.id)
        merged.push(m)
      }
      const ranked = merged
        .map((m) => {
          const score = relevance('', m.content, tokens)
          return { m, score: score + (m.pinned ? 4 : 0) + (workspaceScoped && m.workspaceId === opts.workspaceId ? 1 : 0) }
        })
        .filter((x) => x.score > 0 || x.m.pinned)
        .sort((a, b) => b.score - a.score || (b.m.updatedAt || 0) - (a.m.updatedAt || 0))
        .slice(0, 6)
      if (ranked.length > 0) {
        memoryCount = ranked.length
        pushSection(
          'Relevant memory',
          ranked.map(({ m }) => `- ${trimTo(m.content, MEMORY_ITEM_CAP)}`).join('\n'),
          hardCaps.memory
        )
      }
    } catch { /* memory unavailable */ }
  }

  let index: WorkspaceIndex | null = null

  // 2. Workspace intelligence — the single source of truth for project analysis.
  if (workspaceScoped) {
    const wsStore = useWorkspaceStore.getState()
    try {
      index = wsStore.indexes[opts.workspaceId] || (await wsStore.getIndex(opts.workspaceId))
    } catch { /* index unavailable */ }

    let intel: WorkspaceIntelligence | null = null
    try {
      const intelStore = useIntelligenceStore.getState()
      if (!intelStore.intelligence[opts.workspaceId]) {
        await intelStore.load(opts.workspaceId)
      }
      intel = useIntelligenceStore.getState().intelligence[opts.workspaceId] || null
    } catch { /* intelligence unavailable */ }

    if (intel) {
      const lines: string[] = []
      lines.push(`Summary: ${trimTo(intel.contextSummary, 320)}`)
      lines.push(`Architecture: ${intel.architectureSummary}`)

      const stack = [
        intel.profile.frameworks.slice(0, 5).join(', '),
        intel.profile.languages.slice(0, 3).map((l) => l.lang).join(', '),
        intel.profile.runtime.slice(0, 2).join(', '),
      ].filter(Boolean).join(' · ')
      if (stack) lines.push(`Stack: ${stack}`)

      const dims = pickDimensions(healthDimensions(intel), tokens, 2)
      lines.push(`Health: ${intel.health.overallWorkspaceHealth.score}% (${dims.map((d) => `${d.label} ${d.score}`).join(', ')})`)

      const risks = pickDimensions(riskDimensions(intel), tokens, 2)
      if (risks.length) {
        lines.push(`Risks: ${risks.map((r) => `${r.label} ${r.score}`).join(', ')}`)
        const reasons = risks.map((r) => r.reason).filter(Boolean).slice(0, 2)
        if (reasons.length) lines.push(`Risk detail: ${reasons.join(' · ')}`)
      }

      if (intel.repository.branchStatus && intel.repository.branchStatus !== 'unknown') {
        lines.push(`Repo: ${intel.repository.branchStatus} · ${intel.repository.dirtyState ? 'uncommitted changes' : 'clean tree'}`)
      }
      lines.push(`Complexity: ${intel.complexity.complexity} (${intel.complexity.estimatedProjectSize})`)
      if (intel.complexity.missingDocumentation.length) {
        lines.push(`Missing docs: ${intel.complexity.missingDocumentation.slice(0, 3).join(', ')}`)
      }
      if (intel.profile.configFiles.length) {
        const configs = intel.profile.configFiles
          .filter((c) => tokens.length === 0 || tokens.some((t) => c.name.toLowerCase().includes(t)))
          .slice(0, 5)
          .map((c) => c.name)
        if (configs.length) lines.push(`Config: ${configs.join(', ')}`)
      }
      if (intel.profile.folderStructureSummary.length) {
        lines.push(`Structure: ${intel.profile.folderStructureSummary.slice(0, 7).join(' · ')}`)
      }

      pushSection('Project context', lines.join('\n'), hardCaps.project)

      const recs = useIntelligenceStore.getState().recommendations[opts.workspaceId] || []
      if (recs.length) {
        const ranked = [...recs]
          .map((r) => ({ r, score: relevance(r.title, `${r.detail} ${r.why}`, tokens) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 2)
        pushSection(
          'Recommended next steps',
          ranked.map(({ r }) => `- ${r.title} (${r.why})`).join('\n'),
          Math.min(700, hardCaps.project)
        )
      }
    } else if (index) {
      // Fallback for workspaces that have never been indexed.
      const lines: string[] = []
      if (index.frameworks?.length) lines.push(`Stack: ${index.frameworks.slice(0, 6).join(', ')}`)
      if (index.languages?.length) {
        lines.push(`Languages: ${index.languages.slice(0, 5).map((l) => `${l.lang} (${l.count})`).join(', ')}`)
      }
      if (index.packageManagers?.length) {
        const depCount = Object.entries(index.dependencies || {}).reduce((n, [, v]) => n + Object.keys(v).length, 0)
        lines.push(`Packages: ${index.packageManagers.join(', ')}${depCount ? ` · ${depCount} dependencies` : ''}`)
      }
      if (index.entryPoints?.length) lines.push(`Entry: ${index.entryPoints.slice(0, 4).join(', ')}`)
      if (index.git?.isRepo) {
        const gitBits: string[] = []
        if (index.git.branch) gitBits.push(index.git.branch)
        gitBits.push(index.git.hasChanges ? 'uncommitted changes' : 'clean tree')
        lines.push(`Git: ${gitBits.join(' · ')}`)
      }
      if (index.testDirs?.length) lines.push(`Tests: ${index.testDirs.slice(0, 4).join(', ')}`)
      if (index.topStructure?.length) lines.push(`Structure: ${index.topStructure.slice(0, 7).join(' · ')}`)
      pushSection('Project context', lines.join('\n'), hardCaps.project)
    }

    if (index?.readmeSnippet) {
      pushSection('README', trimTo(index.readmeSnippet, README_CAP), Math.min(README_CAP + 10, hardCaps.project))
    }

    if (index?.recentFiles?.length) {
      const files = [...index.recentFiles]
        .map((f) => ({ f, score: relevance('', f.path, tokens) }))
        .sort((a, b) => b.score - a.score || (b.f.modifiedAt || 0) - (a.f.modifiedAt || 0))
        .slice(0, 5)
      pushSection(
        'Recent files',
        files.map(({ f }) => `- ${shortPath(f.path)} (${relTime(f.modifiedAt)})`).join('\n'),
        Math.min(600, hardCaps.project)
      )
    }
  }

  // 3. Pinned prompts as recurring instructions.
  try {
    const workspaceId = opts.workspaceId === 'global' ? 'global' : opts.workspaceId
    const prompts: any[] = await window.api.prompts.list(workspaceId)
    const pinned = (prompts || []).filter((p) => p?.pinned).slice(0, 3)
    if (pinned.length > 0) {
      promptCount = pinned.length
      pushSection(
        'Pinned instructions',
        pinned.map((p) => `- ${p.name}: ${trimTo(p.content, PROMPT_ITEM_CAP)}`).join('\n'),
        hardCaps.instructions
      )
    }
  } catch { /* prompts unavailable */ }

  // 4. Project brain — pinned first, then auto sections and decisions ranked by relevance.
  if (workspaceScoped) {
    try {
      const entries: ProjectBrainEntry[] = (await window.api.brain.list(opts.workspaceId)) || []
      const usable = entries.filter((e) => !!e?.content)
      const rank = (list: ProjectBrainEntry[]) =>
        list
          .map((e) => ({
            e,
            score:
              (e.pinned ? 6 : 0) +
              relevance(e.title, e.content, tokens) +
              ((e.tags || []).some((t) => tokens.includes(t.toLowerCase())) ? 3 : 0),
          }))
          .sort((a, b) => b.score - a.score || (b.e.updatedAt || 0) - (a.e.updatedAt || 0))

      const pinned = rank(usable.filter((e) => e.pinned)).slice(0, 3)
      const autoPool = usable.filter(
        (e) => e.source === 'auto' && (e.tags || []).some((t) => AUTO_BRAIN_TAGS.includes(t))
      )
      const auto = rank(autoPool)
        .filter((x) => x.score > 0 || tokens.length === 0)
        .slice(0, 3)
        .map((x) => x.e)
      const manualDecisions = rank(usable.filter((e) => e.kind === 'decision' && e.source !== 'auto'))
        .slice(0, 3)
        .map((x) => x.e)

      const seen = new Set<string>()
      const chosen: ProjectBrainEntry[] = []
      for (const entry of [...pinned.map((x) => x.e), ...auto]) {
        if (seen.has(entry.id)) continue
        seen.add(entry.id)
        chosen.push(entry)
      }

      if (chosen.length > 0) {
        brainCount = chosen.length
        pushSection(
          'Project brain',
          chosen
            .map((e) => {
              const kind = e.kind || 'note'
              const tags = e.tags?.length ? ` [${e.tags.join(', ')}]` : ''
              return `- [${kind}]${tags} ${e.title}: ${trimTo(e.content, BRAIN_ITEM_CAP)}`
            })
            .join('\n'),
          hardCaps.brain
        )
      }

      const decisions = manualDecisions.filter((d) => !seen.has(d.id))
      if (decisions.length > 0) {
        decisionCount = decisions.length
        pushSection(
          'Recorded decisions',
          decisions.map((d) => `- ${d.title}: ${trimTo(d.content, BRAIN_ITEM_CAP)}`).join('\n'),
          Math.min(1000, hardCaps.brain)
        )
      }
    } catch { /* brain unavailable */ }
  }

  // 5. Derived insights — risks before changes; titles only to stay token-light.
  if (workspaceScoped) {
    try {
      const insights: BrainInsights | null = await window.api.brain.insights?.(opts.workspaceId)
      if (insights) {
        const lines: string[] = []
        const critical = insights.risks.filter((r) => r.severity === 'critical')
        const warnings = insights.risks.filter((r) => r.severity === 'warning')
        if (critical.length) lines.push(`Blocking: ${critical.slice(0, 3).map((r) => r.title).join(' · ')}`)
        if (warnings.length) lines.push(`Watch: ${warnings.slice(0, 3).map((r) => r.title).join(' · ')}`)
        const topGaps = insights.gaps.filter((g) => g.severity === 'warning').slice(0, 3)
        if (topGaps.length) lines.push(`Gaps: ${topGaps.map((g) => g.title).join(' · ')}`)
        if (insights.changes.length) lines.push(`Changed: ${insights.changes.slice(0, 3).map((c) => c.title).join(' · ')}`)
        if (insights.observations?.length) {
          lines.push(`Readings: ${insights.observations.slice(0, 3).map((o) => o.title).join(' · ')}`)
        }
        if (insights.nextActions.length) {
          lines.push(`Suggested next: ${insights.nextActions.slice(0, 3).map((a) => a.title).join(' · ')}`)
        }
        if (lines.length) {
          insightCount =
            insights.changes.length + insights.risks.length + insights.gaps.length + (insights.observations?.length || 0)
          pushSection('Workspace insights', lines.join('\n'), hardCaps.insights)
        }
      }
    } catch { /* insights unavailable */ }
  }

  // 7. Developer preferences — learned locally, applied silently.
  if (typeof window !== 'undefined' && window.api?.developer) {
    try {
      const personalization = await window.api.developer.personalization()
      if (personalization?.systemPrompt) {
        pushSection('Developer preferences', personalization.systemPrompt, DEVELOPER_CAP)
      }
    } catch {
      /* personalization unavailable */
    }
  }

  // 8. Terminal activity — summarized only, never raw output.
  if (typeof window !== 'undefined' && window.api?.terminal?.context) {
    try {
      const terminal = await window.api.terminal.context(opts.workspaceId)
      if (terminal && terminal.total > 0) {
        const lines = terminal.lines.map((line) => (line.detail ? `${line.label}: ${line.detail}` : line.label))
        if (terminal.packageManager) lines.push(`Package manager: ${terminal.packageManager}`)
        pushSection('Terminal activity', lines.join('\n'), 600)
      }
    } catch { /* terminal activity unavailable */ }
  }

  if (sections.length === 0) {
    return {
      system: null,
      memoryCount: 0,
      promptCount: 0,
      brainCount: 0,
      insightCount: 0,
      decisionCount: 0,
      truncated,
      budgetChars: maxChars,
      usedChars: 0,
    }
  }

  const system = `${SYSTEM_HEADER}\n\n${sections.join('\n\n')}`
  return {
    system,
    memoryCount,
    promptCount,
    brainCount,
    insightCount,
    decisionCount,
    truncated,
    budgetChars: maxChars,
    usedChars: system.length,
  }
}

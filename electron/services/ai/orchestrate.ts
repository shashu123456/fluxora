import { ProviderConfig, WorkspaceIndex } from '../../../src/types'

export interface OrchestrationRecommendation {
  providerId: string
  providerName: string
  modelId: string
  modelName: string
  reason: string
  workflow: string
  promptTip: string
  confidence: number
}

export interface OrchestrationInput {
  task: string
  providers: ProviderConfig[]
  index?: WorkspaceIndex | null
}

const TASK_PATTERNS: { re: RegExp; label: string; workflow: string; tip: string; preferVision?: boolean; preferLong?: boolean; fast?: boolean }[] = [
  { re: /\b(refactor|redesign|architect|architecture|migrate|migration)\b/i, label: 'refactoring/architecture', workflow: 'Plan → split into steps → implement → review diff', tip: 'Ask for a plan first, then execute step by step with diffs.' },
  { re: /\b(bug|fix|error|broken|crash|exception|failing|debug)\b/i, label: 'debugging/bugfix', workflow: 'Reproduce → isolate → root cause → minimal fix → verify', tip: 'Paste the exact error and steps to reproduce.' },
  { re: /\b(test|tests|coverage|spec|unit test|e2e)\b/i, label: 'testing', workflow: 'Map risky paths → write failing tests → implement → run suite', tip: 'Name the framework and the files to cover first.' },
  { re: /\b(document|docs|readme|changelog|comment)\b/i, label: 'documentation', workflow: 'Read source → outline → draft → verify accuracy', tip: 'Point at the module; ask for Diataxis-style sections.' },
  { re: /\b(review|audit|critique|pr\b|diff)\b/i, label: 'review/audit', workflow: 'Read diff → classify issues → rank by severity → summarize', tip: 'Ask for blocking vs non-blocking findings.' },
  { re: /\b(explain|what is|how does|why does|understand)\b/i, label: 'explanation', workflow: 'Read code → trace flow → explain with file references', tip: 'Name the entry point you want traced.' },
  { re: /\b(design|ui|ux|css|layout|style|component|theme)\b/i, label: 'design/UI', workflow: 'Explore existing system → propose variants → refine → implement', tip: 'Mention the design tokens or components to stay consistent with.', preferVision: true },
  { re: /\b(image|screenshot|ocr|photo|diagram|pdf|vision)\b/i, label: 'vision/multimodal', workflow: 'Attach file → extract → analyze → respond', tip: 'Attach the file; keep resolution readable.', preferVision: true },
  { re: /\b(summar|transcript|long|entire|whole file|paste)\b/i, label: 'long-context/summarization', workflow: 'Chunk → extract → condense → verify coverage', tip: 'Large inputs favor long-context models.', preferLong: true },
  { re: /\b(fast|quick|simple|rename|typo|small)\b/i, label: 'quick/small edit', workflow: 'Single-shot answer', tip: 'Use a fast model; keep the ask small.', fast: true },
]

function scoreModel(m: { id: string; name: string; supportsVision?: boolean; contextWindow?: number }, flags: { preferVision?: boolean; preferLong?: boolean; fast?: boolean }): number {
  let score = 50
  const id = (m.id + ' ' + m.name).toLowerCase()
  if (flags.preferVision && m.supportsVision) score += 25
  if (flags.preferLong) {
    const cw = m.contextWindow || 0
    if (cw >= 200000) score += 25
    else if (cw >= 100000) score += 12
  }
  if (flags.fast) {
    if (/mini|flash|haiku|small|8b|20b|turbo/i.test(id)) score += 25
    if (/opus|pro\b|ultra|4o\b/i.test(id)) score -= 10
  }
  if (!flags.fast && /opus|pro\b|sonnet|4o\b|ultra/i.test(id)) score += 8
  if (/o1|reasoning|r1/i.test(id)) score += 4
  return score
}

export function recommend(input: OrchestrationInput): OrchestrationRecommendation | null {
  const enabled = (input.providers || []).filter((p) => p.enabled && (p.models || []).length > 0)
  if (enabled.length === 0) return null

  const task = (input.task || '').trim()
  const match = TASK_PATTERNS.find((t) => t.re.test(task))
  const flags: { preferVision?: boolean; preferLong?: boolean; fast?: boolean } = match || {}

  // Adjust workflow by workspace tech if present
  let workflow = match?.workflow || 'Clarify goal → execute → verify'
  let tip = match?.tip || 'State the desired outcome and constraints up front.'
  if (input.index?.frameworks?.length) {
    const fws = input.index.frameworks.join(', ')
    workflow += ` (stack: ${fws})`
  }
  if (input.index?.testDirs?.length) {
    tip += ' Run the existing test suite to verify.'
  }

  let best: { provider: ProviderConfig; model: any; score: number } | null = null
  for (const p of enabled) {
    for (const m of p.models) {
      let score = scoreModel(m, flags)
      if (p.capabilities?.supportsVision && flags.preferVision) score += 5
      if (!best || score > best.score) best = { provider: p, model: m, score }
    }
  }
  if (!best) return null

  const confidence = Math.min(95, Math.max(40, best.score - 30))
  return {
    providerId: best.provider.id,
    providerName: best.provider.name,
    modelId: best.model.id,
    modelName: best.model.name || best.model.id,
    reason: match
      ? `Task classified as ${match.label} → favors: ${match.workflow.split(' → ')[0]}.`
      : 'Default balanced choice across enabled providers.',
    workflow,
    promptTip: tip,
    confidence,
  }
}

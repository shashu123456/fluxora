export type AgentStage =
  | 'observe'
  | 'understand'
  | 'analyze'
  | 'plan'
  | 'approval'
  | 'execute'
  | 'validate'
  | 'summarize'
  | 'brain'
  | 'memory'
  | 'next'

export const STAGE_ORDER: AgentStage[] = [
  'observe',
  'understand',
  'analyze',
  'plan',
  'approval',
  'execute',
  'validate',
  'summarize',
  'brain',
  'memory',
  'next',
]

export const STAGE_META: Record<AgentStage, { label: string; description: string; needsApproval: boolean }> = {
  observe: { label: 'Observe', description: 'Read the state of the workspace', needsApproval: false },
  understand: { label: 'Understand', description: 'Work out what the task touches', needsApproval: false },
  analyze: { label: 'Analyze', description: 'Identify risk and approach', needsApproval: false },
  plan: { label: 'Plan', description: 'Break the task into concrete steps', needsApproval: false },
  approval: { label: 'Approval', description: 'Confirm before anything runs', needsApproval: true },
  execute: { label: 'Execute', description: 'Run the approved steps', needsApproval: false },
  validate: { label: 'Validate', description: 'Check the result before it counts', needsApproval: false },
  summarize: { label: 'Summarize', description: 'Describe what actually happened', needsApproval: false },
  brain: { label: 'Brain', description: 'Record the outcome in the project brain', needsApproval: false },
  memory: { label: 'Memory', description: 'Retain what was learned', needsApproval: false },
  next: { label: 'Next', description: 'Suggest the follow-up', needsApproval: false },
}

export interface AgentStep {
  id: string
  title: string
  command?: string
  done: boolean
}

export interface AgentLogEntry {
  stage: AgentStage
  message: string
  at: number
  level: 'info' | 'error' | 'success'
}

export interface AgentBrief {
  observe: string
  understand: string
  analyze: string
}

export interface AgentWorkflowState {
  task: string
  stage: AgentStage
  brief: AgentBrief
  plan: string
  steps: AgentStep[]
  summary: string
  nextStep: string
  approved: AgentStage[]
  failed: boolean
  failure: string | null
  log: AgentLogEntry[]
}

export function createWorkflow(task: string): AgentWorkflowState {
  return {
    task: task.trim(),
    stage: 'observe',
    brief: { observe: '', understand: '', analyze: '' },
    plan: '',
    steps: [],
    summary: '',
    nextStep: '',
    approved: [],
    failed: false,
    failure: null,
    log: [{ stage: 'observe', message: `Workflow started for: ${task.trim()}`, at: Date.now(), level: 'info' }],
  }
}

let stepSeq = 0
export function parsePlan(markdown: string): AgentStep[] {
  const steps: AgentStep[] = []
  const lines = markdown.split('\n')
  for (const line of lines) {
    const m = line.match(/^\s*(?:[-*]|\d+\.)\s+\[?\s*\]?\s*(.+)$/) || line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/)
    if (!m) continue
    const title = m[1].replace(/^\[x\]\s*/i, '').trim()
    if (!title) continue
    const cmdMatch = title.match(/`([^`]+)`/)
    steps.push({ id: `s${++stepSeq}`, title: title.replace(/`/g, ''), command: cmdMatch?.[1], done: false })
    if (steps.length >= 20) break
  }
  return steps
}

/**
 * Splits the model answer into its three sections. The model is asked for
 * UNDERSTANDING / ANALYSIS / PLAN headings; anything that does not parse is
 * treated as the plan so the workflow never stalls on formatting.
 */
export function parseBrief(raw: string): { understand: string; analyze: string; plan: string } {
  const text = String(raw || '')
  let understand = ''
  let analyze = ''
  let plan = ''
  const pattern = /^\s*(UNDERSTANDING|ANALYSIS|PLAN)\s*:?\s*$/gim
  const marks: { key: string; index: number }[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    marks.push({ key: match[1].toLowerCase(), index: match.index + match[0].length })
  }
  if (marks.length === 0) {
    return { understand: '', analyze: '', plan: text.trim() }
  }
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index
    const end = i + 1 < marks.length ? text.indexOf('\n', marks[i + 1].index) : text.length
    const body = text.slice(start, end > start ? end : text.length).trim()
    if (marks[i].key === 'understanding') understand = body
    if (marks[i].key === 'analysis') analyze = body
    if (marks[i].key === 'plan') plan = body
  }
  return { understand, analyze, plan }
}

export function approve(state: AgentWorkflowState, stage: AgentStage): AgentWorkflowState {
  if (!state.approved.includes(stage)) state.approved.push(stage)
  return { ...state, approved: [...state.approved] }
}

export function canAdvance(state: AgentWorkflowState): boolean {
  const meta = STAGE_META[state.stage]
  if (state.stage === 'next') return false
  if (meta.needsApproval && !state.approved.includes(state.stage)) return false
  if (state.stage === 'plan' && !state.plan.trim()) return false
  if (state.stage === 'execute' && state.steps.length > 0 && !state.steps.every((s) => s.done)) return false
  if (state.stage === 'summarize' && !state.summary.trim()) return false
  return true
}

export function advance(state: AgentWorkflowState): AgentWorkflowState {
  if (!canAdvance(state)) return state
  const idx = STAGE_ORDER.indexOf(state.stage)
  const next = STAGE_ORDER[Math.min(idx + 1, STAGE_ORDER.length - 1)]
  return {
    ...state,
    stage: next,
    log: [...state.log, { stage: next, message: `Entered stage: ${STAGE_META[next].label}`, at: Date.now(), level: 'info' }],
  }
}

export function regress(state: AgentWorkflowState, to: AgentStage): AgentWorkflowState {
  return {
    ...state,
    stage: to,
    approved: state.approved.filter((s) => STAGE_ORDER.indexOf(s) <= STAGE_ORDER.indexOf(to)),
    failed: false,
    failure: null,
    log: [...state.log, { stage: to, message: `Moved back to: ${STAGE_META[to].label}`, at: Date.now(), level: 'info' }],
  }
}

export function markStepDone(state: AgentWorkflowState, stepId: string): AgentWorkflowState {
  return {
    ...state,
    steps: state.steps.map((s) => (s.id === stepId ? { ...s, done: true } : s)),
  }
}

/**
 * A failure never advances the workflow on its own. It parks the agent in the
 * stage that failed so a human can decide what to do next.
 */
export function fail(state: AgentWorkflowState, message: string): AgentWorkflowState {
  return {
    ...state,
    failed: true,
    failure: message,
    log: [...state.log, { stage: state.stage, message, at: Date.now(), level: 'error' }],
  }
}

export function succeed(state: AgentWorkflowState, message: string): AgentWorkflowState {
  return {
    ...state,
    failed: false,
    failure: null,
    log: [...state.log, { stage: state.stage, message, at: Date.now(), level: 'success' }],
  }
}

export function progress(state: AgentWorkflowState): number {
  const idx = STAGE_ORDER.indexOf(state.stage)
  if (state.stage === 'next') return 100
  return Math.round((idx / (STAGE_ORDER.length - 1)) * 100)
}

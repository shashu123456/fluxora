import { useCallback, useEffect, useState } from 'react'
import {
  ArrowUpRight,
  BookOpen,
  Brain,
  Check,
  CheckCircle2,
  Circle,
  Compass,
  Eye,
  FileText,
  GitCommit,
  ListChecks,
  Loader2,
  Microscope,
  Play,
  RefreshCw,
  ShieldCheck,
  Wand2,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useIntelligenceStore } from '@/stores/intelligenceStore'
import {
  AgentStage,
  AgentWorkflowState,
  STAGE_META,
  STAGE_ORDER,
  createWorkflow,
  parsePlan,
  parseBrief,
  approve,
  advance,
  regress,
  markStepDone,
  fail,
  succeed,
  progress,
} from '@/lib/agentWorkflow'

const STAGE_ICONS: Record<AgentStage, React.ReactNode> = {
  observe: <Eye className="h-3.5 w-3.5" />,
  understand: <Compass className="h-3.5 w-3.5" />,
  analyze: <Microscope className="h-3.5 w-3.5" />,
  plan: <ListChecks className="h-3.5 w-3.5" />,
  approval: <ShieldCheck className="h-3.5 w-3.5" />,
  execute: <Play className="h-3.5 w-3.5" />,
  validate: <CheckCircle2 className="h-3.5 w-3.5" />,
  summarize: <FileText className="h-3.5 w-3.5" />,
  brain: <BookOpen className="h-3.5 w-3.5" />,
  memory: <Brain className="h-3.5 w-3.5" />,
  next: <ArrowUpRight className="h-3.5 w-3.5" />,
}

interface ModelRoute {
  providerId: string
  modelId: string
  label: string
}

/**
 * Model selection is delegated to the shared orchestrator so the agent uses
 * exactly the same routing rules as the rest of the app (task heuristics,
 * workspace preference, favourite models).
 */
async function resolveModel(task: string, workspaceId: string): Promise<ModelRoute | null> {
  try {
    const rec: any = await window.api.ai.recommend({ task, workspaceId })
    if (rec?.providerId && rec?.modelId) {
      return {
        providerId: rec.providerId,
        modelId: rec.modelId,
        label: `${rec.providerName || rec.providerId} · ${rec.modelName || rec.modelId}`,
      }
    }
  } catch { /* orchestrator unavailable */ }

  try {
    const routed: any = await window.api.ai.autoRoute({ message: task, workspaceId })
    if (routed?.providerId && routed?.modelId) {
      return { providerId: routed.providerId, modelId: routed.modelId, label: `${routed.providerId} · ${routed.modelId}` }
    }
  } catch { /* auto-route unavailable */ }

  const providers: any[] = (await window.api.providers.list()) || []
  for (const p of providers) {
    if (!p.enabled) continue
    const models: any[] = Array.isArray(p.models) ? p.models : []
    if (models.length > 0) {
      return { providerId: p.id, modelId: models[0].id, label: `${p.name || p.id} · ${models[0].name || models[0].id}` }
    }
  }
  return null
}

export function AgentWorkflow({
  cwd,
  workspaceId,
  onUseInChat,
}: {
  cwd: string
  workspaceId?: string
  onUseInChat?: (text: string) => void
}) {
  const [task, setTask] = useState('')
  const [state, setState] = useState<AgentWorkflowState | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [stepCmd, setStepCmd] = useState<Record<string, string>>({})
  const [editPlan, setEditPlan] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [route, setRoute] = useState<ModelRoute | null>(null)
  const [suggestion, setSuggestion] = useState('')

  const scope = workspaceId || 'global'

  const withLog = useCallback(
    (s: AgentWorkflowState, message: string, level: 'info' | 'error' | 'success' = 'info'): AgentWorkflowState => ({
      ...s,
      log: [...s.log, { stage: s.stage, message, at: Date.now(), level }],
    }),
    []
  )

  /**
   * Observe — read the workspace, the repository state and the open signals
   * before the model is asked for anything. Purely local, no token spend.
   */
  const observeWorkspace = useCallback(async (): Promise<string> => {
    const parts: string[] = []
    try {
      const idx: any = await window.api.workspace.getIndex(scope)
      if (idx) {
        const stack = (idx.frameworks || []).slice(0, 4).join(', ') || 'unknown stack'
        const langs = (idx.languages || []).slice(0, 4).map((l: any) => `${l.lang} (${l.count})`).join(', ')
        parts.push(`Stack: ${stack}`)
        if (langs) parts.push(`Languages: ${langs}`)
        parts.push(`Files: ${idx.fileCount ?? 'n/a'} · Health: ${idx.health?.score ?? 'n/a'}/100`)
        if (idx.git?.isRepo) {
          parts.push(
            `Git: ${idx.git.branch || 'unknown'} · ${idx.git.hasChanges ? 'uncommitted changes' : 'clean tree'}`
          )
        }
        const recent = (idx.recentFiles || []).slice(0, 6).map((f: any) => f.path)
        if (recent.length) parts.push(`Recently touched: ${recent.join(', ')}`)
      }
    } catch { /* index unavailable */ }
    try {
      await useIntelligenceStore.getState().load(scope)
      const intel = useIntelligenceStore.getState().intelligence[scope]
      const recs = useIntelligenceStore.getState().recommendations[scope] || []
      if (intel) {
        parts.push(`Architecture: ${intel.architectureSummary}`)
        parts.push(
          `Workspace health: ${intel.health.overallWorkspaceHealth.score}/100 · stage: ${intel.insights.currentDevelopmentStage} · complexity: ${intel.complexity.complexity} (${intel.complexity.estimatedProjectSize})`
        )
        const risks = [
          { label: 'security', metric: intel.risks.securityRisk },
          { label: 'dependencies', metric: intel.risks.dependencyRisk },
          { label: 'maintenance', metric: intel.risks.maintenanceRisk },
          { label: 'architecture', metric: intel.risks.architectureRisk },
          { label: 'documentation', metric: intel.risks.documentationRisk },
          { label: 'configuration', metric: intel.risks.configurationRisk },
          { label: 'performance', metric: intel.risks.performanceRisk },
        ]
          .sort((a, b) => a.metric.score - b.metric.score)
          .slice(0, 3)
        parts.push(
          `Top risks: ${risks
            .map((r) => `${r.label} ${r.metric.score} (${r.metric.reasons[0]?.reason || 'no detail'})`)
            .join(' · ')}`
        )
        parts.push(
          `Docs coverage: ${intel.health.documentationScore.score}/100 · AI readiness: ${intel.health.aiReadinessScore.score}/100`
        )
        if (recs.length) parts.push(`Recommended focus: ${recs.slice(0, 3).map((r) => r.title).join(' · ')}`)
      }
    } catch { /* intelligence unavailable */ }
    try {
      const insights: any = await window.api.brain.insights(scope)
      if (insights) parts.push(`Open signals: ${insights.summary}`)
    } catch { /* insights unavailable */ }
    return parts.join('\n')
  }, [scope])

  const handleStart = async () => {
    if (!task.trim() || busy) return
    setBusy('observe')
    setError(null)
    setSuggestion('')
    const fresh = createWorkflow(task)
    setState(fresh)
    try {
      const observed = await observeWorkspace()
      setState((prev) =>
        prev
          ? withLog({ ...prev, brief: { ...prev.brief, observe: observed } }, 'Observed the workspace', 'info')
          : prev
      )

      setBusy('understand')
      const selected = await resolveModel(task.trim(), scope)
      if (!selected) throw new Error('No enabled provider with a model — add one in Settings')
      setRoute(selected)

      const prompt = [
        'Work as a senior engineer on this task in the active workspace.',
        `Task: ${task.trim()}`,
        '',
        'Workspace observations:',
        observed || 'No workspace index available.',
        '',
        'Use the intelligence profile above. Adapt the approach to the real architecture, complexity and top risks:',
        'prefer the lowest-risk path that still completes the task, and name which risk the plan reduces.',
        '',
        'Respond with exactly three sections, in this order:',
        'UNDERSTANDING — what the task actually touches and why.',
        'ANALYSIS — the approach, the risks and anything that needs a human decision.',
        'PLAN — a markdown checklist, max 8 items, each line starting with "- ".',
        'Put any shell command for a step in backticks on the same line.',
      ].join('\n')

      const res = await window.api.ai.complete({
        providerId: selected.providerId,
        modelId: selected.modelId,
        messages: [
          {
            role: 'system',
            content:
              'You are a senior software engineer. You observe before you act, you name risk before you propose a plan, and you never hide uncertainty.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        maxTokens: 900,
      })

      const brief = parseBrief(String(res?.content || ''))
      if (!brief.plan.trim()) throw new Error('The model did not return a plan')
      const steps = parsePlan(brief.plan)

      setState((prev) =>
        prev
          ? withLog(
              {
                ...prev,
                brief: { observe: observed, understand: brief.understand, analyze: brief.analyze },
                plan: brief.plan,
                steps,
                stage: 'approval',
              },
              `Plan generated (${steps.length} steps) via ${selected.label}`,
              'success'
            )
          : prev
      )
    } catch (err: any) {
      const msg = err?.message || 'Could not start the workflow'
      setError(msg)
      setState((prev) => (prev ? withLog(fail(prev, msg), msg, 'error') : prev))
    } finally {
      setBusy(null)
    }
  }

  const handleApproveStage = () => {
    setState((prev) => (prev ? advance(approve(prev, prev.stage)) : prev))
  }

  const runTerminal = useCallback(
    async (command: string, stepId: string) => {
      const result = await window.api.terminal.run({ workspaceId: scope, command, cwd })
      try {
        void window.api?.developer?.track('command_run', {
          key: command.trim().split(/\s+/)[0] || command,
          value: command,
          workspaceId: scope,
        })
      } catch {
        /* tracking is best-effort */
      }
      if (result?.status === 'success') {
        setState((prev) => (prev ? withLog(markStepDone(prev, stepId), `$ ${command} → ok`, 'success') : prev))
      } else {
        const detail = result?.error || (result?.timedOut ? 'timed out' : result?.cancelled ? 'cancelled' : `exit ${result?.exitCode}`)
        const msg = `$ ${command} failed (${detail})`
        setState((prev) => (prev ? withLog(fail(prev, msg), msg, 'error') : prev))
      }
    },
    [cwd, scope]
  )

  const handleRunStep = async (stepId: string) => {
    if (!state || busy) return
    const step = state.steps.find((s) => s.id === stepId)
    if (!step) return
    const command = (stepCmd[stepId] ?? step.command ?? '').trim()
    if (!command) {
      setState((prev) => (prev ? markStepDone(prev, stepId) : prev))
      return
    }
    setBusy(stepId)
    try {
      await runTerminal(command, stepId)
    } catch (err: any) {
      const msg = err?.message || `Step failed: ${command}`
      setState((prev) => (prev ? withLog(fail(prev, msg), msg, 'error') : prev))
    } finally {
      setBusy(null)
    }
  }

  const handleValidate = async () => {
    if (!state || busy) return
    setBusy('validate')
    try {
      const diff: string = await window.api.git.diff(cwd)
      const changed = (diff || '')
        .split('\n')
        .filter((l: string) => (l.startsWith('+') || l.startsWith('-')) && !l.startsWith('+++') && !l.startsWith('---')).length
      if (!diff || changed === 0) {
        setState((prev) => (prev ? withLog(prev, 'No changes detected in working tree', 'info') : prev))
      } else {
        setState((prev) => (prev ? withLog(prev, `Diff ready: ${changed} changed lines`, 'success') : prev))
      }
    } catch (err: any) {
      const msg = err?.message || 'Diff failed'
      setState((prev) => (prev ? withLog(fail(prev, msg), msg, 'error') : prev))
    } finally {
      setBusy(null)
    }
  }

  const handleCommit = async (message: string) => {
    if (!state || busy || !message.trim()) return
    setBusy('commit')
    try {
      await window.api.git.commit(cwd, message.trim())
      setState((prev) =>
        prev ? withLog(prev, `Committed: ${message.trim()}`, 'success') : prev
      )
    } catch (err: any) {
      const msg = err?.message || 'Commit failed'
      setState((prev) => (prev ? withLog(fail(prev, msg), msg, 'error') : prev))
    } finally {
      setBusy(null)
    }
  }

  const handleSummarize = async () => {
    if (!state || busy) return
    setBusy('summarize')
    try {
      const steps = state.steps.map((s) => `- [${s.done ? 'x' : ' '}] ${s.title}`).join('\n')
      const fallback = [
        `Task: ${state.task}`,
        `Plan steps: ${state.steps.length} (${state.steps.filter((s) => s.done).length} completed)`,
        state.failure ? `Encountered: ${state.failure}` : 'Ran without failures.',
      ].join('\n')

      let summary = fallback
      if (route) {
        try {
          const res = await window.api.ai.complete({
            providerId: route.providerId,
            modelId: route.modelId,
            messages: [
              {
                role: 'system',
                content:
                  'Summarise the engineering work in under 120 words. State what changed, what was verified and what remains. No preamble.',
              },
              { role: 'user', content: `Task: ${state.task}\n\nPlan:\n${steps}\n\nAnalysis:\n${state.brief.analyze}` },
            ],
            temperature: 0.2,
            maxTokens: 400,
          })
          const text = String(res?.content || '').trim()
          if (text) summary = text
        } catch {
          summary = fallback
        }
      }
      setState((prev) => (prev ? withLog({ ...prev, summary }, 'Summary produced', 'success') : prev))
    } catch (err: any) {
      const msg = err?.message || 'Could not summarize'
      setState((prev) => (prev ? withLog(fail(prev, msg), msg, 'error') : prev))
    } finally {
      setBusy(null)
    }
  }

  const handleDocument = async () => {
    if (!state || busy) return
    setBusy('brain')
    try {
      const content = [
        `Task: ${state.task}`,
        `Understanding: ${state.brief.understand || 'n/a'}`,
        `Analysis: ${state.brief.analyze || 'n/a'}`,
        `Plan:`,
        state.plan,
        `Outcome: ${state.failure ? 'failed: ' + state.failure : 'completed'}`,
        `Summary: ${state.summary || 'n/a'}`,
        `Model: ${route?.label || 'unknown'}`,
      ].join('\n')
      await window.api.brain.create({
        workspaceId: scope,
        kind: 'note',
        status: 'done',
        title: `Agent: ${state.task.slice(0, 70)}`,
        content,
        tags: ['agent', 'completed'],
        source: 'agent',
      })
      setState((prev) => (prev ? withLog(prev, 'Recorded in the project brain', 'success') : prev))
      handleApproveStage()
    } catch (err: any) {
      const msg = err?.message || 'Could not write to the project brain'
      setState((prev) => (prev ? withLog(fail(prev, msg), msg, 'error') : prev))
    } finally {
      setBusy(null)
    }
  }

  const handleRemember = async () => {
    if (!state || busy) return
    setBusy('memory')
    try {
      const content = `Agent task "${state.task}" — ${state.summary || state.brief.analyze || 'no summary recorded'}`
      await window.api.memory.create({
        workspaceId: scope,
        scope: 'workspace',
        type: 'project',
        content,
        source: 'agent',
        tags: ['agent'],
      })
      setState((prev) => (prev ? withLog(prev, 'Retained in workspace memory', 'success') : prev))
      handleApproveStage()
    } catch (err: any) {
      const msg = err?.message || 'Could not write to memory'
      setState((prev) => (prev ? withLog(fail(prev, msg), msg, 'error') : prev))
    } finally {
      setBusy(null)
    }
  }

  const handleReset = () => {
    setState(null)
    setTask('')
    setError(null)
    setRoute(null)
    setSuggestion('')
  }

  const stage = state?.stage

  // The follow-up suggestion comes from the workspace's own next actions.
  useEffect(() => {
    if (stage !== 'next' || suggestion) return
    let cancelled = false
    window.api.brain
      ?.insights?.(scope)
      .then((ins: any) => {
        if (cancelled) return
        const first = ins?.nextActions?.[0]
        setSuggestion(
          first?.title
            ? `${first.title}${first.detail ? ` — ${first.detail}` : ''}`
            : 'Re-index the workspace and clear the remaining risks.'
        )
      })
      .catch(() => {
        if (!cancelled) setSuggestion('Review the working tree and commit the result.')
      })
    return () => {
      cancelled = true
    }
  }, [stage, suggestion, scope])

  return (
    <div className="flex h-full flex-col gap-3">
      {!state && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-fx-gold" />
            <span className="text-sm font-medium">Coding agent</span>
          </div>
          <Textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Describe a coding task: refactor auth, add tests for utils, fix the flaky terminal runner..."
            rows={3}
            className="text-sm"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleStart} disabled={!task.trim() || !!busy} className="gap-1.5">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {busy ? 'Thinking...' : 'Start'}
            </Button>
            <span className="text-xs text-muted-foreground">
              Observe → Understand → Analyze → Plan → Approval
            </span>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )}

      {state && stage && (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{state.task}</p>
              <p className="text-xs text-muted-foreground">
                {STAGE_META[stage].label} · {STAGE_META[stage].description}
              </p>
              {route && <p className="truncate text-[11px] text-fx-gold/80">Model: {route.label}</p>}
            </div>
            <Button variant="ghost" size="sm" onClick={handleReset} className="shrink-0 gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> New
            </Button>
          </div>

          <Progress value={progress(state)} className="h-1.5" />

          <div className="flex flex-wrap gap-1">
            {STAGE_ORDER.map((s) => {
              const isCurrent = s === stage
              const isDone = STAGE_ORDER.indexOf(s) < STAGE_ORDER.indexOf(stage)
              const isApproved = state.approved.includes(s)
              return (
                <Badge
                  key={s}
                  variant="outline"
                  className={cn(
                    'gap-1 text-[10px]',
                    isCurrent && 'border-fx-gold/50 text-fx-gold',
                    isDone && !isCurrent && 'text-emerald-500/80',
                    !isCurrent && !isDone && 'text-muted-foreground',
                  )}
                  title={STAGE_META[s].description}
                >
                  {isDone && !isCurrent ? <CheckCircle2 className="h-3 w-3" /> : STAGE_ICONS[s]}
                  {STAGE_META[s].label}
                  {isApproved && isCurrent && !isDone ? <Check className="h-3 w-3 text-emerald-500" /> : null}
                </Badge>
              )
            })}
          </div>

          {state.failure && (
            <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
              <p className="text-xs text-red-400/90">{state.failure}</p>
            </div>
          )}

          {stage === 'approval' && (
            <div className="flex flex-col gap-3">
              {state.brief.understand && (
                <Brief label="Understanding" body={state.brief.understand} />
              )}
              {state.brief.analyze && <Brief label="Analysis" body={state.brief.analyze} />}
              <div>
                <Label className="fx-label text-muted-foreground">Plan</Label>
                <ol className="mt-1.5 space-y-1">
                  {state.steps.map((s) => (
                    <li key={s.id} className="flex items-start gap-2 text-xs">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-fx-gold/70" />
                      <span>{s.title}</span>
                    </li>
                  ))}
                  {state.steps.length === 0 && <li className="text-xs text-muted-foreground">No steps returned.</li>}
                </ol>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Nothing runs until you approve. Commands outside the terminal allowlist always ask again.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setState((prev) => (prev ? regress(prev, 'plan') : prev))}>
                  Revise plan
                </Button>
                <Button size="sm" onClick={handleApproveStage}>
                  Start execution
                </Button>
              </div>
            </div>
          )}

          {stage === 'plan' && (
            <div className="flex flex-col gap-2">
              {editPlan !== null ? (
                <>
                  <Label className="text-xs">Edit plan</Label>
                  <Textarea value={editPlan} onChange={(e) => setEditPlan(e.target.value)} rows={6} className="font-mono text-xs" />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        const steps = parsePlan(editPlan || '')
                        setState((p) => (p ? { ...p, plan: editPlan || '', steps } : p))
                        setEditPlan(null)
                      }}
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditPlan(null)}>
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <pre className="max-h-40 overflow-auto rounded-md bg-muted/30 p-2 font-mono text-xs whitespace-pre-wrap">
                    {state.plan || 'No plan yet'}
                  </pre>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditPlan(state.plan)} disabled={!state.plan}>
                      Edit
                    </Button>
                    <Button size="sm" onClick={handleApproveStage} disabled={!!busy || !state.plan}>
                      Approve plan
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {stage === 'execute' && (
            <>
              <ScrollArea className="max-h-56 flex-1">
                <div className="flex flex-col gap-1.5">
                  {state.steps.length === 0 && (
                    <p className="text-xs text-muted-foreground">No steps — approve to continue.</p>
                  )}
                  {state.steps.map((s) => (
                    <div key={s.id} className="rounded-md border bg-muted/20 px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        {s.done ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        ) : (
                          <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className={cn('flex-1 text-xs', s.done && 'text-muted-foreground line-through')}>{s.title}</span>
                        {!s.done && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 gap-1 text-[10px]"
                            onClick={() => handleRunStep(s.id)}
                            disabled={busy === s.id}
                          >
                            {busy === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                            Run
                          </Button>
                        )}
                      </div>
                      {!s.done && (
                        <Input
                          value={stepCmd[s.id] ?? s.command ?? ''}
                          onChange={(e) => setStepCmd((prev) => ({ ...prev, [s.id]: e.target.value }))}
                          placeholder="command (optional — Enter marks step done)"
                          className="mt-1 h-7 font-mono text-[11px]"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleRunStep(s.id)
                            }
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={handleApproveStage}
                  disabled={state.steps.some((s) => !s.done) && state.steps.length > 0}
                >
                  Continue to validation
                </Button>
              </div>
            </>
          )}

          {stage === 'validate' && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleValidate} disabled={!!busy} className="gap-1.5">
                  {busy === 'validate' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                  Load diff summary
                </Button>
                <Button size="sm" onClick={handleApproveStage}>
                  Looks right
                </Button>
              </div>
              <CommitBox
                busy={busy === 'commit'}
                onCommit={handleCommit}
                defaultMessage={`feat: ${state.task.slice(0, 60)}`}
              />
              <p className="text-[11px] text-muted-foreground">
                Committing is always your action — the agent never writes history on its own.
              </p>
            </div>
          )}

          {stage === 'summarize' && (
            <div className="flex flex-col gap-2">
              {state.summary ? (
                <Textarea
                  value={state.summary}
                  onChange={(e) => setState((prev) => (prev ? { ...prev, summary: e.target.value } : prev))}
                  rows={5}
                  className="text-xs"
                />
              ) : (
                <p className="text-xs text-muted-foreground">Describe what actually changed and what is still open.</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSummarize} disabled={!!busy} className="gap-1.5">
                  {busy === 'summarize' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                  {state.summary ? 'Regenerate summary' : 'Generate summary'}
                </Button>
                <Button size="sm" variant="outline" onClick={handleApproveStage} disabled={!state.summary.trim()}>
                  Continue
                </Button>
              </div>
            </div>
          )}

          {stage === 'brain' && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                Record the task, the plan and the outcome in the project brain so the next session starts informed.
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleDocument} disabled={!!busy} className="gap-1.5">
                  {busy === 'brain' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookOpen className="h-3.5 w-3.5" />}
                  Update brain
                </Button>
                <Button size="sm" variant="outline" onClick={handleApproveStage}>
                  Skip
                </Button>
              </div>
            </div>
          )}

          {stage === 'memory' && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                Keep the learning in workspace memory so it is available in every future conversation.
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleRemember} disabled={!!busy} className="gap-1.5">
                  {busy === 'memory' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
                  Update memory
                </Button>
                <Button size="sm" variant="outline" onClick={handleApproveStage}>
                  Skip
                </Button>
              </div>
            </div>
          )}

          {stage === 'next' && (
            <div className="flex flex-col items-center gap-2 py-3">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <p className="text-sm font-medium">Workflow complete</p>
              <p className="max-w-sm text-center text-xs text-muted-foreground">{suggestion}</p>
              <div className="flex gap-2">
                {onUseInChat && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onUseInChat(
                        `I completed this task with the coding agent: ${state.task}\n\n${state.summary || state.plan}`
                      )
                    }
                  >
                    Summarize in chat
                  </Button>
                )}
                <Button size="sm" onClick={handleReset}>
                  New task
                </Button>
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-hidden">
            <div className="mb-1 text-xs font-medium text-muted-foreground">Activity</div>
            <ScrollArea className="h-[calc(100%-1.25rem)]">
              <div className="flex flex-col gap-1">
                {[...state.log].reverse().map((l, i) => (
                  <div key={i} className="flex items-start gap-2 text-[11px]">
                    <span className="shrink-0 text-muted-foreground">{new Date(l.at).toLocaleTimeString()}</span>
                    <span className={cn('flex-1', l.level === 'error' && 'text-red-500', l.level === 'success' && 'text-emerald-500')}>
                      {l.message}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </>
      )}
    </div>
  )
}

function Brief({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <Label className="fx-label text-muted-foreground">{label}</Label>
      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-foreground/80">{body}</p>
    </div>
  )
}

function CommitBox({
  busy,
  onCommit,
  defaultMessage,
}: {
  busy: boolean
  onCommit: (msg: string) => void
  defaultMessage: string
}) {
  const [msg, setMsg] = useState(defaultMessage)
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs">Commit message</Label>
      <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={2} className="font-mono text-xs" />
      <div>
        <Button size="sm" variant="secondary" onClick={() => onCommit(msg)} disabled={busy || !msg.trim()} className="gap-1.5">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCommit className="h-3.5 w-3.5" />}
          Commit
        </Button>
      </div>
    </div>
  )
}

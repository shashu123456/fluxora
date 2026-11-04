import { useEffect, useMemo } from 'react'
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronRight,
  FileText,
  GitBranch,
  Layers,
  Lightbulb,
  Package,
  RefreshCw,
  Shield,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'
import { useIntelligenceStore } from '@/stores/intelligenceStore'
import { buildEvolutionChain } from '@/lib/intelligence/evolution'
import type { ScoredMetric, TimelineEvent } from '@/types/workspaceIntelligence'

const STAGE_ICON: Record<string, typeof Activity> = {
  observation: Activity,
  reasoning: Layers,
  insight: Sparkles,
  recommendation: Lightbulb,
  learning: Brain,
}

const TIMELINE_ICON: Record<string, typeof Activity> = {
  indexed: Layers,
  health: Activity,
  risk: AlertTriangle,
  architecture: Layers,
  documentation: BookOpen,
  dependencies: Package,
  repository: GitBranch,
  recommendation: Lightbulb,
  learning: Brain,
}

function scoreTone(score: number): string {
  if (score >= 80) return 'text-emerald-400'
  if (score >= 60) return 'text-fx-gold'
  return 'text-amber-400'
}

function Section({ title, hint, action, children }: {
  title: string
  hint?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <div>
          <span className="fx-caption text-muted-foreground">{title}</span>
          {hint ? <p className="mt-0.5 text-xs text-muted-foreground/70">{hint}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function MetricRows({ items }: { items: { label: string; metric: ScoredMetric }[] }) {
  return (
    <div className="divide-y divide-border/50 border-t border-border/50">
      {items.map(({ label, metric }) => (
        <details key={label} className="group py-3">
          <summary className="flex cursor-pointer list-none items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
            <span className={cn('font-display text-sm tabular-nums', scoreTone(metric.score))}>{metric.score}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform group-open:rotate-90" />
          </summary>
          <ul className="mt-2 space-y-1 pl-1">
            {metric.reasons.map((reason, index) => (
              <li key={`${reason.reason}-${index}`} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span
                  className={cn(
                    'mt-1.5 h-1 w-1 shrink-0 rounded-full',
                    reason.impact === 'positive'
                      ? 'bg-emerald-400/80'
                      : reason.impact === 'negative'
                        ? 'bg-amber-400/80'
                        : 'bg-muted-foreground/50'
                  )}
                />
                <span>{reason.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  )
}

export function WorkspaceIntelligence({ workspaceId, path }: { workspaceId: string; path?: string }) {
  const intel = useIntelligenceStore((s) => s.intelligence[workspaceId])
  const recommendations = useIntelligenceStore((s) => s.recommendations[workspaceId]) || []
  const timeline = useIntelligenceStore((s) => s.timeline[workspaceId]) || []
  const loading = useIntelligenceStore((s) => s.loading[workspaceId])
  const load = useIntelligenceStore((s) => s.load)
  const refresh = useIntelligenceStore((s) => s.refresh)

  useEffect(() => {
    load(workspaceId)
  }, [workspaceId, load])

  const evolution = useMemo(() => (intel ? buildEvolutionChain(intel, null) : []), [intel])

  if (!intel) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <Layers className="h-6 w-6 text-muted-foreground" />
        <p className="font-display text-base">{loading ? 'Reading the workspace…' : 'No intelligence yet'}</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {loading
            ? 'Analysing architecture, health, risk and momentum.'
            : path
              ? 'Index this workspace to generate its intelligence profile.'
              : 'This workspace has no folder attached.'}
        </p>
        {!loading && path ? (
          <button
            onClick={() => refresh(workspaceId)}
            className="mt-2 text-xs text-fx-gold transition-opacity hover:opacity-80"
          >
            Build intelligence
          </button>
        ) : null}
      </div>
    )
  }

  const healthItems = [
    { label: 'Documentation', metric: intel.health.documentationScore },
    { label: 'AI readiness', metric: intel.health.aiReadinessScore },
    { label: 'Architecture', metric: intel.health.architectureScore },
    { label: 'Code organization', metric: intel.health.codeOrganizationScore },
    { label: 'Dependency health', metric: intel.health.dependencyHealth },
    { label: 'Security', metric: intel.health.securityScore },
    { label: 'Maintainability', metric: intel.health.maintainabilityScore },
    { label: 'Performance', metric: intel.health.performanceScore },
  ]

  const riskItems = [
    { label: 'Security', metric: intel.risks.securityRisk },
    { label: 'Dependencies', metric: intel.risks.dependencyRisk },
    { label: 'Maintenance', metric: intel.risks.maintenanceRisk },
    { label: 'Architecture', metric: intel.risks.architectureRisk },
    { label: 'Documentation', metric: intel.risks.documentationRisk },
    { label: 'Configuration', metric: intel.risks.configurationRisk },
    { label: 'Performance', metric: intel.risks.performanceRisk },
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className="fx-reveal mx-auto max-w-5xl space-y-10 px-8 py-8">
        <header className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <span className="fx-caption text-muted-foreground">Workspace intelligence</span>
            <h1 className="mt-1 truncate font-display text-2xl">{intel.profile.projectName}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {intel.contextSummary}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Layers className="h-3 w-3" /> {intel.architectureSummary}
              </span>
              <span className="inline-flex items-center gap-1">
                <GitBranch className="h-3 w-3" /> {intel.repository.branchStatus}
                {intel.repository.dirtyState ? ' · changes' : ' · clean'}
              </span>
              <span className="inline-flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> {intel.insights.currentDevelopmentStage}
              </span>
              <span className="inline-flex items-center gap-1">
                <Shield className="h-3 w-3" /> {intel.insights.confidenceLevel} confidence
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <div className="text-right">
              <div className={cn('font-display text-3xl tabular-nums leading-none', scoreTone(intel.health.overallWorkspaceHealth.score))}>
                {intel.health.overallWorkspaceHealth.score}
              </div>
              <div className="fx-caption mt-1 text-muted-foreground">overall health</div>
            </div>
            <button
              onClick={() => refresh(workspaceId)}
              className="rounded-full p-2 text-muted-foreground transition-colors hover:text-fx-gold"
              aria-label="Rebuild intelligence"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </button>
          </div>
        </header>

        <div className="grid gap-x-10 gap-y-10 lg:grid-cols-2">
          <Section title="Health" hint="Every score explains itself — expand for reasons">
            <MetricRows items={healthItems} />
          </Section>

          <Section title="Risk engine" hint="Lower is riskier">
            <MetricRows items={riskItems} />
          </Section>
        </div>

        <Section
          title="Recommended next steps"
          hint={`${recommendations.length} derived from current intelligence`}
        >
          {recommendations.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Nothing needs attention right now.
            </p>
          ) : (
            <div className="divide-y divide-border/50 border-t border-border/50">
              {recommendations.map((rec) => (
                <div key={rec.id} className="group flex items-start gap-4 py-3.5">
                  <span
                    className={cn(
                      'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                      rec.priority === 'high'
                        ? 'bg-red-400'
                        : rec.priority === 'medium'
                          ? 'bg-amber-400'
                          : 'bg-emerald-400'
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-medium">{rec.title}</span>
                      <span className="fx-caption text-muted-foreground">{rec.category}</span>
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{rec.detail}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground/70">
                      <span className="text-fx-gold/80">Why:</span> {rec.why}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground/60">
                    {rec.metric} · {rec.impact}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Evolution" hint="Observation → reasoning → insight → recommendation → learning">
          <div className="space-y-3 border-t border-border/50 pt-4">
            {evolution.map((step) => {
              const Icon = STAGE_ICON[step.stage] || Activity
              return (
                <div key={step.stage} className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fx-gold/70" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium capitalize">{step.stage}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{step.content}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </Section>

        <div className="grid gap-x-10 gap-y-10 lg:grid-cols-2">
          <Section title="Strengths">
            <ul className="space-y-1.5 border-t border-border/50 pt-4">
              {(intel.insights.strengths.length ? intel.insights.strengths : ['No strengths recorded yet']).map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
                  {item}
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Weaknesses">
            <ul className="space-y-1.5 border-t border-border/50 pt-4">
              {(intel.insights.weaknesses.length ? intel.insights.weaknesses : ['No weaknesses recorded yet']).map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
                  {item}
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <Section title="Intelligence timeline" hint="What changed, when it changed">
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
          ) : (
            <div className="space-y-3 border-t border-border/50 pt-4">
              {timeline.slice(0, 12).map((event: TimelineEvent) => {
                const Icon = TIMELINE_ICON[event.kind] || Activity
                return (
                  <div key={event.id} className="flex items-start gap-3">
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-xs">{event.title}</p>
                        <span className="shrink-0 text-[10px] text-muted-foreground/70">
                          {formatRelativeTime(event.createdAt)}
                        </span>
                      </div>
                      {event.detail ? (
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{event.detail}</p>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/50 pt-5 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <FileText className="h-3 w-3" /> {intel.complexity.estimatedProjectSize} · {intel.complexity.complexity} complexity
          </span>
          <span className="inline-flex items-center gap-1">
            <Package className="h-3 w-3" />
            {Object.values(intel.profile.dependencies || {}).reduce((n, map) => n + Object.keys(map || {}).length, 0)} dependencies
          </span>
          <span className="inline-flex items-center gap-1">
            <BookOpen className="h-3 w-3" />
            {intel.profile.configFiles.length} config files
          </span>
          <span className="ml-auto">Generated {formatRelativeTime(intel.generatedAt)}</span>
        </div>
      </div>
    </div>
  )
}

export default WorkspaceIntelligence

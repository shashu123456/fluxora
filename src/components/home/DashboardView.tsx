import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Brain,
  Check,
  ChevronRight,
  CircleDot,
  Clock,
  GitBranch,
  Layers,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  TrendingUp,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn, formatRelativeTime } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { useChatStore } from '@/stores/chatStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useIntelligenceStore } from '@/stores/intelligenceStore'
import { useDeveloperStore } from '@/stores/developerStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type { Recommendation, TimelineEvent, WorkspaceIntelligence } from '@/types/workspaceIntelligence'
import { TerminalActivityCard } from '@/components/home/TerminalActivityCard'

const EMPTY_RECS: Recommendation[] = []
const EMPTY_TIMELINE: TimelineEvent[] = []

const RISK_LABELS: { key: keyof WorkspaceIntelligence['risks']; label: string }[] = [
  { key: 'securityRisk', label: 'Security' },
  { key: 'dependencyRisk', label: 'Dependencies' },
  { key: 'maintenanceRisk', label: 'Maintenance' },
  { key: 'architectureRisk', label: 'Architecture' },
  { key: 'documentationRisk', label: 'Documentation' },
  { key: 'configurationRisk', label: 'Configuration' },
  { key: 'performanceRisk', label: 'Performance' },
]

const TIMELINE_ICON: Record<string, typeof Activity> = {
  indexed: Layers,
  health: Activity,
  risk: AlertTriangle,
  architecture: Layers,
  documentation: BookOpen,
  dependencies: CircleDot,
  repository: GitBranch,
  recommendation: Sparkles,
  learning: Brain,
}

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return 'Working late'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function scoreTone(score: number): string {
  if (score >= 80) return 'text-emerald-400'
  if (score >= 60) return 'text-fx-gold'
  return 'text-amber-400'
}

function HealthDial({ score }: { score: number }) {
  const radius = 34
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100)
  return (
    <div className="relative h-[88px] w-[88px] shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth="3" />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke="hsl(var(--fx-gold))"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('font-display text-xl tabular-nums', scoreTone(score))}>{score}</span>
        <span className="fx-caption text-muted-foreground">health</span>
      </div>
    </div>
  )
}

function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <span className="fx-caption text-muted-foreground">{children}</span>
      {action}
    </div>
  )
}

function Meter({ value }: { value: number }) {
  return (
    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className="h-full rounded-full bg-fx-gold/70 transition-[width] duration-500"
        style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
      />
    </div>
  )
}

function Signal({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="fx-caption text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-display text-lg leading-tight">{value}</div>
      {hint ? <div className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  )
}

export function DashboardView() {
  const setActiveTab = useUIStore((s) => s.setActiveTab)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace)
  const selectWorkspace = useWorkspaceStore((s) => s.selectWorkspace)
  const focusWorkspace = useWorkspaceStore((s) => s.focusWorkspace)
  const chats = useChatStore((s) => s.chats)
  const setCurrentChat = useChatStore((s) => s.setCurrentChat)
  const loadChats = useChatStore((s) => s.loadChats)
  const lastWorkspaceId = useSettingsStore((s) => s.settings.lastWorkspaceId)

  const activeWsId = currentWorkspace?.id || lastWorkspaceId || workspaces[0]?.id || 'global'
  const intel = useIntelligenceStore((s) => s.intelligence[activeWsId])
  const recommendations = useIntelligenceStore((s) => s.recommendations[activeWsId] || EMPTY_RECS)
  const timeline = useIntelligenceStore((s) => s.timeline[activeWsId] || EMPTY_TIMELINE)
  const loading = useIntelligenceStore((s) => s.loading[activeWsId])
  const loadIntelligence = useIntelligenceStore((s) => s.load)
  const refreshIntelligence = useIntelligenceStore((s) => s.refresh)
  const briefing = useDeveloperStore((s) => s.briefing)
  const loadBriefing = useDeveloperStore((s) => s.loadBriefing)
  const track = useDeveloperStore((s) => s.track)
  const [dismissedRecs, setDismissedRecs] = useState<string[]>([])

  useEffect(() => {
    void loadBriefing(activeWsId)
  }, [activeWsId, loadBriefing])

  useEffect(() => {
    if (!activeWsId) return
    loadIntelligence(activeWsId)
    loadChats(activeWsId).catch(() => {})
  }, [activeWsId, loadIntelligence, loadChats])

  const recentChats = useMemo(
    () => [...chats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5),
    [chats]
  )

  const topRecommendations = useMemo(
    () => recommendations.filter((rec) => !dismissedRecs.includes(rec.id)).slice(0, 4),
    [recommendations, dismissedRecs]
  )

  const risks = useMemo(() => {
    if (!intel) return []
    return RISK_LABELS
      .map(({ key, label }) => ({ label, ...intel.risks[key] }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 4)
  }, [intel])

  const healthDims = useMemo(() => {
    if (!intel) return []
    const h = intel.health
    return [
      { label: 'AI readiness', value: h.aiReadinessScore },
      { label: 'Architecture', value: h.architectureScore },
      { label: 'Documentation', value: h.documentationScore },
      { label: 'Security', value: h.securityScore },
    ]
  }, [intel])

  const openWorkspacePanel = (panel: 'intelligence' | 'brain' | 'explorer' | 'terminal-git') => {
    if (activeWsId && activeWsId !== 'global') focusWorkspace(activeWsId, panel)
    setActiveTab('workspace')
  }

  const openChat = (chatId: string) => {
    setCurrentChat(chatId)
    setActiveTab('chat')
  }

  const hasWorkspace = activeWsId !== 'global' && !!intel

  return (
    <div className="h-full overflow-y-auto">
      <div className="fx-reveal mx-auto max-w-6xl space-y-10 px-10 py-10">
        <header className="space-y-6">
          <div className="flex items-center justify-between">
            <span className="fx-caption text-muted-foreground">
              Mission Control · {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
            </span>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 gap-2 text-xs text-muted-foreground hover:text-foreground">
                    <Layers className="h-3.5 w-3.5" />
                    {currentWorkspace?.name || 'Select workspace'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {workspaces.length === 0 ? (
                    <DropdownMenuItem disabled>
                      No workspaces yet
                    </DropdownMenuItem>
                  ) : (
                    workspaces.map((ws) => (
                      <DropdownMenuItem
                        key={ws.id}
                        onSelect={() => selectWorkspace(ws.id)}
                        className={cn(ws.id === activeWsId && 'text-fx-gold')}
                      >
                        <span className="truncate">{ws.name}</span>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Refresh intelligence"
                onClick={() => activeWsId && activeWsId !== 'global' && refreshIntelligence(activeWsId)}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              </Button>
            </div>
          </div>

          <div className="flex items-start justify-between gap-8">
            <div className="min-w-0 max-w-3xl">
              <div className="fx-caption text-fx-gold/80">{greeting()}</div>
              <h1 className="mt-1 truncate font-display text-3xl leading-tight">
                {currentWorkspace?.name || 'Mission Control'}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {intel?.contextSummary ||
                  'Open a workspace to let Fluxora read the project and tell you what matters next.'}
              </p>
            </div>
            <HealthDial score={intel?.health.overallWorkspaceHealth.score ?? 0} />
          </div>

          {hasWorkspace && (
            <div className="grid grid-cols-2 gap-x-8 gap-y-6 border-y border-border/60 py-6 md:grid-cols-4">
              <Signal
                label="Architecture"
                value={intel.architectureSummary}
                hint={intel.profile.projectType}
              />
              <Signal
                label="Stage"
                value={intel.insights.currentDevelopmentStage}
                hint={`${intel.insights.confidenceLevel} confidence`}
              />
              <Signal
                label="Repository"
                value={intel.repository.dirtyState ? 'Changes pending' : 'Clean tree'}
                hint={intel.repository.branchStatus}
              />
              <Signal
                label="Complexity"
                value={intel.complexity.complexity}
                hint={intel.complexity.estimatedProjectSize}
              />
            </div>
          )}
        </header>

        {briefing ? (
          <section className="fx-enter rounded-2xl border border-fx-gold/15 bg-fx-gold/[0.04] px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg leading-snug">{briefing.sinceLabel}</p>
                <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
                  {briefing.lines.map((line) => (
                    <span key={line} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="h-1 w-1 rounded-full bg-fx-gold/60" />
                      {line}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-relaxed text-foreground/80">
                  <span className="text-fx-gold/90">Today's focus</span>
                  <span className="mx-1.5 text-muted-foreground/40">·</span>
                  {briefing.focus}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setActiveTab('developer')}
              >
                Your profile
                <ArrowRight className="ml-1.5 h-3 w-3" />
              </Button>
            </div>
          </section>
        ) : null}

        <TerminalActivityCard workspaceId={activeWsId} />

        {!hasWorkspace ? (
          <div className="rounded-2xl border border-dashed border-border/70 px-8 py-14 text-center">
            <Layers className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-4 font-display text-lg">No workspace indexed yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Open a folder to build its intelligence — architecture, health, risks and next actions.
            </p>
            <Button variant="outline" size="sm" className="mt-5" onClick={() => setActiveTab('workspace')}>
              Open a workspace
            </Button>
          </div>
        ) : (
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <div className="space-y-10">
              <section>
                <SectionLabel
                  action={
                    <button
                      className="text-xs text-muted-foreground transition-colors hover:text-fx-gold"
                      onClick={() => openWorkspacePanel('intelligence')}
                    >
                      All recommendations
                    </button>
                  }
                >
                  What to work on
                </SectionLabel>
                {topRecommendations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing pressing — the project reads healthy.</p>
                ) : (
                  <div className="divide-y divide-border/50 border-t border-border/50">
                    {topRecommendations.map((rec) => (
                      <div key={rec.id} className="fx-row group flex w-full items-start gap-2 py-3.5">
                        <button
                          onClick={() => {
                            track('recommendation_accepted', {
                              key: rec.category,
                              workspaceId: activeWsId,
                            })
                            openWorkspacePanel(rec.category === 'dependencies' ? 'explorer' : 'intelligence')
                          }}
                          className="flex min-w-0 flex-1 items-start gap-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-fx-gold/30"
                        >
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
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">{rec.title}</span>
                              <span className="fx-caption shrink-0 text-muted-foreground">{rec.category}</span>
                            </span>
                            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                              {rec.why}
                            </span>
                          </span>
                          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-fx-gold" />
                        </button>
                        <div className="flex shrink-0 items-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground/60 hover:text-emerald-400"
                            aria-label="Accept recommendation"
                            onClick={() => {
                              track('recommendation_accepted', {
                                key: rec.category,
                                workspaceId: activeWsId,
                              })
                              openWorkspacePanel(rec.category === 'dependencies' ? 'explorer' : 'intelligence')
                            }}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground/60 hover:text-foreground"
                            aria-label="Dismiss recommendation"
                            onClick={() => {
                              track('recommendation_ignored', {
                                key: rec.category,
                                workspaceId: activeWsId,
                              })
                              setDismissedRecs((current) => [...current, rec.id])
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <SectionLabel
                  action={
                    <button
                      className="text-xs text-muted-foreground transition-colors hover:text-fx-gold"
                      onClick={() => openWorkspacePanel('intelligence')}
                    >
                      Risk engine
                    </button>
                  }
                >
                  Where risk lives
                </SectionLabel>
                <div className="space-y-4 border-t border-border/50 pt-4">
                  {risks.map((risk) => (
                    <div key={risk.label}>
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-sm">{risk.label}</span>
                        <span className={cn('font-display text-sm tabular-nums', scoreTone(risk.score))}>
                          {risk.score}
                        </span>
                      </div>
                      <Meter value={risk.score} />
                      <p className="mt-1.5 truncate text-xs text-muted-foreground">
                        {risk.reasons[0]?.reason || 'No signals'}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <SectionLabel>Continue</SectionLabel>
                {recentChats.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Start a new chat to begin organizing your work.</p>
                ) : (
                  <div className="divide-y divide-border/50 border-t border-border/50">
                    {recentChats.map((chat) => (
                      <button
                        key={chat.id}
                        onClick={() => openChat(chat.id)}
                        className="fx-row group flex w-full items-center gap-3 py-2.5 text-left"
                      >
                        <TerminalSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-sm">{chat.title || 'Untitled'}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatRelativeTime(chat.updatedAt)}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-fx-gold" />
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <aside className="space-y-10">
              <section>
                <SectionLabel
                  action={
                    <button
                      className="text-xs text-muted-foreground transition-colors hover:text-fx-gold"
                      onClick={() => openWorkspacePanel('intelligence')}
                    >
                      Details
                    </button>
                  }
                >
                  Health
                </SectionLabel>
                <div className="space-y-3 border-t border-border/50 pt-4">
                  {healthDims.map((dim) => (
                    <div key={dim.label}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-xs text-muted-foreground">{dim.label}</span>
                        <span className={cn('text-xs tabular-nums', scoreTone(dim.value.score))}>
                          {dim.value.score}
                        </span>
                      </div>
                      <Meter value={dim.value.score} />
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <SectionLabel>Intelligence changes</SectionLabel>
                {timeline.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No changes recorded yet. Re-indexing the workspace starts the timeline.
                  </p>
                ) : (
                  <div className="space-y-3 border-t border-border/50 pt-4">
                    {timeline.slice(0, 5).map((event) => {
                      const Icon = TIMELINE_ICON[event.kind] || Activity
                      return (
                        <div key={event.id} className="flex items-start gap-2.5">
                          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fx-gold/70" />
                          <div className="min-w-0">
                            <p className="truncate text-xs leading-snug">{event.title}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {formatRelativeTime(event.createdAt)}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              <section>
                <SectionLabel>Project shape</SectionLabel>
                <div className="space-y-2.5 border-t border-border/50 pt-4 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Stack</span>
                    <span className="truncate text-right">
                      {intel.profile.frameworks.slice(0, 3).join(', ') || 'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Languages</span>
                    <span className="truncate text-right">
                      {intel.profile.languages.slice(0, 3).map((l) => l.lang).join(', ') || 'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Packages</span>
                    <span className="truncate text-right">
                      {Object.values(intel.profile.dependencies || {}).reduce(
                        (n, map) => n + Object.keys(map || {}).length,
                        0
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Strengths</span>
                    <span className="truncate text-right">
                      {intel.insights.strengths[0] || 'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Weakness</span>
                    <span className="truncate text-right">
                      {intel.insights.weaknesses[0] || 'None detected'}
                    </span>
                  </div>
                </div>
              </section>

              <section>
                <SectionLabel>Go deeper</SectionLabel>
                <div className="space-y-1 border-t border-border/50 pt-3">
                  <button
                    onClick={() => openWorkspacePanel('intelligence')}
                    className="fx-row flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-xs"
                  >
                    <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                    Workspace intelligence
                  </button>
                  <button
                    onClick={() => openWorkspacePanel('brain')}
                    className="fx-row flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-xs"
                  >
                    <Brain className="h-3.5 w-3.5 text-muted-foreground" />
                    Project brain
                  </button>
                  <button
                    onClick={() => setActiveTab('visualizations')}
                    className="fx-row flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-xs"
                  >
                    <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                    Evolution timeline
                  </button>
                </div>
              </section>

              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <ShieldCheck className="h-3 w-3" />
                Derived from local workspace data
                <Clock className="ml-auto h-3 w-3" />
                {intel ? formatRelativeTime(intel.generatedAt) : 'not indexed'}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}

export default DashboardView

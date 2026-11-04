import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  BookMarked,
  Boxes,
  Brain,
  Clock,
  GitBranch,
  Network,
  RefreshCw,
  Sparkles,
  Workflow,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PageHeader } from '@/components/layout/PageHeader'
import { cn, formatRelativeTime } from '@/lib/utils'
import { useChatStore } from '@/stores/chatStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useIntelligenceStore } from '@/stores/intelligenceStore'
import { buildEvolutionChain } from '@/lib/intelligence/evolution'
import type { MemoryEntry, ProjectBrainEntry, WorkspaceIndex } from '@/types'
import {
  buildDependencyGraph,
  buildKnowledgeGraph,
  buildTimeline,
  buildWorkspaceGraph,
  groupByDay,
  layoutGraph,
  memoryBuckets,
  timelineStats,
  spanInDays,
  type Graph,
  type TimelineKind,
} from '@/lib/visualization'

const KIND_COLOR: Record<TimelineKind, string> = {
  chat: 'hsl(var(--fx-gold))',
  memory: 'hsl(160 45% 45%)',
  brain: 'hsl(265 65% 70%)',
}

const NODE_FILL: Record<string, string> = {
  root: 'hsl(var(--fx-gold))',
  hub: 'hsl(var(--fx-gold))',
  manager: 'hsl(265 65% 70%)',
  workspace: 'hsl(var(--fx-gold))',
  framework: 'hsl(160 45% 45%)',
  memory: 'hsl(160 45% 45%)',
  decision: 'hsl(265 65% 70%)',
  architecture: 'hsl(210 70% 65%)',
  convention: 'hsl(30 80% 60%)',
  todo: 'hsl(0 70% 62%)',
  note: 'hsl(var(--fx-gold))',
  tag: 'hsl(var(--fx-champagne))',
  dependency: 'hsl(210 40% 60%)',
}

function fmtDay(day: string): string {
  const d = new Date(`${day}T00:00:00`)
  if (Number.isNaN(d.getTime())) return day
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function GraphCanvas({ graph, rootId, width = 760, height = 440 }: { graph: Graph; rootId: string; width?: number; height?: number }) {
  const positions = useMemo(() => layoutGraph(graph, rootId, width, height), [graph, rootId, width, height])
  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes])

  if (graph.nodes.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Nothing to visualize yet.</p>
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="mx-auto block h-auto w-full max-w-[900px]" role="img" aria-label="Graph visualization">
        <g>
          {graph.edges.map((e, i) => {
            const a = positions[e.from]
            const b = positions[e.to]
            if (!a || !b) return null
            return (
              <line
                key={`${e.from}-${e.to}-${i}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="hsl(var(--fx-gold) / 0.22)"
                strokeWidth={1}
              />
            )
          })}
        </g>
        <g>
          {graph.nodes.map((n) => {
            const p = positions[n.id]
            if (!p) return null
            const fill = NODE_FILL[n.kind] ?? 'hsl(var(--fx-champagne))'
            const isHub = n.kind === 'root' || n.kind === 'hub'
            return (
              <g key={n.id}>
                <circle cx={p.x} cy={p.y} r={n.size} fill={fill} fillOpacity={isHub ? 0.95 : 0.78} stroke="hsl(var(--fx-gold) / 0.5)" strokeWidth={1} />
                <text
                  x={p.x}
                  y={p.y + n.size + 12}
                  textAnchor="middle"
                  className="fill-foreground"
                  fontSize={n.size >= 13 ? 11 : 9.5}
                >
                  {n.label.length > 22 ? `${n.label.slice(0, 22)}…` : n.label}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
      <p className="mt-1 text-center text-[11px] text-muted-foreground">
        {graph.nodes.length} nodes · {graph.edges.length} links
      </p>
    </div>
  )
}

function StatCards({ stats }: { stats: { label: string; value: number }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <Card key={s.label} className="border-border/60">
          <CardContent className="px-4 py-3">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-xl font-semibold tabular-nums">{s.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function VisualizationsView() {
  const chats = useChatStore((s) => s.chats)
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace)
  const workspaces = useWorkspaceStore((s) => s.workspaces)

  const wsId = currentWorkspace?.id ?? 'global'
  const intel = useIntelligenceStore((s) => s.intelligence[wsId])
  const recommendations = useIntelligenceStore((s) => s.recommendations[wsId]) || []
  const intelTimeline = useIntelligenceStore((s) => s.timeline[wsId]) || []
  const [memories, setMemories] = useState<MemoryEntry[]>([])
  const [brain, setBrain] = useState<ProjectBrainEntry[]>([])
  const [index, setIndex] = useState<WorkspaceIndex | null>(null)
  const [wsIndex, setWsIndex] = useState<Record<string, { fileCount?: number; frameworks?: string[] }>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [m, b, idx] = await Promise.all([
        window.api.memory.list(wsId).catch(() => [] as MemoryEntry[]),
        window.api.brain.list(wsId).catch(() => [] as ProjectBrainEntry[]),
        wsId === 'global' ? Promise.resolve(null) : window.api.workspace.getIndex(wsId).catch(() => null),
      ])
      setMemories(m)
      setBrain(b)
      setIndex(idx)

      if (wsId !== 'global') {
        try {
          await useIntelligenceStore.getState().load(wsId)
        } catch {
          /* intelligence unavailable */
        }
      }

      const activity: Record<string, { fileCount?: number; frameworks?: string[] }> = {}
      await Promise.all(
        workspaces.map(async (w) => {
          if (!w.path) return
          const wi = await window.api.workspace.getIndex(w.id).catch(() => null)
          if (wi) activity[w.id] = { fileCount: wi.fileCount, frameworks: wi.frameworks }
        })
      )
      setWsIndex(activity)
    } catch (e: any) {
      setError(e?.message || 'Failed to load visualization data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId])

  const timeline = useMemo(() => buildTimeline(chats, memories, brain), [chats, memories, brain])
  const days = useMemo(() => groupByDay(timeline), [timeline])
  const memDays = useMemo(() => memoryBuckets(memories), [memories])
  const knowledge = useMemo(() => buildKnowledgeGraph(brain, memories), [brain, memories])
  const dependency = useMemo(() => (index ? buildDependencyGraph(index) : { nodes: [], edges: [] }), [index])
  const wsGraph = useMemo(() => buildWorkspaceGraph(workspaces, wsIndex), [workspaces, wsIndex])
  const stats = useMemo(() => timelineStats(timeline), [timeline])
  const span = useMemo(() => spanInDays(timeline), [timeline])
  const maxMemDay = useMemo(() => Math.max(1, ...memDays.map((b) => b.count)), [memDays])
  const evolution = useMemo(() => (intel ? buildEvolutionChain(intel, null) : []), [intel])
  const intelHealth = useMemo(
    () =>
      intel
        ? [
            { label: 'Overall', metric: intel.health.overallWorkspaceHealth },
            { label: 'Documentation', metric: intel.health.documentationScore },
            { label: 'AI readiness', metric: intel.health.aiReadinessScore },
            { label: 'Architecture', metric: intel.health.architectureScore },
            { label: 'Organization', metric: intel.health.codeOrganizationScore },
            { label: 'Dependencies', metric: intel.health.dependencyHealth },
            { label: 'Security', metric: intel.health.securityScore },
            { label: 'Maintainability', metric: intel.health.maintainabilityScore },
            { label: 'Performance', metric: intel.health.performanceScore },
          ]
        : [],
    [intel]
  )

  return (
    <div className="flex h-full flex-col overflow-hidden p-6 app-no-drag">
      <PageHeader
        eyebrow="Insight"
        title="Visualizations"
        description="Timelines and graphs across chats, memory, project brain and dependencies."
        icon={Activity}
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
        }
      />

      {error && (
        <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      <Tabs defaultValue="timeline" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mb-3 h-auto w-fit flex-wrap">
          <TabsTrigger value="timeline">
            <Clock className="h-3.5 w-3.5" /> Timeline
          </TabsTrigger>
          <TabsTrigger value="memory">
            <BookMarked className="h-3.5 w-3.5" /> Memory timeline
          </TabsTrigger>
          <TabsTrigger value="knowledge">
            <Network className="h-3.5 w-3.5" /> Knowledge graph
          </TabsTrigger>
          <TabsTrigger value="dependency">
            <GitBranch className="h-3.5 w-3.5" /> Dependency graph
          </TabsTrigger>
          <TabsTrigger value="workspace">
            <Workflow className="h-3.5 w-3.5" /> Workspace graph
          </TabsTrigger>
          <TabsTrigger value="intelligence">
            <Brain className="h-3.5 w-3.5" /> Intelligence
          </TabsTrigger>
        </TabsList>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <>
            <TabsContent value="timeline" className="mt-0 space-y-4">
              <StatCards stats={stats} />
              <p className="text-xs text-muted-foreground">
                {days.length} active days · last {span} day{span === 1 ? '' : 's'}
              </p>
              <ScrollArea className="h-[calc(100%-8.5rem)] min-h-[200px] pr-3">
                {days.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No activity yet.</p>
                ) : (
                  <div className="space-y-5">
                    {days.map((bucket) => (
                      <div key={bucket.day}>
                        <div className="mb-2 flex items-center gap-2">
                          <Badge variant="outline" className="text-[11px]">{fmtDay(bucket.day)}</Badge>
                          <span className="text-[11px] text-muted-foreground">{bucket.events.length} events</span>
                        </div>
                        <ul className="ml-2 space-y-1.5 border-l border-border/60 pl-4">
                          {bucket.events.map((e) => (
                            <li key={e.id} className="relative flex items-start gap-2 text-sm">
                              <span
                                className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full"
                                style={{ background: KIND_COLOR[e.kind] }}
                              />
                              <span className="w-12 shrink-0 text-[11px] tabular-nums text-muted-foreground">{fmtTime(e.timestamp)}</span>
                              <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-[10px] capitalize">{e.kind}</Badge>
                              <span className="min-w-0 flex-1 truncate" title={e.title}>{e.title}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="memory" className="mt-0 space-y-4">
              {memDays.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No memories recorded yet.</p>
              ) : (
                <>
                  <Card className="border-border/60">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Memories created per day</CardTitle>
                      <CardDescription className="text-xs">{memories.length} total · {memDays.length} active days</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex h-40 items-end gap-1">
                        {memDays.map((b) => (
                          <div
                            key={b.day}
                            className="group relative min-w-[6px] flex-1 rounded-t-sm bg-fx-gold/70 transition-all hover:bg-fx-gold"
                            style={{ height: `${Math.max(6, (b.count / maxMemDay) * 100)}%` }}
                            title={`${fmtDay(b.day)}: ${b.count} memories${b.pinned ? ` (${b.pinned} pinned)` : ''}`}
                          />
                        ))}
                      </div>
                      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                        <span>{fmtDay(memDays[0].day)}</span>
                        <span>{fmtDay(memDays[memDays.length - 1].day)}</span>
                      </div>
                    </CardContent>
                  </Card>
                  <ScrollArea className="h-[calc(100%-14rem)] min-h-[160px] pr-3">
                    <ul className="space-y-2">
                      {[...memDays].reverse().map((b) => (
                        <li key={b.day} className="flex items-center gap-3 text-sm">
                          <span className="w-28 shrink-0 text-xs tabular-nums text-muted-foreground">{fmtDay(b.day)}</span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-fx-gold" style={{ width: `${(b.count / maxMemDay) * 100}%` }} />
                          </div>
                          <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                            {b.count}{b.pinned ? ` · ${b.pinned}★` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                </>
              )}
            </TabsContent>

            <TabsContent value="knowledge" className="mt-0">
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Network className="h-4 w-4 text-fx-gold" /> Project knowledge graph
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Brain entries and memories linked through shared tags.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <GraphCanvas graph={knowledge} rootId={knowledge.nodes[0]?.id ?? ''} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="dependency" className="mt-0">
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <GitBranch className="h-4 w-4 text-fx-gold" /> Dependency graph
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {index
                      ? `${Object.keys(index.dependencies).length} package manager(s) · indexed ${new Date(index.indexedAt).toLocaleString()}`
                      : 'No workspace index yet — run “Index workspace” first.'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <GraphCanvas graph={dependency} rootId="root" height={460} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="workspace" className="mt-0">
              <Card className="border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Boxes className="h-4 w-4 text-fx-gold" /> Workspace graph
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Workspaces sized by project files, linked to shared frameworks.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <GraphCanvas graph={wsGraph} rootId="hub:all" />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="intelligence" className="mt-0 space-y-4">
              {!intel ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No intelligence profile yet — index this workspace to see its evolution.
                </p>
              ) : (
                <>
                  <StatCards
                    stats={[
                      { label: 'Overall health', value: intel.health.overallWorkspaceHealth.score },
                      { label: 'AI readiness', value: intel.health.aiReadinessScore.score },
                      { label: 'Recommendations', value: recommendations.length },
                      { label: 'Changes tracked', value: intelTimeline.length },
                    ]}
                  />

                  <div className="grid gap-3 lg:grid-cols-2">
                    <Card className="border-border/60">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                          <Sparkles className="h-4 w-4 text-fx-gold" /> Architecture overview
                        </CardTitle>
                        <CardDescription className="text-xs">{intel.architectureSummary}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2 text-xs text-muted-foreground">
                        <p><span className="text-foreground">{intel.profile.projectType}</span> · {intel.profile.category}</p>
                        <p>Pattern: <span className="text-foreground">{intel.profile.architecturePattern}</span></p>
                        <p>Stack: <span className="text-foreground">{intel.profile.frameworks.join(', ') || 'unclassified'}</span></p>
                        <p>
                          Complexity: <span className="text-foreground">{intel.complexity.complexity}</span> · {intel.complexity.estimatedProjectSize}
                        </p>
                        <p>Stage: <span className="text-foreground">{intel.insights.currentDevelopmentStage}</span> · {intel.insights.confidenceLevel} confidence</p>
                      </CardContent>
                    </Card>

                    <Card className="border-border/60">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                          <Activity className="h-4 w-4 text-fx-gold" /> Health trend
                        </CardTitle>
                        <CardDescription className="text-xs">Current dimension scores with their reasons.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-1.5">
                        {intelHealth.map(({ label, metric }) => (
                          <div key={label} className="flex items-center gap-3" title={metric.reasons.map((r) => r.reason).join(' · ')}>
                            <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-fx-gold/80" style={{ width: `${metric.score}%` }} />
                            </div>
                            <span className="w-8 shrink-0 text-right text-xs tabular-nums">{metric.score}</span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <Card className="border-border/60">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                          <Brain className="h-4 w-4 text-fx-gold" /> Project evolution
                        </CardTitle>
                        <CardDescription className="text-xs">Observation → reasoning → insight → recommendation → learning.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ol className="space-y-2.5 border-l border-border/60 pl-4">
                          {evolution.map((step) => (
                            <li key={step.stage} className="relative">
                              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-fx-gold/70" />
                              <p className="text-xs font-medium capitalize">{step.stage}</p>
                              <p className="text-xs text-muted-foreground">{step.content}</p>
                            </li>
                          ))}
                        </ol>
                      </CardContent>
                    </Card>

                    <Card className="border-border/60">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                          <Clock className="h-4 w-4 text-fx-gold" /> Recent changes
                        </CardTitle>
                        <CardDescription className="text-xs">{intelTimeline.length} recorded intelligence changes.</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {intelTimeline.length === 0 ? (
                          <p className="py-4 text-center text-xs text-muted-foreground">No changes recorded yet.</p>
                        ) : (
                          <ScrollArea className="h-52 pr-3">
                            <ul className="space-y-2">
                              {intelTimeline.slice(0, 20).map((event) => (
                                <li key={event.id} className="flex items-start justify-between gap-3 text-xs">
                                  <div className="min-w-0">
                                    <p className="truncate">{event.title}</p>
                                    {event.detail ? (
                                      <p className="truncate text-[11px] text-muted-foreground">{event.detail}</p>
                                    ) : null}
                                  </div>
                                  <span className="shrink-0 text-[10px] text-muted-foreground/70">
                                    {formatRelativeTime(event.createdAt)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </ScrollArea>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  <Card className="border-border/60">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <GitBranch className="h-4 w-4 text-fx-gold" /> Repository activity
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {intel.repository.branchStatus} · {intel.repository.dirtyState ? 'uncommitted changes' : 'clean tree'} ·{' '}
                        {intel.repository.gitActivity} activity
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-1.5">
                      {intel.repository.recentlyModifiedAreas.length === 0 ? (
                        <span className="text-xs text-muted-foreground">No modified areas recorded.</span>
                      ) : (
                        intel.repository.recentlyModifiedAreas.map((area) => (
                          <Badge key={area} variant="outline" className="text-[11px]">{area}</Badge>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, ArrowRight, CheckCircle2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn, formatRelativeTime } from '@/lib/utils'
import {
  attentionLabel,
  attentionScore,
  CATEGORY_META,
  groupByCategory,
  mergeInsights,
  primaryConcern,
  SEVERITY_TONE,
} from '@/lib/insights'
import { runInsightAction } from '@/lib/insightActions'
import type { BrainInsight, BrainInsights, InsightCategory } from '@/types'

interface BrainInsightsPanelProps {
  workspaceId: string
}

const FILTERS: { id: InsightCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'action', label: 'Next' },
  { id: 'risk', label: 'Risk' },
  { id: 'observation', label: 'Reading' },
  { id: 'gap', label: 'Gap' },
  { id: 'change', label: 'Changed' },
]

export function BrainInsightsPanel({ workspaceId }: BrainInsightsPanelProps) {
  const [data, setData] = useState<BrainInsights | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<InsightCategory | 'all'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await window.api.brain.insights(workspaceId)
      setData(res || null)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    load()
  }, [load])

  const concern = useMemo(() => primaryConcern(data), [data])
  const score = useMemo(() => attentionScore(data), [data])
  const tone = useMemo(() => attentionLabel(score), [data])
  const merged = useMemo(() => mergeInsights(data), [data])
  const groups = useMemo(() => {
    const list = filter === 'all' ? merged : merged.filter((i) => i.category === filter)
    return groupByCategory(list)
  }, [merged, filter])

  const handle = (insight: BrainInsight) => {
    void runInsightAction(insight, workspaceId)
  }

  const counts = data?.counts

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-fx-gold" />
            <span className="text-sm font-semibold">Intelligence</span>
            <span className={cn('fx-label', tone.tone)}>{tone.label}</span>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load} disabled={loading} aria-label="Refresh insights">
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
        {data && (
          <p className="mt-1.5 text-xs text-muted-foreground">{data.summary}</p>
        )}
        {counts && (
          <div className="mt-3 flex flex-wrap items-center gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] transition-colors',
                  filter === f.id
                    ? 'bg-fx-gold/15 text-fx-gold'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-5 p-4">
          {loading && !data && <p className="py-8 text-center text-xs text-muted-foreground">Reading the workspace…</p>}

          {!loading && merged.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              <p className="text-sm font-medium">Looks healthy</p>
              <p className="max-w-[220px] text-xs text-muted-foreground">
                No gaps, risks or suggested actions right now. Index the workspace to surface deeper reasoning.
              </p>
            </div>
          )}

          {concern && filter === 'all' && merged.length > 0 && (
            <div className="fx-surface rounded-xl p-3.5">
              <p className="fx-label text-muted-foreground">Leads with</p>
              <p className="mt-1 text-sm font-medium">{concern.title}</p>
              {concern.detail && <p className="mt-1 text-xs text-muted-foreground">{concern.detail}</p>}
              {concern.action && (
                <Button size="sm" variant="secondary" className="mt-2 h-7 text-xs" onClick={() => handle(concern)}>
                  {concern.action.label}
                  <ArrowRight className="ml-1.5 h-3 w-3" />
                </Button>
              )}
            </div>
          )}

          {groups.map((group) => {
            const meta = CATEGORY_META[group.category]
            const Icon = meta.icon
            return (
              <section key={group.category}>
                <div className="mb-2 flex items-center gap-2">
                  <Icon className={cn('h-3.5 w-3.5', meta.accent)} />
                  <span className="fx-label text-muted-foreground">{meta.label}</span>
                  <span className="ml-auto text-[11px] tabular-nums text-muted-foreground/60">{group.items.length}</span>
                </div>
                <ul className="divide-y divide-border/50">
                  {group.items.map((insight) => (
                    <li key={insight.id}>
                      <button
                        onClick={() => insight.action && handle(insight)}
                        className={cn(
                          'fx-row group flex w-full items-start gap-2.5 py-2.5 text-left',
                          !insight.action && 'cursor-default'
                        )}
                      >
                        <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', SEVERITY_TONE[insight.severity].dot)} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium leading-snug">{insight.title}</span>
                          {insight.detail && (
                            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{insight.detail}</span>
                          )}
                          {insight.action && (
                            <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-fx-gold opacity-0 transition-opacity group-hover:opacity-100">
                              {insight.action.label}
                              <ArrowRight className="h-3 w-3" />
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}

          {data && (
            <p className="text-[10px] text-muted-foreground/70">
              Generated {formatRelativeTime(data.generatedAt)}
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

export default BrainInsightsPanel

import {
  AlertTriangle,
  FileSearch,
  GitBranch,
  Lightbulb,
  Microscope,
  type LucideIcon,
} from 'lucide-react'
import type { BrainInsight, BrainInsights, InsightCategory, InsightSeverity } from '@/types'

export interface CategoryMeta {
  label: string
  icon: LucideIcon
  accent: string
}

export const CATEGORY_META: Record<InsightCategory, CategoryMeta> = {
  change: { label: 'Changed', icon: GitBranch, accent: 'text-sky-300' },
  gap: { label: 'Gap', icon: FileSearch, accent: 'text-amber-300' },
  risk: { label: 'Risk', icon: AlertTriangle, accent: 'text-red-300' },
  observation: { label: 'Reading', icon: Microscope, accent: 'text-fx-gold' },
  action: { label: 'Next', icon: Lightbulb, accent: 'text-emerald-300' },
}

export const SEVERITY_TONE: Record<InsightSeverity, { dot: string; text: string; rail: string }> = {
  info: { dot: 'bg-muted-foreground/50', text: 'text-muted-foreground', rail: 'bg-border' },
  warning: { dot: 'bg-amber-400', text: 'text-amber-300', rail: 'bg-amber-400/60' },
  critical: { dot: 'bg-red-500', text: 'text-red-400', rail: 'bg-red-500/70' },
}

const SEVERITY_WEIGHT: Record<InsightSeverity, number> = { info: 1, warning: 8, critical: 26 }

/**
 * A single number that answers "which workspace deserves attention?".
 * Evidence-based: critical risks dominate, warnings accumulate, gaps and
 * changes contribute gently. Capped at 100 so it reads like a percentage.
 */
export function attentionScore(insights: BrainInsights | null | undefined): number {
  if (!insights) return 0
  const all = [...(insights.risks || []), ...(insights.gaps || [])]
  const riskWeight = all.reduce((sum, i) => sum + SEVERITY_WEIGHT[i.severity], 0)
  const changeWeight = (insights.changes || []).length * 2
  const actionWeight = Math.min(10, (insights.nextActions || []).length)
  return Math.min(100, Math.round(riskWeight + changeWeight + actionWeight))
}

export function attentionLabel(score: number): { label: string; tone: string } {
  if (score >= 60) return { label: 'Needs attention', tone: 'text-red-300' }
  if (score >= 30) return { label: 'Worth a look', tone: 'text-amber-300' }
  if (score > 0) return { label: 'Settled', tone: 'text-emerald-300' }
  return { label: 'No signals', tone: 'text-muted-foreground' }
}

/** The single most important thing to surface first. */
export function primaryConcern(insights: BrainInsights | null | undefined): BrainInsight | null {
  if (!insights) return null
  const critical = (insights.risks || []).find((i) => i.severity === 'critical')
  if (critical) return critical
  const warningRisk = (insights.risks || []).find((i) => i.severity === 'warning')
  if (warningRisk) return warningRisk
  const warningGap = (insights.gaps || []).find((i) => i.severity === 'warning')
  if (warningGap) return warningGap
  return insights.nextActions?.[0] || null
}

const CATEGORY_ORDER: InsightCategory[] = ['action', 'risk', 'observation', 'gap', 'change']

/** A calm, de-duplicated queue: risks first, then gaps, readings, changes. */
export function mergeInsights(insights: BrainInsights | null | undefined): BrainInsight[] {
  if (!insights) return []
  const seen = new Set<string>()
  const out: BrainInsight[] = []
  const push = (list: BrainInsight[]) => {
    for (const item of list) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      out.push(item)
    }
  }
  push(insights.risks || [])
  push(insights.nextActions || [])
  push(insights.gaps || [])
  push(insights.observations || [])
  push(insights.changes || [])
  return out
}

export function groupByCategory(insights: BrainInsight[]): { category: InsightCategory; items: BrainInsight[] }[] {
  const map = new Map<InsightCategory, BrainInsight[]>()
  for (const item of insights) {
    const list = map.get(item.category) || []
    list.push(item)
    map.set(item.category, list)
  }
  return CATEGORY_ORDER.filter((c) => map.has(c)).map((category) => ({ category, items: map.get(category)! }))
}

export function topicOf(insight: BrainInsight): string {
  if (insight.topic) return insight.topic
  return CATEGORY_META[insight.category].label.toLowerCase()
}

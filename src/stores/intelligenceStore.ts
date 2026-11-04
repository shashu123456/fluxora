import { create } from 'zustand'
import type {
  Recommendation,
  TimelineEvent,
  WorkspaceIntelligence,
} from '../types/workspaceIntelligence'
import type { RecommendationAffinity } from '../types/developer'
import { buildRecommendations } from '../lib/intelligence/recommendations'

async function loadAffinity(): Promise<RecommendationAffinity | undefined> {
  try {
    return await window.api.developer.affinity()
  } catch {
    return undefined
  }
}

async function loadTerminalRecommendations(workspaceId: string): Promise<Recommendation[]> {
  try {
    if (!window.api.terminal?.recommendations) return []
    const result = await window.api.terminal.recommendations(workspaceId)
    return result?.recommendations || []
  } catch {
    return []
  }
}

function mergeRecommendations(base: Recommendation[], extra: Recommendation[]): Recommendation[] {
  const seen = new Set(base.map((item) => item.id))
  return [...base, ...extra.filter((item) => !seen.has(item.id))]
}

/**
 * The single renderer-side owner of Workspace Intelligence.
 *
 * Every module (Mission Control, Smart Context, the Brain panel, the Coding
 * Agent, Visualizations) reads intelligence from here, so the app never
 * analyses a workspace twice and never issues duplicate IPC.
 */
export interface IntelligenceStore {
  intelligence: Record<string, WorkspaceIntelligence>
  recommendations: Record<string, Recommendation[]>
  timeline: Record<string, TimelineEvent[]>
  loading: Record<string, boolean>

  load: (workspaceId: string) => Promise<void>
  refresh: (workspaceId: string) => Promise<void>
  invalidate: (workspaceId: string) => void
}

export const useIntelligenceStore = create<IntelligenceStore>((set, get) => ({
  intelligence: {},
  recommendations: {},
  timeline: {},
  loading: {},

  load: async (workspaceId) => {
    if (!workspaceId || workspaceId === 'global') return
    const state = get()
    if (state.intelligence[workspaceId] && state.timeline[workspaceId]) return
    if (state.loading[workspaceId]) return
    set((s) => ({ loading: { ...s.loading, [workspaceId]: true } }))
    try {
      const [intel, timeline, affinity] = await Promise.all([
        window.api.intelligence.get(workspaceId),
        window.api.intelligence.timeline(workspaceId),
        loadAffinity(),
      ])
      set((s) => ({
        intelligence: intel ? { ...s.intelligence, [workspaceId]: intel } : s.intelligence,
        // Recommendations are derived in-process from the same pure engine the
        // main process uses — no extra IPC, no duplicated logic.
        recommendations: intel
          ? { ...s.recommendations, [workspaceId]: buildRecommendations(intel, affinity) }
          : s.recommendations,
        timeline: { ...s.timeline, [workspaceId]: timeline || [] },
      }))
    } catch {
      /* intelligence unavailable */
    } finally {
      set((s) => ({ loading: { ...s.loading, [workspaceId]: false } }))
    }
  },

  refresh: async (workspaceId) => {
    if (!workspaceId || workspaceId === 'global') return
    set((s) => ({ loading: { ...s.loading, [workspaceId]: true } }))
    try {
      const [intel, timeline, affinity, terminalRecs] = await Promise.all([
        window.api.intelligence.rebuild(workspaceId),
        window.api.intelligence.timeline(workspaceId),
        loadAffinity(),
        loadTerminalRecommendations(workspaceId),
      ])
      set((s) => ({
        intelligence: intel ? { ...s.intelligence, [workspaceId]: intel } : s.intelligence,
        recommendations: intel
          ? {
              ...s.recommendations,
              [workspaceId]: mergeRecommendations(buildRecommendations(intel, affinity), terminalRecs),
            }
          : s.recommendations,
        timeline: { ...s.timeline, [workspaceId]: timeline || [] },
      }))
    } catch {
      /* rebuild failed */
    } finally {
      set((s) => ({ loading: { ...s.loading, [workspaceId]: false } }))
    }
  },

  invalidate: (workspaceId) => {
    set((s) => {
      const intelligence = { ...s.intelligence }
      const recommendations = { ...s.recommendations }
      const timeline = { ...s.timeline }
      delete intelligence[workspaceId]
      delete recommendations[workspaceId]
      delete timeline[workspaceId]
      return { intelligence, recommendations, timeline }
    })
  },
}))

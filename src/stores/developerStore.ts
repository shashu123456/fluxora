import { create } from 'zustand'
import type {
  DeveloperInsight,
  DeveloperProfile,
  LearningEventKind,
  PersonalizationProfile,
  SessionBriefing,
  WorkSession,
} from '../types/developer'
import type { MemoryEntry } from '../types'

export interface DeveloperStore {
  profile: DeveloperProfile | null
  insights: DeveloperInsight[]
  briefing: SessionBriefing | null
  sessions: WorkSession[]
  memories: MemoryEntry[]
  personalization: PersonalizationProfile | null
  loading: boolean
  loadingMemories: boolean
  loaded: boolean

  loadOverview: (workspaceId?: string | null) => Promise<void>
  loadProfile: (force?: boolean) => Promise<void>
  loadBriefing: (workspaceId?: string | null) => Promise<void>
  loadMemories: (force?: boolean) => Promise<void>
  loadPersonalization: () => Promise<PersonalizationProfile | null>
  addMemory: (content: string, type?: MemoryEntry['type'], tags?: string[]) => Promise<void>
  updateMemory: (id: string, data: Partial<MemoryEntry>) => Promise<void>
  removeMemory: (id: string) => Promise<void>
  track: (kind: LearningEventKind, input?: { key?: string; value?: string; workspaceId?: string; workspaceName?: string }) => void
  reset: (includeMemory?: boolean) => Promise<void>
}

export const useDeveloperStore = create<DeveloperStore>((set, get) => ({
  profile: null,
  insights: [],
  briefing: null,
  sessions: [],
  memories: [],
  personalization: null,
  loading: false,
  loadingMemories: false,
  loaded: false,

  loadOverview: async (workspaceId) => {
    if (get().loading) return
    set({ loading: true })
    try {
      const overview = await window.api.developer.overview(workspaceId ?? null)
      set({
        profile: overview.profile,
        insights: overview.insights,
        briefing: overview.briefing,
        sessions: overview.sessions,
        personalization: overview.personalization,
        loaded: true,
      })
    } catch {
      /* developer layer unavailable */
    } finally {
      set({ loading: false })
    }
  },

  loadProfile: async (force = false) => {
    if (get().profile && !force) return
    try {
      const profile = await window.api.developer.profile()
      set({ profile })
    } catch {
      /* ignore */
    }
  },

  loadBriefing: async (workspaceId) => {
    try {
      const briefing = await window.api.developer.briefing(workspaceId ?? null)
      set({ briefing })
    } catch {
      /* ignore */
    }
  },

  loadMemories: async (force = false) => {
    if (get().memories.length && !force) return
    set({ loadingMemories: true })
    try {
      const memories = await window.api.developer.memory.list()
      set({ memories })
    } catch {
      /* ignore */
    } finally {
      set({ loadingMemories: false })
    }
  },

  loadPersonalization: async () => {
    if (get().personalization) return get().personalization
    try {
      const personalization = await window.api.developer.personalization()
      set({ personalization })
      return personalization
    } catch {
      return null
    }
  },

  addMemory: async (content, type = 'user', tags) => {
    const trimmed = content.trim()
    if (!trimmed) return
    try {
      const entry = await window.api.developer.memory.create({ content: trimmed, type, tags, source: 'manual' })
      set((s) => ({ memories: [entry, ...s.memories] }))
    } catch {
      /* ignore */
    }
  },

  updateMemory: async (id, data) => {
    try {
      const entry = await window.api.developer.memory.update(id, data)
      if (!entry) return
      set((s) => ({ memories: s.memories.map((m) => (m.id === id ? entry : m)) }))
    } catch {
      /* ignore */
    }
  },

  removeMemory: async (id) => {
    try {
      await window.api.developer.memory.delete(id)
      set((s) => ({ memories: s.memories.filter((m) => m.id !== id) }))
    } catch {
      /* ignore */
    }
  },

  track: (kind, input) => {
    try {
      void window.api.developer.track(kind, input)
    } catch {
      /* tracking is best-effort */
    }
  },

  reset: async (includeMemory = false) => {
    try {
      await window.api.developer.reset({ includeMemory })
      set({ insights: [], sessions: [], profile: null, briefing: null, personalization: null, loaded: false })
      if (includeMemory) set({ memories: [] })
      await get().loadOverview()
    } catch {
      /* ignore */
    }
  },
}))

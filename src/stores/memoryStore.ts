import { create } from 'zustand'
import type { MemoryEntry } from '../types'

export interface MemoryStore {
  memories: MemoryEntry[]
  isLoading: boolean
  searchResults: MemoryEntry[]
  memoryEnabled: boolean

  loadMemories: (scope?: string) => Promise<void>
  addMemory: (data: Partial<MemoryEntry>) => Promise<MemoryEntry | null>
  updateMemory: (id: string, data: Partial<MemoryEntry>) => Promise<void>
  deleteMemory: (id: string) => Promise<void>
  searchMemories: (query: string) => Promise<MemoryEntry[]>
  toggleMemory: (enabled: boolean) => Promise<void>
  getMemorySettings: () => Promise<any>
  setMemoryEnabled: (enabled: boolean) => void
  clearResults: () => void
}

export const useMemoryStore = create<MemoryStore>((set, get) => ({
  memories: [],
  isLoading: false,
  searchResults: [],
  memoryEnabled: true,

  loadMemories: async (scope = 'global') => {
    set({ isLoading: true })
    try {
      const memories = await window.api.memory.list(scope)
      set({ memories, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  addMemory: async (data) => {
    const memory = await window.api.memory.create(data)
    if (memory) {
      set((state) => ({ memories: [memory, ...state.memories] }))
    }
    return memory
  },

  updateMemory: async (id, data) => {
    await window.api.memory.update(id, data)
    set((state) => ({
      memories: state.memories.map((m) => (m.id === id ? { ...m, ...data } : m)),
    }))
  },

  deleteMemory: async (id) => {
    await window.api.memory.delete(id)
    set((state) => ({
      memories: state.memories.filter((m) => m.id !== id),
    }))
  },

  searchMemories: async (query) => {
    const results = await window.api.memory.search(query)
    set({ searchResults: results })
    return results
  },

  toggleMemory: async (enabled) => {
    await window.api.memory.toggle(enabled)
    set({ memoryEnabled: enabled })
  },

  getMemorySettings: async () => {
    const settings = await window.api.memory.getSettings()
    set({ memoryEnabled: settings?.memoryEnabled !== false })
    return settings
  },

  setMemoryEnabled: (enabled) => set({ memoryEnabled: enabled }),
  clearResults: () => set({ searchResults: [] }),
}))
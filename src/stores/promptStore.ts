import { create } from 'zustand'
import type { PromptTemplate } from '../types'

export interface PromptStore {
  prompts: PromptTemplate[]
  filteredPrompts: PromptTemplate[]
  categories: string[]
  selectedCategory: string | null
  searchQuery: string
  isLoading: boolean

  loadPrompts: () => Promise<void>
  createPrompt: (data: Partial<PromptTemplate>) => Promise<PromptTemplate | null>
  updatePrompt: (id: string, data: Partial<PromptTemplate>) => Promise<void>
  deletePrompt: (id: string) => Promise<void>
  setCategory: (cat: string | null) => void
  setSearch: (q: string) => void
  getFilteredPrompts: () => PromptTemplate[]
  getCategories: () => string[]
}

export const usePromptStore = create<PromptStore>((set, get) => ({
  prompts: [],
  filteredPrompts: [],
  categories: [],
  selectedCategory: null,
  searchQuery: '',
  isLoading: false,

  loadPrompts: async () => {
    set({ isLoading: true })
    try {
      const prompts = await window.api.prompts.list()
      const categories = [...new Set(prompts.map((p: any) => p.category).filter(Boolean))] as string[]
      set({ prompts, categories, filteredPrompts: prompts, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  createPrompt: async (data) => {
    const prompt = await window.api.prompts.create(data)
    if (prompt) {
      set((state) => ({
        prompts: [prompt, ...state.prompts],
        filteredPrompts: [prompt, ...state.filteredPrompts],
        categories: prompt.category
          ? [...new Set([...state.categories, prompt.category])]
          : state.categories,
      }))
    }
    return prompt
  },

  updatePrompt: async (id, data) => {
    await window.api.prompts.update(id, data)
    set((state) => ({
      prompts: state.prompts.map((p) => (p.id === id ? { ...p, ...data } : p)),
      filteredPrompts: state.filteredPrompts.map((p) => (p.id === id ? { ...p, ...data } : p)),
    }))
  },

  deletePrompt: async (id) => {
    await window.api.prompts.delete(id)
    set((state) => ({
      prompts: state.prompts.filter((p) => p.id !== id),
      filteredPrompts: state.filteredPrompts.filter((p) => p.id !== id),
    }))
  },

  setCategory: (cat) => {
    set({ selectedCategory: cat })
    get().getFilteredPrompts()
  },

  setSearch: (q) => {
    set({ searchQuery: q })
    get().getFilteredPrompts()
  },

  getFilteredPrompts: () => {
    const { prompts, selectedCategory, searchQuery } = get()
    let filtered = [...prompts]
    if (selectedCategory) {
      filtered = filtered.filter((p) => p.category === selectedCategory)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.content.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
      )
    }
    set({ filteredPrompts: filtered })
    return filtered
  },

  getCategories: () => {
    return [...new Set(get().prompts.map((p) => p.category).filter(Boolean))] as string[]
  },
}))
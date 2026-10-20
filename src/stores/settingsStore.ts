import { create } from 'zustand'
import type { AppSettings } from '../types'

export interface SettingsStore {
  settings: Partial<AppSettings>
  isLoading: boolean

  loadSettings: () => Promise<void>
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>
  resetSettings: () => Promise<void>
  exportAll: () => Promise<string | null>
  importAll: () => Promise<boolean>
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: {},
  isLoading: false,

  loadSettings: async () => {
    set({ isLoading: true })
    try {
      const settings = await window.api.settings.get()
      set({ settings, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  updateSettings: async (updates) => {
    const updated = await window.api.settings.update(updates)
    set((state) => ({ settings: { ...state.settings, ...updated } }))
  },

  resetSettings: async () => {
    await window.api.settings.reset()
    set({ settings: {} })
  },

  exportAll: async () => {
    return window.api.settings.exportAllData()
  },

  importAll: async () => {
    return window.api.settings.importAllData()
  },
}))
import { create } from 'zustand'
import type { AppSettings } from '../types'
import { DEFAULT_APP_SETTINGS } from '../types'

export interface SettingsStore {
  settings: AppSettings
  isLoading: boolean

  loadSettings: () => Promise<void>
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>
  patchSettings: (updates: Partial<AppSettings>) => void
  resetSettings: () => Promise<void>
  eraseAllData: () => Promise<void>
  exportAll: () => Promise<string | null>
  importAll: () => Promise<boolean>
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: { ...DEFAULT_APP_SETTINGS },
  isLoading: false,

  loadSettings: async () => {
    set({ isLoading: true })
    try {
      const settings = await window.api.settings.get()
      set({ settings: { ...DEFAULT_APP_SETTINGS, ...(settings || {}) }, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  updateSettings: async (updates) => {
    try {
      const merged = await window.api.settings.update(updates)
      set({ settings: { ...DEFAULT_APP_SETTINGS, ...(merged || updates) } })
    } catch {
      // Optimistic local merge keeps the UI responsive even if the write failed.
      set((state) => ({ settings: { ...state.settings, ...updates } }))
    }
  },

  patchSettings: (updates) => {
    void get().updateSettings(updates)
  },

  resetSettings: async () => {
    try {
      const settings = await window.api.settings.reset()
      set({ settings: { ...DEFAULT_APP_SETTINGS, ...(settings || {}) } })
    } catch {
      set({ settings: { ...DEFAULT_APP_SETTINGS } })
    }
  },

  eraseAllData: async () => {
    await window.api.settings.eraseAll?.()
    await get().loadSettings()
  },

  exportAll: async () => {
    return window.api.settings.exportAllData()
  },

  importAll: async () => {
    const ok = await window.api.settings.importAllData()
    await get().loadSettings()
    return !!ok
  },
}))

/** Imperative helper for modules that cannot subscribe to the store. */
export function patchSettings(updates: Partial<AppSettings>): void {
  useSettingsStore.getState().patchSettings(updates)
}

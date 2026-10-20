import { create } from 'zustand'
import type { ProviderConfig, ModelConfig } from '../types'
import { useSettingsStore } from './settingsStore'

export interface ProviderStore {
  providers: ProviderConfig[]
  selectedProvider: string | null
  connectionStatuses: Record<string, string>
  isLoading: boolean
  favoriteModels: Record<string, string>

  loadProviders: () => Promise<void>
  createProvider: (data: Partial<ProviderConfig>) => Promise<ProviderConfig | null>
  updateProvider: (id: string, data: Partial<ProviderConfig>) => Promise<ProviderConfig | null>
  deleteProvider: (id: string) => Promise<void>
  setSelectedProvider: (id: string | null) => void
  testConnection: (id: string) => Promise<boolean>
  ensureDefaults: () => Promise<void>
  refreshModels: (id: string) => Promise<ModelConfig[]>
  restoreLastProvider: () => void
  toggleModelFavorite: (providerId: string, modelId: string) => Promise<void>
  isModelFavorite: (providerId: string, modelId: string) => boolean
}

export const useProviderStore = create<ProviderStore>((set, get) => ({
  providers: [],
  selectedProvider: null,
  connectionStatuses: {},
  isLoading: false,
  favoriteModels: {},

  loadProviders: async () => {
    set({ isLoading: true })
    try {
      const providers = await window.api.providers.list()
      let favoriteModels: Record<string, string> = {}
      try {
        const settings: any = await window.api.settings.get()
        const raw = settings.favorite_models
        if (raw && typeof raw === 'string') favoriteModels = JSON.parse(raw)
        else if (raw && typeof raw === 'object') favoriteModels = raw
      } catch {
        /* favorites are best-effort */
      }
      set({ providers, favoriteModels, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  toggleModelFavorite: async (providerId, modelId) => {
    const current = { ...get().favoriteModels }
    if (current[providerId] === modelId) delete current[providerId]
    else current[providerId] = modelId
    set({ favoriteModels: current })
    try {
      const settings: any = await window.api.settings.get()
      await window.api.settings.update({ ...settings, favorite_models: JSON.stringify(current) })
    } catch {
      /* best-effort persistence */
    }
  },

  isModelFavorite: (providerId, modelId) => get().favoriteModels[providerId] === modelId,

  createProvider: async (data) => {
    const provider = await window.api.providers.create(data)
    if (provider) {
      set((state) => ({ providers: [...state.providers, provider] }))
    }
    return provider
  },

  updateProvider: async (id, data) => {
    const updated = await window.api.providers.update(id, data)
    if (updated) {
      set((state) => ({
        providers: state.providers.map((p) => (p.id === id ? updated : p)),
      }))
    }
    return updated
  },

  deleteProvider: async (id) => {
    await window.api.providers.delete(id)
    set((state) => ({
      providers: state.providers.filter((p) => p.id !== id),
      selectedProvider: state.selectedProvider === id ? null : state.selectedProvider,
    }))
  },

  setSelectedProvider: (id) => {
    set({ selectedProvider: id })
    if (id) {
      const currentSettings = useSettingsStore.getState().settings
      window.api.settings.update({ ...currentSettings, defaultProviderId: id }).catch(() => {})
    }
  },

  restoreLastProvider: () => {
    const defaultProviderId = useSettingsStore.getState().settings.defaultProviderId
    if (defaultProviderId) set({ selectedProvider: defaultProviderId })
  },

  testConnection: async (id) => {
    const result = await window.api.providers.testConnection(id)
    set((state) => ({
      connectionStatuses: { ...state.connectionStatuses, [id]: result.status },
    }))
    return result.success
  },

  ensureDefaults: async () => {
    await window.api.providers.ensureDefaults()
  },

  refreshModels: async (id) => {
    const res = await window.api.providers.refreshModels(id)
    const models: ModelConfig[] = Array.isArray(res) ? res : res?.models || []
    if (res?.ok) {
      set((state) => ({
        providers: state.providers.map((p) => (p.id === id ? { ...p, models } : p)),
      }))
    }
    return models
  },
}))
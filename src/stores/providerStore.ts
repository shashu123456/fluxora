import { create } from 'zustand'
import type { ProviderConfig, ModelConfig } from '../types'
import { useSettingsStore, patchSettings } from './settingsStore'

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
  testConnection: (id: string) => Promise<boolean>
  ensureDefaults: () => Promise<void>
  refreshModels: (id: string) => Promise<ModelConfig[]>
  restoreLastProvider: () => void
  toggleModelFavorite: (providerId: string, modelId: string) => Promise<void>
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
        const raw = settings?.favoriteModels
        if (raw && typeof raw === 'string') favoriteModels = JSON.parse(raw)
        else if (raw && typeof raw === 'object') favoriteModels = raw
      } catch {
        /* favorites are best-effort */
      }
      set({ providers, favoriteModels, isLoading: false })

      // A provider created without a model list leaves the composer picker empty,
      // so model selection looks broken. Pull its catalogue once, best-effort.
      for (const provider of providers) {
        if (!provider.enabled) continue
        if ((provider.models?.length ?? 0) > 0) continue
        if (!(provider.hasKey || provider.apiKey)) continue
        try {
          const res = await window.api.providers.refreshModels(provider.id)
          const models: ModelConfig[] = Array.isArray(res) ? res : res?.models || []
          if (models.length > 0) {
            set((state) => ({
              providers: state.providers.map((p) => (p.id === provider.id ? { ...p, models } : p)),
            }))
          }
        } catch {
          // a dead endpoint must never block the app
        }
      }
    } catch {
      set({ isLoading: false })
    }
  },

  toggleModelFavorite: async (providerId, modelId) => {
    const current = { ...get().favoriteModels }
    if (current[providerId] === modelId) delete current[providerId]
    else current[providerId] = modelId
    set({ favoriteModels: current })
    patchSettings({ favoriteModels: current })
  },

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
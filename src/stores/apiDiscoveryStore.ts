import { create } from 'zustand'
import type {
  ApiAuditEntryView,
  ApiCatalogMeta,
  ApiCatalogView,
  ApiDetailView,
  ApiTestResultView,
} from '../types/apiDiscovery'

interface UnwrapResult<T> {
  ok: boolean
  data?: T
  error?: { code: string; message: string }
}

interface ApiDiscoveryState {
  items: ApiCatalogView[]
  meta: ApiCatalogMeta | null
  audit: ApiAuditEntryView[]
  loading: boolean
  auditLoading: boolean
  error: string | null
  load: () => Promise<void>
  loadDetail: (apiId: string) => Promise<ApiDetailView | null>
  connect: (apiId: string, secret?: string) => Promise<string | null>
  disconnect: (apiId: string) => Promise<string | null>
  test: (apiId: string) => Promise<ApiTestResultView | null>
  loadAudit: (limit?: number) => Promise<void>
}

function unwrap<T>(result: UnwrapResult<T> | undefined): T {
  if (!result || !result.ok || !result.data) {
    throw new Error(result?.error?.message ?? 'The request failed.')
  }
  return result.data
}

export const useApiDiscoveryStore = create<ApiDiscoveryState>((set, get) => ({
  items: [],
  meta: null,
  audit: [],
  loading: false,
  auditLoading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null })
    try {
      const [items, meta] = await Promise.all([
        window.api.apis.list(),
        window.api.apis.catalogVersion(),
      ])
      set({ items: unwrap<ApiCatalogView[]>(items), meta: unwrap<ApiCatalogMeta>(meta), loading: false })
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'The API catalog could not be loaded.',
      })
    }
  },

  loadDetail: async (apiId) => {
    try {
      return unwrap<ApiDetailView>(await window.api.apis.get(apiId))
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'That API could not be opened.' })
      return null
    }
  },

  connect: async (apiId, secret) => {
    try {
      unwrap(await window.api.apis.connect(apiId, secret))
      await get().load()
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'The key could not be saved.'
    }
  },

  disconnect: async (apiId) => {
    try {
      unwrap(await window.api.apis.disconnect(apiId))
      await get().load()
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'The key could not be removed.'
    }
  },

  test: async (apiId) => {
    try {
      const result = unwrap<ApiTestResultView>(await window.api.apis.test(apiId))
      await Promise.all([get().load(), get().loadAudit()])
      return result
    } catch (error) {
      await get().loadAudit()
      return {
        ok: false,
        requestId: '',
        durationMs: 0,
        bytes: 0,
        error: {
          code: 'network_error',
          message: error instanceof Error ? error.message : 'The test request failed.',
        },
      }
    }
  },

  loadAudit: async (limit = 50) => {
    set({ auditLoading: true })
    try {
      const entries = unwrap<ApiAuditEntryView[]>(await window.api.apis.audit(limit))
      set({ audit: entries, auditLoading: false })
    } catch {
      set({ auditLoading: false })
    }
  },
}))

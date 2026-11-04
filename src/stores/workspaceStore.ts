import { create } from 'zustand'
import type { Workspace, WorkspaceIndex } from '../types'
import { useSettingsStore, patchSettings } from './settingsStore'
import { useIntelligenceStore } from './intelligenceStore'

export type WorkspacePanel = 'explorer' | 'terminal-git' | 'intelligence' | 'brain'

export interface WorkspaceStore {
  workspaces: Workspace[]
  currentWorkspace: Workspace | null
  isLoading: boolean
  indexes: Record<string, WorkspaceIndex>
  indexing: Record<string, boolean>
  panel: WorkspacePanel
  pendingFile: string | null

  loadWorkspaces: () => Promise<void>
  createWorkspace: (name: string, path?: string) => Promise<Workspace | null>
  updateWorkspace: (id: string, data: Partial<Workspace>) => Promise<void>
  deleteWorkspace: (id: string) => Promise<void>
  selectWorkspace: (id: string) => void
  restoreLastWorkspace: () => void
  openFolder: () => Promise<string | null>
  getIndex: (id: string) => Promise<WorkspaceIndex | null>
  indexWorkspace: (id: string) => Promise<WorkspaceIndex | null>
  setPanel: (panel: WorkspacePanel) => void
  setPendingFile: (path: string | null) => void
  focusWorkspace: (id: string, panel?: WorkspacePanel, filePath?: string | null) => void
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: [],
  currentWorkspace: null,
  isLoading: false,
  indexes: {},
  indexing: {},
  panel: 'explorer',
  pendingFile: null,

  loadWorkspaces: async () => {
    set({ isLoading: true })
    try {
      const workspaces = await window.api.workspace.list()
      set({ workspaces, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  createWorkspace: async (name, path) => {
    const ws = await window.api.workspace.create({ name, path })
    if (ws) {
      set((state) => ({ workspaces: [...state.workspaces, ws] }))
    }
    return ws
  },

  updateWorkspace: async (id, data) => {
    await window.api.workspace.update(id, data)
    set((state) => ({
      workspaces: state.workspaces.map((w) => (w.id === id ? { ...w, ...data } : w)),
      currentWorkspace: state.currentWorkspace?.id === id
        ? { ...state.currentWorkspace, ...data }
        : state.currentWorkspace,
    }))
  },

  deleteWorkspace: async (id) => {
    await window.api.workspace.delete(id)
    useIntelligenceStore.getState().invalidate(id)
    set((state) => {
      const indexes = { ...state.indexes }
      delete indexes[id]
      return {
        workspaces: state.workspaces.filter((w) => w.id !== id),
        currentWorkspace: state.currentWorkspace?.id === id ? null : state.currentWorkspace,
        indexes,
      }
    })
  },

  selectWorkspace: (id) => {
    const previous = get().currentWorkspace
    const ws = get().workspaces.find((w) => w.id === id) || null
    set({ currentWorkspace: ws })
    if (ws) {
      patchSettings({ lastWorkspaceId: ws.id })
      if (previous?.id !== ws.id) {
        try {
          void window.api?.developer?.track('workspace_switched', {
            key: ws.id,
            value: ws.name,
            workspaceId: ws.id,
            workspaceName: ws.name,
          })
        } catch {
          /* tracking is best-effort */
        }
      }
      if (ws.path && !get().indexes[ws.id]) {
        get().indexWorkspace(ws.id).catch(() => {})
      }
    }
  },

  restoreLastWorkspace: () => {
    const lastId = useSettingsStore.getState().settings.lastWorkspaceId
    if (!lastId) return
    const ws = get().workspaces.find((w) => w.id === lastId) || null
    if (ws) {
      set({ currentWorkspace: ws })
      if (ws.path) {
        get().getIndex(ws.id).catch(() => {})
      }
    }
  },

  openFolder: async () => {
    const result = await window.api.workspace.openFolder()
    if (result) {
      const name = result.split(/[\\/]/).pop() || 'Workspace'
      const ws = await get().createWorkspace(name, result)
      if (ws) {
        get().selectWorkspace(ws.id)
        ws.path && get().indexWorkspace(ws.id).catch(() => {})
      }
      return result
    }
    return null
  },

  getIndex: async (id) => {
    const cached = get().indexes[id]
    if (cached) return cached
    try {
      const idx = await window.api.workspace.getIndex(id)
      if (idx) {
        set((state) => ({ indexes: { ...state.indexes, [id]: idx } }))
        return idx
      }
    } catch {}
    return null
  },

  indexWorkspace: async (id) => {
    if (get().indexing[id]) return get().indexes[id] || null
    set((state) => ({ indexing: { ...state.indexing, [id]: true } }))
    try {
      const idx = await window.api.workspace.index(id)
      if (idx) {
        useIntelligenceStore.getState().invalidate(id)
        set((state) => ({
          indexes: { ...state.indexes, [id]: idx },
          indexing: { ...state.indexing, [id]: false },
        }))
        return idx
      }
      set((state) => ({ indexing: { ...state.indexing, [id]: false } }))
      return null
    } catch (e) {
      set((state) => ({ indexing: { ...state.indexing, [id]: false } }))
      throw e
    }
  },

  setPanel: (panel) => set({ panel }),

  setPendingFile: (path) => set({ pendingFile: path }),

  /**
   * Selects a workspace and deep-links into one of its panels. Used by global
   * search and the command palette so a result always lands on the right
   * project AND the right panel.
   */
  focusWorkspace: (id, panel = 'explorer', filePath = null) => {
    get().selectWorkspace(id)
    set({ panel, pendingFile: filePath })
  },
}))
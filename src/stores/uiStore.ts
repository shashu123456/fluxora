import { create } from 'zustand'
import type { AppTab } from '../types'
import { isAppTab } from '../types'
import { patchSettings } from './settingsStore'

export type PendingCreate = 'memory' | 'prompt' | null

export interface PendingAttachment {
  name: string
  path: string
  content?: string
}

export interface UIStore {
  sidebarCollapsed: boolean
  theme: 'dark' | 'light' | 'system'
  activeTab: AppTab
  pendingPromptContent: string | null
  pendingCreate: PendingCreate
  pendingAttachment: PendingAttachment | null
  paletteOpen: boolean

  toggleSidebar: () => void
  setTheme: (t: 'dark' | 'light' | 'system') => void
  setActiveTab: (t: AppTab) => void
  setPendingPromptContent: (c: string | null) => void
  setPendingCreate: (target: PendingCreate) => void
  setPendingAttachment: (a: PendingAttachment | null) => void
  setPaletteOpen: (open: boolean) => void
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarCollapsed: false,
  theme: 'dark',
  activeTab: 'chat',
  pendingPromptContent: null,
  pendingCreate: null,
  pendingAttachment: null,
  paletteOpen: false,

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setTheme: (t) => {
    set({ theme: t })
    patchSettings({ theme: t })
  },
  setActiveTab: (t) => {
    if (!isAppTab(t)) return
    set({ activeTab: t })
  },
  setPendingPromptContent: (c) => set({ pendingPromptContent: c }),
  setPendingCreate: (target) => set({ pendingCreate: target }),
  setPendingAttachment: (a) => set({ pendingAttachment: a }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
}))

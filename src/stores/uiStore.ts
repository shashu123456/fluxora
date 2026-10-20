import { create } from 'zustand'

export interface UIStore {
  sidebarCollapsed: boolean
  sidebarWidth: number
  theme: 'dark' | 'light' | 'system'
  activePanel: string | null
  notifications: any[]
  activeTab: string
  pendingPromptContent: string | null

  toggleSidebar: () => void
  setSidebarWidth: (w: number) => void
  setTheme: (t: 'dark' | 'light' | 'system') => void
  setActivePanel: (p: string | null) => void
  addNotification: (n: any) => void
  removeNotification: (id: string) => void
  clearNotifications: () => void
  setActiveTab: (t: string) => void
  setPendingPromptContent: (c: string | null) => void
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarCollapsed: false,
  sidebarWidth: 260,
  theme: 'dark',
  activePanel: null,
  notifications: [],
  activeTab: 'chat',
  pendingPromptContent: null,

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarWidth: (w) => set({ sidebarWidth: w }),
  setTheme: (t) => {
    set({ theme: t })
    window.api?.settings?.update({ theme: t }).catch(() => {})
  },
  setActivePanel: (p) => set({ activePanel: p }),
  addNotification: (n) => set((s) => ({
    notifications: [{ id: Date.now().toString(), ...n }, ...s.notifications].slice(0, 50),
  })),
  removeNotification: (id) => set((s) => ({
    notifications: s.notifications.filter((n) => n.id !== id),
  })),
  clearNotifications: () => set({ notifications: [] }),
  setActiveTab: (t) => set({ activeTab: t }),
  setPendingPromptContent: (c) => set({ pendingPromptContent: c }),
}))
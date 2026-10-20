import { lazy, Suspense, useEffect, useState } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { TitleBar } from '@/components/layout/TitleBar'
import { ChatView } from '@/components/chat/ChatView'
import { CommandPalette } from '@/components/command/CommandPalette'
import { OnboardingDialog } from '@/components/onboarding/OnboardingDialog'
import { AboutDialog } from '@/components/about/AboutDialog'
import { useUIStore } from '@/stores/uiStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useProviderStore } from '@/stores/providerStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { usePromptStore } from '@/stores/promptStore'
import { useChatStore } from '@/stores/chatStore'

const MemoryView = lazy(() => import('@/components/memory/MemoryView').then((m) => ({ default: m.MemoryView })))
const WorkspaceView = lazy(() => import('@/components/workspace/WorkspaceView').then((m) => ({ default: m.WorkspaceView })))
const PromptsView = lazy(() => import('@/components/prompts/PromptsView').then((m) => ({ default: m.PromptsView })))
const UsageView = lazy(() => import('@/components/usage/UsageView').then((m) => ({ default: m.UsageView })))
const SettingsView = lazy(() => import('@/components/settings/SettingsView').then((m) => ({ default: m.SettingsView })))
const SearchView = lazy(() => import('@/components/search/SearchView').then((m) => ({ default: m.SearchView })))
const HomeView = lazy(() => import('@/components/home/DashboardView').then((m) => ({ default: m.DashboardView })))

export function AppLayout() {
  const activeTab = useUIStore((s) => s.activeTab)
  const setActiveTab = useUIStore((s) => s.setActiveTab)
  const theme = useUIStore((s) => s.theme)
  const setTheme = useUIStore((s) => s.setTheme)
  const loadSettings = useSettingsStore((s) => s.loadSettings)
  const loadProviders = useProviderStore((s) => s.loadProviders)
  const ensureDefaults = useProviderStore((s) => s.ensureDefaults)
  const restoreLastProvider = useProviderStore((s) => s.restoreLastProvider)
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces)
  const restoreLastWorkspace = useWorkspaceStore((s) => s.restoreLastWorkspace)
  const loadPrompts = usePromptStore((s) => s.loadPrompts)
  const loadChats = useChatStore((s) => s.loadChats)
  const setCurrentChat = useChatStore((s) => s.setCurrentChat)
  const createChat = useChatStore((s) => s.createChat)
  const [initError, setInitError] = useState<string | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const key = e.key.toLowerCase()
      if (key === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      } else if (!e.shiftKey && /^[1-6]$/.test(key)) {
        e.preventDefault()
        const tabs = ['chat', 'search', 'workspace', 'memory', 'prompts', 'usage']
        setActiveTab(tabs[Number(key) - 1])
      } else if (e.shiftKey && key === 'f') {
        e.preventDefault()
        setActiveTab('search')
      } else if (key === ',') {
        e.preventDefault()
        setActiveTab('settings')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setActiveTab])

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      try {
        await ensureDefaults()
        await loadSettings()
        const savedTheme = useSettingsStore.getState().settings.theme
        if (savedTheme) setTheme(savedTheme)
        await Promise.all([
          loadProviders().catch(() => {}),
          loadWorkspaces().catch(() => {}),
          loadPrompts().catch(() => {}),
          loadChats('global').catch(() => {}),
        ])
        restoreLastProvider()
        restoreLastWorkspace()
        const lastChatId = useSettingsStore.getState().settings.lastChatId
        if (!cancelled && lastChatId) {
          setCurrentChat(lastChatId)
        } else if (!cancelled && !lastChatId) {
          setActiveTab('home')
        }
      } catch (err: any) {
        if (!cancelled) setInitError(err?.message || 'Something went wrong while loading the app.')
      }
    }
    init()
    const unsub = window.api.onMenuNewChat?.(() => {
      createChat({ workspaceId: 'global' })
    })
    const unsubAbout = window.api.onMenuAbout?.(() => {
      setAboutOpen(true)
    })
    const unsubDataDir = window.api.onMenuOpenDataDir?.(() => {
      window.api.system?.openDataDir?.()
    })
    return () => {
      unsub?.()
      unsubAbout?.()
      unsubDataDir?.()
      cancelled = true
    }
  }, [ensureDefaults, loadSettings, setTheme, loadProviders, loadWorkspaces, loadPrompts, loadChats, setCurrentChat, restoreLastWorkspace, restoreLastProvider, createChat, setActiveTab])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'light') {
      root.classList.remove('dark')
    } else if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      root.classList.toggle('dark', prefersDark)
    } else {
      root.classList.add('dark')
    }
    root.style.colorScheme = theme === 'light' ? 'light' : 'dark'
  }, [theme])

  const renderView = () => {
    switch (activeTab) {
      case 'home':
        return <HomeView />
      case 'memory':
        return <MemoryView />
      case 'workspace':
        return <WorkspaceView />
      case 'prompts':
        return <PromptsView />
      case 'usage':
        return <UsageView />
      case 'settings':
        return <SettingsView />
      case 'search':
        return <SearchView />
      case 'chat':
      default:
        return <ChatView />
    }
  }

  return (
    <div className="fx-aurora flex h-screen w-screen overflow-hidden text-foreground">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TitleBar />
        {initError && (
          <div className="flex items-center gap-2 border-b border-border/60 bg-muted px-4 py-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
            <span className="flex-1 truncate">Startup partially failed: {initError}</span>
            <button className="shrink-0 hover:text-foreground" onClick={() => setInitError(null)}>
              Dismiss
            </button>
          </div>
        )}
        <main className="flex-1 overflow-hidden">
          <Suspense fallback={<ViewFallback />}>{renderView()}</Suspense>
        </main>
      </div>
      <OnboardingDialog />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}

function ViewFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}
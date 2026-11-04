import { lazy, Suspense, useEffect, useState } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { TitleBar } from '@/components/layout/TitleBar'
import { CommandPalette } from '@/components/command/CommandPalette'
import { OnboardingDialog } from '@/components/onboarding/OnboardingDialog'
import { AboutDialog } from '@/components/about/AboutDialog'
import { FluxoraMark } from '@/components/brand/FluxoraMark'
import { useUIStore } from '@/stores/uiStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useProviderStore } from '@/stores/providerStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { usePromptStore } from '@/stores/promptStore'
import { useChatStore } from '@/stores/chatStore'
import { NAV_ITEMS, navLabel } from '@/lib/navigation'

const ChatView = lazy(() => import('@/components/chat/ChatView').then((m) => ({ default: m.ChatView })))
const MemoryView = lazy(() => import('@/components/memory/MemoryView').then((m) => ({ default: m.MemoryView })))
const WorkspaceView = lazy(() => import('@/components/workspace/WorkspaceView').then((m) => ({ default: m.WorkspaceView })))
const PromptsView = lazy(() => import('@/components/prompts/PromptsView').then((m) => ({ default: m.PromptsView })))
const UsageView = lazy(() => import('@/components/usage/UsageView').then((m) => ({ default: m.UsageView })))
const SettingsView = lazy(() => import('@/components/settings/SettingsView').then((m) => ({ default: m.SettingsView })))
const SearchView = lazy(() => import('@/components/search/SearchView').then((m) => ({ default: m.SearchView })))
const HomeView = lazy(() => import('@/components/home/DashboardView').then((m) => ({ default: m.DashboardView })))
const VisualizationsView = lazy(() => import('@/components/visualizations/VisualizationsView').then((m) => ({ default: m.VisualizationsView })))
const ProfileView = lazy(() => import('@/components/developer/ProfileView').then((m) => ({ default: m.ProfileView })))

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
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const paletteOpen = useUIStore((s) => s.paletteOpen)
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const key = e.key.toLowerCase()
      if (key === 'k') {
        e.preventDefault()
        setPaletteOpen(!useUIStore.getState().paletteOpen)
      } else if (key === 'b' && !e.shiftKey) {
        e.preventDefault()
        toggleSidebar()
      } else if (!e.shiftKey && /^[0-9]$/.test(key)) {
        e.preventDefault()
        const target = NAV_ITEMS[key === '0' ? 9 : Number(key) - 1]
        if (target) setActiveTab(target.id)
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
  }, [setActiveTab, setPaletteOpen, toggleSidebar])

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
        ])
        restoreLastProvider()
        restoreLastWorkspace()
        const chatScope = useWorkspaceStore.getState().currentWorkspace?.id || 'global'
        await loadChats(chatScope).catch(() => {})
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
      const scope = useWorkspaceStore.getState().currentWorkspace?.id || 'global'
      createChat({ workspaceId: scope })
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

  useEffect(() => {
    document.title = `Fluxora — ${navLabel(activeTab)}`
  }, [activeTab])

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
      case 'developer':
        return <ProfileView />
      case 'search':
        return <SearchView />
      case 'visualizations':
        return <VisualizationsView />
      case 'chat':
        return <ChatView />
      default:
        return <HomeView />
    }
  }

  return (
    <div className="fx-aurora flex h-screen w-screen overflow-hidden text-foreground">
      <a
        href="#fx-main"
        className="sr-only z-[100] rounded-lg bg-card px-3 py-2 text-sm shadow-float focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TitleBar />
        {initError && (
          <div
            role="alert"
            className="fx-fade flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-200/90"
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
            <span className="flex-1 truncate">Startup partially failed: {initError}</span>
            <button
              className="shrink-0 text-amber-200/70 transition-colors hover:text-amber-100"
              onClick={() => setInitError(null)}
            >
              Dismiss
            </button>
          </div>
        )}
        <main id="fx-main" tabIndex={-1} className="relative flex-1 overflow-hidden outline-none">
          <Suspense fallback={<ViewFallback />}>
            <div key={activeTab} className="fx-view-enter h-full">
              {renderView()}
            </div>
          </Suspense>
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
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <FluxoraMark size={30} className="opacity-75 animate-pulse" />
      <div className="fx-skeleton h-px w-24 rounded-full" />
    </div>
  )
}
import { Menu, X, Minimize2, Square, Sun, Moon, Search, CornerDownRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUIStore } from '@/stores/uiStore'
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { useChatStore } from '@/stores/chatStore'
import { useSettingsStore } from '@/stores/settingsStore'
import type { GlobalSearchResult } from '@/types'
import { cn } from '@/lib/utils'

export function TitleBar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const theme = useUIStore((s) => s.theme)
  const setTheme = useUIStore((s) => s.setTheme)
  const setActiveTab = useUIStore((s) => s.setActiveTab)
  const setCurrentChat = useChatStore((s) => s.setCurrentChat)
  const updateChat = useChatStore((s) => s.updateChat)
  const currentChatId = useChatStore((s) => s.currentChatId)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const [showSearch, setShowSearch] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GlobalSearchResult[]>([])

  const openGlobal = () => {
    setShowSearch(false)
    setQuery('')
    setActiveTab('search')
  }

  useEffect(() => {
    const q = query.trim()
    if (!showSearch || q.length < 2) {
      setResults([])
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const res = await window.api.search.global(q)
        if (!cancelled) setResults((res || []).slice(0, 12))
      } catch {
        if (!cancelled) setResults([])
      }
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query, showSearch])

  const pickResult = (r: GlobalSearchResult) => {
    const a = r.action
    setShowSearch(false)
    setQuery('')
    if (!a) return
    if (a.kind === 'openChat') {
      setCurrentChat(a.chatId)
      setActiveTab('chat')
    } else if (a.kind === 'openView') {
      setActiveTab(a.tab)
    } else if (a.kind === 'openWorkspace') {
      setActiveTab('workspace')
    } else if (a.kind === 'pickModel') {
      updateSettings({ defaultProviderId: a.providerId, defaultModelId: a.modelId })
      if (currentChatId) updateChat(currentChatId, { providerId: a.providerId, modelId: a.modelId }).catch(() => {})
    }
  }

  return (
    <div className="relative z-20 flex h-10 shrink-0 items-center border-b border-b-fx-gold/10 bg-background/70 backdrop-blur-xl app-drag">
      <div className="pointer-events-none absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-fx-gold/25 to-transparent" />
      <div className={`flex items-center gap-1 px-2 app-no-drag ${window.api.platform === 'darwin' ? 'pl-20' : ''}`}>
        <Button variant="ghost" size="icon" className="h-7 w-7 transition-transform duration-150 hover:scale-105" onClick={toggleSidebar}>
          <Menu className="h-4 w-4" />
        </Button>
      </div>

      <div className="relative flex flex-1 items-center justify-center px-2">
        {showSearch ? (
          <div className="relative w-64 app-no-drag">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setShowSearch(false)
                  setQuery('')
                  setResults([])
                }
              }}
              placeholder="Search everything…"
              className="h-7 pl-7 text-xs"
              onBlur={() => setTimeout(() => { setShowSearch(false); setQuery(''); setResults([]) }, 200)}
            />
            {results.length > 0 && (
              <div className="fx-surface absolute left-0 top-8 z-50 max-h-72 w-80 overflow-y-auto rounded-lg p-1 shadow-2xl">
                {results.map((r, i) => (
                  <button
                    key={`${r.group}-${r.id}-${i}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickResult(r)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-sidebar-accent/60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-foreground">{r.title}</span>
                      {r.subtitle && (
                        <span className="block truncate text-[10px] text-muted-foreground">{r.subtitle}</span>
                      )}
                    </span>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                      {r.group}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2.5 text-sm font-medium text-muted-foreground">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inset-0 rounded-full bg-fx-gold animate-stream-pulse" />
              <span className="absolute -inset-px rounded-full bg-fx-gold/30 blur-[2px]" />
            </span>
            <span className="fx-wordmark select-none">
              FLUXORA
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5 pr-1 app-no-drag">
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-7 w-7')}
          onClick={() => setShowSearch((s) => !s)}
          title="Search everything"
        >
          <Search className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <div className="mx-1 h-4 w-px bg-border" />
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.api.minimize()}>
          <Minimize2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.api.maximize()}>
          <Square className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-destructive hover:text-destructive-foreground" onClick={() => window.api.close()}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
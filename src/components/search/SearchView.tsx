import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, MessageSquare, FileText, Brain, Settings as SettingsIcon, Folder, Zap, MessageCircle, TerminalSquare, Loader2 } from 'lucide-react'
import type { GlobalSearchResult } from '@/types'
import { useUIStore } from '@/stores/uiStore'
import { useChatStore } from '@/stores/chatStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { cn } from '@/lib/utils'

const GROUP_META: Record<string, { label: string; icon: React.ReactNode }> = {
  chats: { label: 'Chats', icon: <MessageSquare className="h-4 w-4" /> },
  messages: { label: 'Messages', icon: <MessageCircle className="h-4 w-4" /> },
  prompts: { label: 'Prompts', icon: <FileText className="h-4 w-4" /> },
  memories: { label: 'Memory', icon: <Brain className="h-4 w-4" /> },
  providers: { label: 'Providers', icon: <SettingsIcon className="h-4 w-4" /> },
  models: { label: 'Models', icon: <Zap className="h-4 w-4" /> },
  workspaces: { label: 'Workspaces', icon: <Folder className="h-4 w-4" /> },
  files: { label: 'Files', icon: <Folder className="h-4 w-4" /> },
  terminal: { label: 'Terminal', icon: <TerminalSquare className="h-4 w-4" /> },
  settings: { label: 'Settings', icon: <SettingsIcon className="h-4 w-4" /> },
}

const GROUP_ORDER = [
  'chats', 'messages', 'files', 'terminal', 'models', 'workspaces', 'prompts', 'memories', 'providers', 'settings',
]

export function SearchView() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GlobalSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const setActiveTab = useUIStore((s) => s.setActiveTab)
  const setCurrentChat = useChatStore((s) => s.setCurrentChat)
  const selectWorkspace = useWorkspaceStore((s) => s.selectWorkspace)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const updateChat = useChatStore((s) => s.updateChat)
  const currentChatId = useChatStore((s) => s.currentChatId)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const res = await window.api.search.global(q)
        if (!cancelled) setResults(res || [])
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query])

  const grouped = useMemo(() => {
    const map = new Map<string, GlobalSearchResult[]>()
    for (const r of results) {
      const arr = map.get(r.group) || []
      arr.push(r)
      map.set(r.group, arr)
    }
    return GROUP_ORDER
      .filter((g) => map.has(g))
      .map((g) => ({ group: g, items: map.get(g)! }))
  }, [results])

  const runAction = async (r: GlobalSearchResult) => {
    const a = r.action
    if (!a) return
    if (a.kind === 'openChat') {
      setCurrentChat(a.chatId)
      setActiveTab('chat')
    } else if (a.kind === 'openView') {
      setActiveTab(a.tab)
    } else if (a.kind === 'pickModel') {
      updateSettings({ defaultProviderId: a.providerId, defaultModelId: a.modelId })
      if (currentChatId) updateChat(currentChatId, { providerId: a.providerId, modelId: a.modelId }).catch(() => {})
    } else if (a.kind === 'openWorkspace') {
      if (selectWorkspace) selectWorkspace(a.workspaceId)
      setActiveTab('workspace')
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="fx-surface mx-auto mt-16 w-full max-w-2xl overflow-hidden rounded-2xl p-2">
        <div className="flex items-center gap-2 border-b border-border/40 px-3 pb-2">
          <Search className="h-4 w-4 shrink-0 text-primary" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats, messages, prompts, memory, models, workspaces…"
            className="flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto pb-16 pt-3">
        {query.trim().length < 2 && (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Type at least 2 characters to search across everything.
          </p>
        )}

        {query.trim().length >= 2 && grouped.length === 0 && !loading && (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            No results for “{query}”
          </p>
        )}

        {grouped.map((g) => {
          const meta = GROUP_META[g.group] || { label: g.group, icon: <Search className="h-4 w-4" /> }
          return (
            <div key={g.group} className="mb-3">
              <div className="flex items-center gap-2 px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {meta.icon}
                {meta.label}
                <span className="text-[10px] text-muted-foreground/60">{g.items.length}</span>
              </div>
              <div className="space-y-0.5">
                {g.items.map((r) => (
                  <button
                    key={`${g.group}-${r.id}`}
                    onClick={() => runAction(r)}
                    className={cn(
                      'fx-hover-lift flex w-full items-start gap-3 rounded-xl border border-transparent px-3 py-2 text-left transition-colors hover:border-fx-gold/15 hover:bg-sidebar-accent/60'
                    )}
                  >
                    <span className="mt-0.5 shrink-0 text-muted-foreground">{meta.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">{r.title}</span>
                      {r.subtitle && (
                        <span className="block truncate text-[11px] text-muted-foreground">{r.subtitle}</span>
                      )}
                      {r.snippet && (
                        <span className="block truncate text-xs text-muted-foreground/70">{r.snippet}</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
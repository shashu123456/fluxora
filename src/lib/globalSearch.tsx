import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  MessageSquare,
  FileText,
  Brain,
  Settings as SettingsIcon,
  Folder,
  Zap,
  MessageCircle,
  TerminalSquare,
  BookMarked,
  Bell,
} from 'lucide-react'
import type { GlobalSearchResult } from '@/types'
import { useUIStore } from '@/stores/uiStore'
import { useChatStore } from '@/stores/chatStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { WorkspacePanel } from '@/stores/workspaceStore'
import { patchSettings, useSettingsStore } from '@/stores/settingsStore'

/**
 * Single source of truth for global search: the group taxonomy, the debounce
 * behaviour and the result dispatcher are shared by the title bar, the search
 * view and the command palette so they can never drift apart again.
 */

export const SEARCH_MIN_CHARS = 2
export const SEARCH_DEBOUNCE_MS = 180

function activeWorkspaceId(): string | undefined {
  const fromSettings = useSettingsStore.getState().settings.lastWorkspaceId
  return fromSettings || useWorkspaceStore.getState().currentWorkspace?.id || undefined
}

export const GROUP_ORDER = [
  'chats',
  'messages',
  'files',
  'brain',
  'terminal',
  'models',
  'workspaces',
  'prompts',
  'memories',
  'providers',
  'settings',
  'notifications',
]

export const GROUP_META: Record<string, { label: string; icon: React.ReactNode }> = {
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
  brain: { label: 'Project brain', icon: <BookMarked className="h-4 w-4" /> },
  notifications: { label: 'Notifications', icon: <Bell className="h-4 w-4" /> },
}

export interface GlobalSearchState {
  results: GlobalSearchResult[]
  loading: boolean
  query: string
  setQuery: (q: string) => void
  clear: () => void
}

/**
 * Debounced global search hook. `limit` caps the number of results returned
 * (the title bar shows a short list, the search page shows everything).
 */
export function useGlobalSearch(limit?: number): GlobalSearchState {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GlobalSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const requestId = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (q.length < SEARCH_MIN_CHARS) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    const id = ++requestId.current
    const timer = setTimeout(async () => {
      try {
        const res = await window.api.search.global(q, activeWorkspaceId())
        if (id !== requestId.current) return
        try {
          void window.api?.developer?.track('search', { key: q, workspaceId: activeWorkspaceId() })
        } catch {
          /* tracking is best-effort */
        }
        setResults(limit ? (res || []).slice(0, limit) : res || [])
      } catch {
        if (id === requestId.current) setResults([])
      } finally {
        if (id === requestId.current) setLoading(false)
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [query, limit])

  const clear = useMemo(
    () => () => {
      setQuery('')
      setResults([])
      setLoading(false)
    },
    []
  )

  return { results, loading, query, setQuery, clear }
}

export interface GroupedSearchResults {
  group: string
  label: string
  icon: React.ReactNode
  items: GlobalSearchResult[]
}

export function groupSearchResults(results: GlobalSearchResult[]): GroupedSearchResults[] {
  const map = new Map<string, GlobalSearchResult[]>()
  for (const r of results) {
    const arr = map.get(r.group) || []
    arr.push(r)
    map.set(r.group, arr)
  }
  return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
    group: g,
    label: GROUP_META[g]?.label || g,
    icon: GROUP_META[g]?.icon || <Search className="h-4 w-4" />,
    items: map.get(g)!,
  }))
}

function toWorkspacePanel(value: unknown): WorkspacePanel | null {
  if (value === 'explorer' || value === 'terminal-git' || value === 'intelligence' || value === 'brain') {
    return value
  }
  if (value === 'terminal' || value === 'git' || value === 'terminal-git') return 'terminal-git'
  return null
}

/**
 * Executes the action attached to a global search result. Every consumer
 * (title bar, search page, command palette) routes through this function so a
 * result always lands in the same place.
 */
export async function runGlobalSearchAction(result: GlobalSearchResult): Promise<void> {
  const action = result.action
  if (!action) return
  const ui = useUIStore.getState()
  const chat = useChatStore.getState()
  const workspace = useWorkspaceStore.getState()

  switch (action.kind) {
    case 'openChat': {
      if (action.workspaceId && action.workspaceId !== 'global') {
        workspace.focusWorkspace(action.workspaceId, workspace.panel)
      }
      chat.setCurrentChat(action.chatId)
      ui.setActiveTab('chat')
      break
    }
    case 'openView': {
      const panel = toWorkspacePanel(action.panel)
      if (action.tab === 'workspace') {
        if (action.workspaceId) {
          workspace.focusWorkspace(action.workspaceId, panel || 'explorer', action.filePath || null)
        } else if (panel) {
          workspace.setPanel(panel)
        }
      }
      ui.setActiveTab(action.tab)
      break
    }
    case 'openWorkspace': {
      const panel = toWorkspacePanel(action.panel) || 'explorer'
      if (action.workspaceId) {
        workspace.focusWorkspace(action.workspaceId, panel, action.filePath || null)
      }
      ui.setActiveTab('workspace')
      break
    }
    case 'pickModel': {
      patchSettings({ defaultProviderId: action.providerId, defaultModelId: action.modelId })
      const currentChatId = useChatStore.getState().currentChatId
      if (currentChatId) {
        await useChatStore.getState().updateChat(currentChatId, {
          providerId: action.providerId,
          modelId: action.modelId,
        })
      }
      break
    }
    case 'setActiveChat': {
      chat.setCurrentChat(action.chatId)
      ui.setActiveTab('chat')
      break
    }
    default:
      break
  }
}

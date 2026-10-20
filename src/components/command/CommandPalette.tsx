import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  Plus,
  MessageSquare,
  Folder,
  Brain,
  FileText,
  Activity,
  Settings as SettingsIcon,
  PanelLeft,
  Sun,
  Moon,
  Zap,
  Star,
  CornerDownLeft,
} from 'lucide-react'
import type { CommandPaletteItem } from '@/types'
import { useUIStore } from '@/stores/uiStore'
import { useChatStore } from '@/stores/chatStore'
import { usePromptStore } from '@/stores/promptStore'
import { useProviderStore } from '@/stores/providerStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useMemoryStore } from '@/stores/memoryStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { cn } from '@/lib/utils'

const ICONS: Record<string, React.ReactNode> = {
  plus: <Plus className="h-4 w-4" />,
  chat: <MessageSquare className="h-4 w-4" />,
  workspace: <Folder className="h-4 w-4" />,
  memory: <Brain className="h-4 w-4" />,
  prompts: <FileText className="h-4 w-4" />,
  usage: <Activity className="h-4 w-4" />,
  settings: <SettingsIcon className="h-4 w-4" />,
  sidebar: <PanelLeft className="h-4 w-4" />,
  sun: <Sun className="h-4 w-4" />,
  moon: <Moon className="h-4 w-4" />,
  zap: <Zap className="h-4 w-4" />,
  star: <Star className="h-4 w-4" />,
  file: <FileText className="h-4 w-4" />,
}

const RECENT_LIMIT = 6

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const theme = useUIStore((s) => s.theme)
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const setTheme = useUIStore((s) => s.setTheme)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const setActiveTab = useUIStore((s) => s.setActiveTab)
  const setPendingPromptContent = useUIStore((s) => s.setPendingPromptContent)
  const chats = useChatStore((s) => s.chats)
  const createChat = useChatStore((s) => s.createChat)
  const setCurrentChat = useChatStore((s) => s.setCurrentChat)
  const updateChat = useChatStore((s) => s.updateChat)
  const currentChatId = useChatStore((s) => s.currentChatId)
  const prompts = usePromptStore((s) => s.prompts)
  const providers = useProviderStore((s) => s.providers)
  const favoriteModels = useProviderStore((s) => s.favoriteModels)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const selectWorkspace = useWorkspaceStore((s) => s.selectWorkspace)
  const indexes = useWorkspaceStore((s) => s.indexes)
  const memories = useMemoryStore((s) => s.memories)
  const updateSettings = useSettingsStore((s) => s.updateSettings)

  const switchTab = (t: string) => {
    setActiveTab(t)
  }

  const openChat = (id: string) => {
    setCurrentChat(id)
    switchTab('chat')
  }

  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const items = useMemo<CommandPaletteItem[]>(() => {
    const list: CommandPaletteItem[] = []

    list.push(
      { id: 'act-new-chat', group: 'Actions', title: 'New chat', icon: 'plus', keywords: ['new', 'chat', 'start'], action: () => createChat({ workspaceId: 'global' }).then((c) => openChat(c.id)) },
      { id: 'act-chat', group: 'Actions', title: 'Go to Chat', icon: 'chat', keywords: ['chat', 'home'], action: () => switchTab('chat') },
      { id: 'act-workspace', group: 'Actions', title: 'Open Workspace', icon: 'workspace', keywords: ['files', 'folder', 'code', 'project'], action: () => switchTab('workspace') },
      { id: 'act-memory', group: 'Actions', title: 'Open Memory', icon: 'memory', keywords: ['memory', 'remember', 'context'], action: () => switchTab('memory') },
      { id: 'act-prompts', group: 'Actions', title: 'Open Prompt Library', icon: 'prompts', keywords: ['prompt', 'template', 'library'], action: () => switchTab('prompts') },
      { id: 'act-usage', group: 'Actions', title: 'View Usage', icon: 'usage', keywords: ['usage', 'tokens', 'cost', 'billing'], action: () => switchTab('usage') },
      { id: 'act-settings', group: 'Actions', title: 'Open Settings', icon: 'settings', keywords: ['settings', 'preferences', 'configure', 'provider'], action: () => switchTab('settings') },
      { id: 'act-sidebar', group: 'Actions', title: sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar', icon: 'sidebar', keywords: ['sidebar', 'panel', 'nav'], action: () => toggleSidebar() },
      { id: 'act-theme', group: 'Actions', title: theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme', icon: theme === 'light' ? 'moon' : 'sun', keywords: ['theme', 'dark', 'light', 'mode'], action: () => setTheme(theme === 'light' ? 'dark' : 'light') },
    )

    for (const chat of chats.slice(0, RECENT_LIMIT)) {
      list.push({
        id: `chat-${chat.id}`,
        group: 'Chats',
        title: chat.title || 'Untitled chat',
        icon: 'chat',
        keywords: ['chat', 'recent', 'conversation'],
        action: () => openChat(chat.id),
      })
    }

    for (const p of prompts) {
      list.push({
        id: `prompt-${p.id}`,
        group: 'Prompts',
        title: p.name,
        subtitle: p.content.slice(0, 90),
        icon: 'prompts',
        keywords: ['prompt', 'template', p.category],
        action: () => {
          setPendingPromptContent(p.content)
          switchTab('chat')
        },
      })
    }

    for (const prov of providers) {
      for (const m of prov.models || []) {
        list.push({
          id: `model-${prov.id}-${m.id}`,
          group: 'Models',
          title: m.name,
          subtitle: `${prov.name} · ${m.id}`,
          icon: favoriteModels[prov.id] === m.id ? 'star' : 'zap',
          keywords: ['model', 'provider', prov.name, m.id],
          action: () => {
            updateSettings({ defaultProviderId: prov.id, defaultModelId: m.id })
            if (currentChatId) {
              const chat = chats.find((c) => c.id === currentChatId)
              if (chat) updateChat(currentChatId, { providerId: prov.id, modelId: m.id }).catch(() => {})
            }
          },
        })
      }
    }

    for (const ws of workspaces) {
      list.push({
        id: `ws-${ws.id}`,
        group: 'Workspaces',
        title: ws.name,
        subtitle: ws.path,
        icon: 'workspace',
        keywords: ['workspace', 'project', 'folder'],
        action: () => {
          selectWorkspace(ws.id)
          switchTab('workspace')
        },
      })
    }

    for (const prov of providers) {
      list.push({
        id: `prov-${prov.id}`,
        group: 'Providers',
        title: prov.name,
        subtitle: prov.enabled ? `${prov.type} · enabled` : `${prov.type} · disabled`,
        icon: 'zap',
        keywords: ['provider', prov.type, prov.name],
        action: () => switchTab('settings'),
      })
    }

    const allFileResults: CommandPaletteItem[] = []
    for (const ws of workspaces) {
      const wsIdx = useWorkspaceStore.getState().indexes[ws.id]
      if (!wsIdx) continue
      for (const rf of (wsIdx.recentFiles || []).slice(0, 8)) {
        const name = rf.path.split(/[\\/]/).pop() || rf.path
        allFileResults.push({
          id: `file-${ws.id}-${rf.path}`,
          group: 'Files',
          title: name,
          subtitle: `${ws.name} · ${rf.path}`,
          icon: 'file',
          keywords: ['file', 'project', name, ws.name],
          action: () => { selectWorkspace(ws.id); switchTab('workspace') },
        })
      }
    }
    if (allFileResults.length > 0) {
      list.push(...allFileResults.slice(0, 15))
    }

    const topMemories = memories.slice(0, 5)
    for (const mem of topMemories) {
      list.push({
        id: `mem-${mem.id}`,
        group: 'Memory',
        title: mem.content.slice(0, 70),
        subtitle: mem.type,
        icon: 'memory',
        keywords: ['memory', mem.type, mem.scope],
        action: () => switchTab('memory'),
      })
    }

    const wsId = useWorkspaceStore.getState().currentWorkspace?.id
    const wsIndex = wsId ? useWorkspaceStore.getState().indexes[wsId] : undefined
    const recentFiles = wsIndex?.recentFiles.slice(0, 5) || []
    for (const rf of recentFiles) {
      const name = rf.path.split(/[\\/]/).pop() || rf.path
      list.push({
        id: `file-${rf.path}`,
        group: 'Recent files',
        title: name,
        subtitle: rf.path,
        icon: 'file',
        keywords: ['file', 'recent', name],
        action: () => setActiveTab('workspace'),
      })
    }

    return list
  }, [chats, prompts, providers, favoriteModels, workspaces, indexes, memories, sidebarCollapsed, theme, currentChatId, updateChat])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => {
      const hay = `${it.title} ${it.subtitle || ''} ${it.group} ${(it.keywords || []).join(' ')}`.toLowerCase()
      return hay.includes(q)
    })
  }, [items, query])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  if (!open) return null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = filtered[activeIndex]
      if (item) {
        item.action({})
        onClose()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  const groups: { name: string; items: CommandPaletteItem[] }[] = []
  let lastGroup: string | null = null
  for (const item of filtered) {
    if (item.group !== lastGroup) {
      groups.push({ name: item.group, items: [item] })
      lastGroup = item.group
    } else {
      groups[groups.length - 1].items.push(item)
    }
  }

  let flatIndex = 0
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="fx-surface w-[600px] max-w-[92vw] overflow-hidden rounded-2xl p-2 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border/40 px-3 pb-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search chats, prompts, models, workspaces, actions…"
            className="flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border/60 bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">ESC</kbd>
        </div>
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1">
          {groups.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              No results for “{query}”
            </p>
          )}
          {groups.map((g) => (
            <div key={g.name} className="mb-1">
              <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {g.name}
              </div>
              {g.items.map((it) => {
                const idx = flatIndex++
                const active = idx === activeIndex
                return (
                  <button
                    key={it.id}
                    data-index={idx}
                    type="button"
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => {
                      it.action({})
                      onClose()
                    }}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left',
                      active && 'bg-primary/10 text-primary-foreground ring-1 ring-inset ring-primary/20'
                    )}
                  >
                    <span className={cn('shrink-0', active ? 'text-primary' : 'text-muted-foreground')}>
                      {ICONS[it.icon || '']|| <Zap className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{it.title}</span>
                      {it.subtitle && (
                        <span className="block truncate text-[11px] text-muted-foreground">{it.subtitle}</span>
                      )}
                    </span>
                    {active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-primary" />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 border-t border-border/40 px-3 pt-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><CornerDownLeft className="h-3 w-3" /> open</span>
          <span className="flex items-center gap-1">↑↓ navigate</span>
          <span className="flex items-center gap-1">esc dismiss</span>
          <span className="ml-auto">Ctrl + K</span>
        </div>
      </div>
    </div>
  )
}
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
  Home,
  Network,
  RefreshCw,
  Download,
  Sparkles,
  HardDriveDownload,
  UserRound,
} from 'lucide-react'
import type { CommandPaletteItem } from '@/types'
import { useUIStore } from '@/stores/uiStore'
import { useChatStore } from '@/stores/chatStore'
import { usePromptStore } from '@/stores/promptStore'
import { useProviderStore } from '@/stores/providerStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useMemoryStore } from '@/stores/memoryStore'
import { patchSettings } from '@/stores/settingsStore'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from '@/lib/navigation'
import { useGlobalSearch, runGlobalSearchAction } from '@/lib/globalSearch'
import { FluxoraMark } from '@/components/brand/FluxoraMark'

const mod = typeof window !== 'undefined' && window.api?.platform === 'darwin' ? '⌘' : 'Ctrl'

const ICONS: Record<string, React.ReactNode> = {
  plus: <Plus className="h-4 w-4" />,
  chat: <MessageSquare className="h-4 w-4" />,
  home: <Home className="h-4 w-4" />,
  search: <Search className="h-4 w-4" />,
  workspace: <Folder className="h-4 w-4" />,
  memory: <Brain className="h-4 w-4" />,
  prompts: <FileText className="h-4 w-4" />,
  usage: <Activity className="h-4 w-4" />,
  visualizations: <Network className="h-4 w-4" />,
  settings: <SettingsIcon className="h-4 w-4" />,
  developer: <UserRound className="h-4 w-4" />,
  sidebar: <PanelLeft className="h-4 w-4" />,
  sun: <Sun className="h-4 w-4" />,
  moon: <Moon className="h-4 w-4" />,
  zap: <Zap className="h-4 w-4" />,
  star: <Star className="h-4 w-4" />,
  file: <FileText className="h-4 w-4" />,
  suggest: <Sparkles className="h-4 w-4" />,
  sync: <RefreshCw className="h-4 w-4" />,
  export: <Download className="h-4 w-4" />,
  backup: <HardDriveDownload className="h-4 w-4" />,
}

const RECENT_LIMIT = 6
const FILE_LIMIT = 15
const MEMORY_LIMIT = 5

const GROUP_ORDER = [
  'Suggested',
  'Navigate',
  'Create',
  'Quick actions',
  'Chats',
  'Prompts',
  'Models',
  'Workspaces',
  'Providers',
  'Files',
  'Memory',
  'Search results',
]

function basename(p: string): string {
  return p.split(/[\\/]/).pop() || p
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const theme = useUIStore((s) => s.theme)
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const setTheme = useUIStore((s) => s.setTheme)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const setActiveTab = useUIStore((s) => s.setActiveTab)
  const setPendingPromptContent = useUIStore((s) => s.setPendingPromptContent)
  const setPendingCreate = useUIStore((s) => s.setPendingCreate)
  const chats = useChatStore((s) => s.chats)
  const createChat = useChatStore((s) => s.createChat)
  const setCurrentChat = useChatStore((s) => s.setCurrentChat)
  const updateChat = useChatStore((s) => s.updateChat)
  const currentChatId = useChatStore((s) => s.currentChatId)
  const prompts = usePromptStore((s) => s.prompts)
  const providers = useProviderStore((s) => s.providers)
  const favoriteModels = useProviderStore((s) => s.favoriteModels)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const indexes = useWorkspaceStore((s) => s.indexes)
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace)
  const focusWorkspace = useWorkspaceStore((s) => s.focusWorkspace)
  const openFolder = useWorkspaceStore((s) => s.openFolder)
  const memories = useMemoryStore((s) => s.memories)

  const search = useGlobalSearch()
  const query = search.query
  const setQuery = search.setQuery

  const switchTab = (t: typeof NAV_ITEMS[number]['id']) => {
    setActiveTab(t)
  }

  const openChat = (id: string) => {
    setCurrentChat(id)
    switchTab('chat')
  }

  useEffect(() => {
    if (open) {
      search.clear()
      setActiveIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const items = useMemo<CommandPaletteItem[]>(() => {
    const list: CommandPaletteItem[] = []
    const activeWorkspace = currentWorkspace
    const activeWorkspaceId = activeWorkspace?.id
    const scopeWorkspaceId = activeWorkspaceId || 'global'

    /* ---------------------------------------------------------- Suggested */
    const lastChat = chats[0]
    if (lastChat) {
      list.push({
        id: 'sug-continue-chat',
        group: 'Suggested',
        title: `Continue: ${lastChat.title || 'Untitled chat'}`,
        subtitle: 'Reopen your most recent conversation',
        icon: 'suggest',
        keywords: ['continue', 'recent', 'last', 'chat', 'resume'],
        action: () => openChat(lastChat.id),
      })
    }
    if (activeWorkspace) {
      const hasIndex = !!indexes[activeWorkspaceId!]
      list.push({
        id: 'sug-brain',
        group: 'Suggested',
        title: `Open project brain · ${activeWorkspace.name}`,
        subtitle: 'Architecture, decisions and conventions captured for this project',
        icon: 'brain',
        keywords: ['brain', 'project', 'knowledge', activeWorkspace.name],
        action: () => {
          focusWorkspace(activeWorkspaceId!, 'brain')
          switchTab('workspace')
        },
      })
      list.push({
        id: 'sug-sync-brain',
        group: 'Suggested',
        title: `Sync project brain · ${activeWorkspace.name}`,
        subtitle: 'Regenerate the auto sections from the current workspace index',
        icon: 'sync',
        keywords: ['sync', 'brain', 'refresh', 'regenerate', activeWorkspace.name],
        action: () => {
          window.api.brain.sync(activeWorkspaceId!).catch(() => {})
        },
      })
      if (!hasIndex) {
        list.push({
          id: 'sug-index',
          group: 'Suggested',
          title: `Index workspace · ${activeWorkspace.name}`,
          subtitle: 'This project has never been indexed',
          icon: 'sync',
          keywords: ['index', 'scan', 'workspace', activeWorkspace.name],
          action: () => {
            useWorkspaceStore.getState().indexWorkspace(activeWorkspaceId!).catch(() => {})
          },
        })
      }
    }

    /* ---------------------------------------------------------- Navigate */
    for (const nav of NAV_ITEMS) {
      list.push({
        id: `nav-${nav.id}`,
        group: 'Navigate',
        title: nav.label,
        subtitle: nav.shortcut,
        icon: nav.icon,
        keywords: ['go to', 'open', 'navigate', ...nav.keywords],
        action: () => switchTab(nav.id),
      })
    }

    /* ------------------------------------------------------------ Create */
    list.push(
      {
        id: 'act-new-chat',
        group: 'Create',
        title: 'New chat',
        subtitle: activeWorkspace ? `In ${activeWorkspace.name}` : 'Global conversation',
        icon: 'plus',
        keywords: ['new', 'chat', 'start', 'conversation'],
        action: () => {
          createChat({ workspaceId: scopeWorkspaceId })
            .then((c) => c && openChat(c.id))
            .catch(() => {})
        },
      },
      {
        id: 'act-new-memory',
        group: 'Create',
        title: 'New memory',
        subtitle: 'Capture a durable fact',
        icon: 'memory',
        keywords: ['new', 'memory', 'note', 'remember', 'capture'],
        action: () => {
          setPendingCreate('memory')
          switchTab('memory')
        },
      },
      {
        id: 'act-new-prompt',
        group: 'Create',
        title: 'New prompt',
        subtitle: 'Create a reusable template',
        icon: 'prompts',
        keywords: ['new', 'prompt', 'template', 'snippet'],
        action: () => {
          setPendingCreate('prompt')
          switchTab('prompts')
        },
      },
      {
        id: 'act-new-workspace',
        group: 'Create',
        title: 'Add workspace',
        subtitle: 'Point Fluxora at a folder',
        icon: 'workspace',
        keywords: ['new', 'add', 'workspace', 'project', 'folder', 'open'],
        action: () => {
          openFolder().catch(() => {})
        },
      }
    )

    /* ----------------------------------------------------- Quick actions */
    list.push(
      {
        id: 'act-sidebar',
        group: 'Quick actions',
        title: sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar',
        icon: 'sidebar',
        keywords: ['sidebar', 'panel', 'nav', 'collapse', 'expand'],
        action: () => toggleSidebar(),
      },
      {
        id: 'act-theme',
        group: 'Quick actions',
        title: theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme',
        icon: theme === 'light' ? 'moon' : 'sun',
        keywords: ['theme', 'dark', 'light', 'mode', 'appearance'],
        action: () => setTheme(theme === 'light' ? 'dark' : 'light'),
      },
      {
        id: 'act-search',
        group: 'Quick actions',
        title: 'Search everything',
        subtitle: 'Full-text across chats, files, brain and memory',
        icon: 'search',
        keywords: ['search', 'find', 'spotlight', 'everything'],
        action: () => switchTab('search'),
      },
      {
        id: 'act-backup',
        group: 'Quick actions',
        title: 'Create backup',
        subtitle: 'Snapshot the local database',
        icon: 'backup',
        keywords: ['backup', 'snapshot', 'safe', 'copy'],
        action: () => {
          window.api.backup.create().catch(() => {})
        },
      },
      {
        id: 'act-export',
        group: 'Quick actions',
        title: 'Export all data',
        subtitle: 'Write a portable JSON archive',
        icon: 'export',
        keywords: ['export', 'download', 'archive', 'portable', 'json'],
        action: () => {
          window.api.settings.exportAllData().catch(() => {})
        },
      }
    )

    /* ------------------------------------------------------------- Chats */
    for (const chat of chats.slice(0, RECENT_LIMIT)) {
      list.push({
        id: `chat-${chat.id}`,
        group: 'Chats',
        title: chat.title || 'Untitled chat',
        subtitle: chat.workspaceId && chat.workspaceId !== 'global' ? chat.workspaceId : undefined,
        icon: 'chat',
        keywords: ['chat', 'recent', 'conversation'],
        action: () => openChat(chat.id),
      })
    }

    /* ----------------------------------------------------------- Prompts */
    for (const p of prompts) {
      list.push({
        id: `prompt-${p.id}`,
        group: 'Prompts',
        title: p.name,
        subtitle: p.content.slice(0, 90),
        icon: 'prompts',
        keywords: ['prompt', 'template', p.category || 'general'],
        action: () => {
          setPendingPromptContent(p.content)
          switchTab('chat')
        },
      })
    }

    /* ------------------------------------------------------------ Models */
    for (const prov of providers) {
      for (const m of prov.models || []) {
        const isFav = favoriteModels[prov.id] === m.id
        list.push({
          id: `model-${prov.id}-${m.id}`,
          group: 'Models',
          title: m.name,
          subtitle: `${prov.name} · ${m.id}`,
          icon: isFav ? 'star' : 'zap',
          keywords: ['model', 'provider', prov.name, m.id],
          action: () => {
            patchSettings({ defaultProviderId: prov.id, defaultModelId: m.id })
            if (currentChatId) {
              updateChat(currentChatId, { providerId: prov.id, modelId: m.id }).catch(() => {})
            }
          },
        })
      }
    }

    /* -------------------------------------------------------- Workspaces */
    for (const ws of workspaces) {
      list.push({
        id: `ws-${ws.id}`,
        group: 'Workspaces',
        title: ws.name,
        subtitle: ws.path,
        icon: 'workspace',
        keywords: ['workspace', 'project', 'folder'],
        action: () => {
          focusWorkspace(ws.id, 'explorer')
          switchTab('workspace')
        },
      })
    }

    /* --------------------------------------------------------- Providers */
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

    /* ------------------------------------------------------------- Files */
    const fileItems: CommandPaletteItem[] = []
    const seenFiles = new Set<string>()
    const ordered = activeWorkspace
      ? [activeWorkspace, ...workspaces.filter((w) => w.id !== activeWorkspace.id)]
      : workspaces
    for (const ws of ordered) {
      const wsIdx = indexes[ws.id]
      if (!wsIdx) continue
      for (const rf of (wsIdx.recentFiles || []).slice(0, 8)) {
        const key = `${ws.id}::${rf.path}`
        if (seenFiles.has(key)) continue
        seenFiles.add(key)
        fileItems.push({
          id: `file-${key}`,
          group: 'Files',
          title: basename(rf.path),
          subtitle: `${ws.name} · ${rf.path}`,
          icon: 'file',
          keywords: ['file', 'open', 'project', basename(rf.path), ws.name],
          action: () => {
            focusWorkspace(ws.id, 'explorer', rf.path)
            switchTab('workspace')
          },
        })
      }
    }
    list.push(...fileItems.slice(0, FILE_LIMIT))

    /* ------------------------------------------------------------ Memory */
    for (const mem of memories.slice(0, MEMORY_LIMIT)) {
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

    return list
  }, [
    chats,
    prompts,
    providers,
    favoriteModels,
    workspaces,
    indexes,
    currentWorkspace,
    memories,
    sidebarCollapsed,
    theme,
    currentChatId,
    updateChat,
    createChat,
    focusWorkspace,
    openFolder,
    setActiveTab,
    setPendingCreate,
    setPendingPromptContent,
    setTheme,
    toggleSidebar,
  ])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => {
      const hay = `${it.title} ${it.subtitle || ''} ${it.group} ${(it.keywords || []).join(' ')}`.toLowerCase()
      return hay.includes(q)
    })
  }, [items, query])

  const remoteResults = useMemo(() => {
    const q = query.trim()
    if (q.length < 2) return []
    return search.results.slice(0, 12).map((r) => ({
      id: `remote-${r.group}-${r.id}`,
      group: 'Search results',
      title: r.title,
      subtitle: r.subtitle,
      icon: r.group === 'files' ? 'file' : r.group === 'chats' ? 'chat' : r.group === 'brain' ? 'brain' : 'zap',
      keywords: [r.group, r.title],
      action: () => {
        runGlobalSearchAction(r)
      },
    }))
  }, [search.results, query])

  const allItems = useMemo(() => {
    if (remoteResults.length === 0) return filtered
    const remoteIds = new Set(remoteResults.map((r) => r.id))
    return [...filtered.filter((i) => !remoteIds.has(i.id)), ...remoteResults]
  }, [filtered, remoteResults])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, allItems])

  if (!open) return null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, allItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = allItems[activeIndex]
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
  for (const name of GROUP_ORDER) {
    const groupItems = allItems.filter((i) => i.group === name)
    if (groupItems.length > 0) groups.push({ name, items: groupItems })
  }

  let flatIndex = 0
  return (
    <div
      className="fx-fade fixed inset-0 z-50 flex items-start justify-center bg-black/55 pt-[12vh] backdrop-blur-md"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="fx-enter-scale relative w-[660px] max-w-[92vw] overflow-hidden rounded-2xl border border-border/60 bg-popover/95 shadow-float backdrop-blur-2xl"
      >
        {search.loading && (
          <div className="absolute inset-x-0 top-0 h-px overflow-hidden">
            <div className="h-full w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-fx-gold/80 to-transparent bg-[length:200%_100%]" />
          </div>
        )}
        <div className="flex items-center gap-3 border-b border-border/40 px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search or run a command…"
            className="flex-1 bg-transparent py-3.5 text-[13.5px] outline-none placeholder:text-muted-foreground/70"
          />
          <span className="hidden items-center gap-1.5 text-[10px] text-muted-foreground/70 sm:flex">
            <kbd className="fx-kbd">esc</kbd>
          </span>
        </div>
        <div ref={listRef} className="fx-scroll max-h-[58vh] overflow-y-auto px-2 pb-2">
          {allItems.length === 0 && (
            <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
              <FluxoraMark size={26} className="opacity-70" />
              <div>
                <p className="text-[13px] text-foreground">
                  {query ? `Nothing matches “${query}”` : 'Nothing to run yet'}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Try a page name, a file, a command, or part of a conversation.
                </p>
              </div>
            </div>
          )}
          {groups.map((g) => (
            <div key={g.name} className="mb-0.5">
              <div className="sticky top-0 z-10 -mx-2 flex items-center gap-2 bg-popover/95 px-4 pb-1 pt-3 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80 backdrop-blur-xl">
                {g.name}
                <span className="text-muted-foreground/40">{g.items.length}</span>
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
                      'fx-press flex w-full items-center gap-2.5 rounded-lg py-2 pl-2.5 pr-3 text-left transition-colors duration-1',
                      active
                        ? 'bg-fx-gold/10 shadow-[inset_2px_0_0_hsl(var(--fx-gold)/0.8)]'
                        : 'hover:bg-accent/40'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                        active ? 'bg-fx-gold/15 text-fx-gold' : 'text-muted-foreground'
                      )}
                    >
                      {ICONS[it.icon || ''] || <Zap className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-foreground">{it.title}</span>
                      {it.subtitle && (
                        <span className="block truncate text-[11px] text-muted-foreground">{it.subtitle}</span>
                      )}
                    </span>
                    {active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-fx-gold/80" />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 border-t border-border/40 px-4 py-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><kbd className="fx-kbd">↵</kbd> open</span>
          <span className="flex items-center gap-1.5"><kbd className="fx-kbd">↑</kbd><kbd className="fx-kbd">↓</kbd> move</span>
          <span className="flex items-center gap-1.5"><kbd className="fx-kbd">esc</kbd> dismiss</span>
          <span className="ml-auto flex items-center gap-1.5">
            <FluxoraMark size={11} className="opacity-60" />
            <kbd className="fx-kbd">{mod}</kbd><kbd className="fx-kbd">K</kbd>
          </span>
        </div>
      </div>
    </div>
  )
}

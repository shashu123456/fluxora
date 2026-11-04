import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  Plus,
  Search,
  Settings,
  MessageSquare,
  FolderOpen,
  Library,
  BarChart3,
  Brain,
  Pin,
  Trash2,
  MoreHorizontal,
  Home,
  Activity,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { useChatStore } from '@/stores/chatStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { FluxoraLockup, FluxoraMark } from '@/components/brand/FluxoraMark'
import { formatRelativeTime } from '@/lib/utils'
import { NAV_ITEMS } from '@/lib/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const isMac = typeof window !== 'undefined' && window.api?.platform === 'darwin'
const mod = isMac ? '⌘' : 'Ctrl'

const NAV_ICONS: Record<string, React.ElementType> = {
  home: Home,
  chat: MessageSquare,
  search: Search,
  workspace: FolderOpen,
  memory: Brain,
  prompts: Library,
  visualizations: Activity,
  usage: BarChart3,
  settings: Settings,
  developer: UserRound,
}

function RailButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          onClick={onClick}
          className={cn(
            'fx-press flex h-9 w-9 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-fx-gold/35',
            active
              ? 'bg-fx-gold/10 text-foreground shadow-[inset_0_0_0_1px_hsl(var(--fx-gold)/0.22)]'
              : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
          )}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const activeTab = useUIStore((s) => s.activeTab)
  const setActiveTab = useUIStore((s) => s.setActiveTab)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const { filteredChats, currentChatId } = useChatStore()
  const createChat = useChatStore((s) => s.createChat)
  const setCurrentChat = useChatStore((s) => s.setCurrentChat)
  const deleteChat = useChatStore((s) => s.deleteChat)
  const updateChat = useChatStore((s) => s.updateChat)
  const searchChats = useChatStore((s) => s.searchChats)
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace)

  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const chatScope = currentWorkspace?.id || 'global'

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingId])

  useEffect(() => {
    const t = setTimeout(() => searchChats(chatScope, query), 200)
    return () => clearTimeout(t)
  }, [query, chatScope, searchChats])

  const onSelectChat = useCallback((id: string) => setCurrentChat(id), [setCurrentChat])
  const onDeleteChat = useCallback((id: string) => deleteChat(id), [deleteChat])
  const onRenameChat = useCallback((id: string) => {
    const title = useChatStore.getState().chats.find((c) => c.id === id)?.title || ''
    setEditingId(id)
    setEditTitle(title)
  }, [])
  const onTogglePin = useCallback(
    (id: string) => {
      const c = useChatStore.getState().chats.find((x) => x.id === id)
      if (c) updateChat(id, { pinned: c.pinned ? 0 : 1 })
    },
    [updateChat]
  )
  const onEditChange = useCallback((v: string) => setEditTitle(v), [])
  const onEditCommit = useCallback(
    (id: string) => {
      if (id) updateChat(id, { title: editTitle })
      setEditingId(null)
    },
    [editTitle, updateChat]
  )
  const onEditCancel = useCallback(() => setEditingId(null), [])

  if (collapsed) {
    return (
      <div className="fx-fade flex w-12 flex-col items-center gap-0.5 border-r border-border/40 bg-sidebar/70 py-2.5 backdrop-blur-xl app-no-drag">
        <RailButton
          icon={<FluxoraMark size={20} />}
          label="Mission Control"
          onClick={() => setActiveTab('home')}
          active={activeTab === 'home'}
        />
        <div className="my-1.5 h-px w-6 bg-border/50" />
        {NAV_ITEMS.filter((n) => n.id !== 'home' && n.id !== 'settings').map((n) => {
          const Icon = NAV_ICONS[n.icon] || Home
          return (
            <RailButton
              key={n.id}
              icon={<Icon className="h-[18px] w-[18px]" />}
              label={n.label}
              onClick={() => setActiveTab(n.id)}
              active={activeTab === n.id}
            />
          )
        })}
        <div className="flex-1" />
        <RailButton
          icon={<Settings className="h-[18px] w-[18px]" />}
          label="Settings"
          onClick={() => setActiveTab('settings')}
          active={activeTab === 'settings'}
        />
        <RailButton icon={<PanelLeftOpen className="h-4 w-4" />} label="Expand sidebar" onClick={toggleSidebar} />
      </div>
    )
  }

  const pinned = filteredChats.filter((c) => c.pinned)
  const others = filteredChats.filter((c) => !c.pinned)

  return (
    <div className="fx-fade flex w-64 flex-col border-r border-border/40 bg-sidebar/70 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3 app-no-drag">
        <button
          onClick={() => setActiveTab('home')}
          className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-fx-gold/35"
          aria-label="Mission Control"
        >
          <FluxoraLockup size={18} />
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground/70"
          onClick={toggleSidebar}
          aria-label="Collapse sidebar"
          title={`Collapse sidebar (${mod} B)`}
        >
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>

      <div className="px-3 pb-2">
        <Button
          className="h-9 w-full justify-between px-3"
          onClick={() => createChat({ workspaceId: chatScope })}
        >
          <span className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> New chat
          </span>
          <kbd className="rounded border border-black/10 bg-black/10 px-1 py-0.5 font-sans text-[9px] font-medium text-primary-foreground/70">
            {mod} N
          </kbd>
        </Button>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground/70" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={currentWorkspace ? `Search ${currentWorkspace.name} chats` : 'Search chats'}
            className="h-8 rounded-lg pl-8 text-[12px]"
            aria-label="Search chats"
          />
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 px-2" aria-label="Primary">
        <div className="fx-caption">Navigate</div>
        {NAV_ITEMS.filter((n) => n.id !== 'settings').map((item) => {
          const Icon = NAV_ICONS[item.icon] || Home
          const active = activeTab === item.id
          return (
            <button
              key={item.id}
              data-active={active}
              aria-current={active ? 'page' : undefined}
              title={item.shortcut}
              onClick={() => setActiveTab(item.id)}
              className="fx-nav-item group outline-none focus-visible:ring-2 focus-visible:ring-fx-gold/30"
            >
              <Icon className="h-4 w-4 opacity-80" />
              <span className="truncate">{item.label}</span>
              {active ? <Sparkles className="ml-auto h-3 w-3 text-fx-gold/70" /> : null}
            </button>
          )
        })}
      </nav>

      <div className="mt-3 flex items-center justify-between px-3 pb-1">
        <span className="fx-label">Chats</span>
        <span className="text-[10px] tabular-nums text-muted-foreground/50">{filteredChats.length}</span>
      </div>

      <div className="fx-scroll flex-1 px-2 pb-2">
        {pinned.length > 0 && (
          <>
            <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
              <Pin className="h-2.5 w-2.5" /> Pinned
            </div>
            {pinned.map((c) => (
              <ChatRow
                key={c.id}
                chat={c}
                active={currentChatId === c.id}
                editing={editingId === c.id}
                editTitle={editTitle}
                onSelect={onSelectChat}
                onDelete={onDeleteChat}
                onRename={onRenameChat}
                onTogglePin={onTogglePin}
                onEdit={onEditChange}
                onEditCommit={onEditCommit}
                onEditCancel={onEditCancel}
                inputRef={inputRef}
              />
            ))}
            {others.length > 0 && <div className="mx-2 my-1.5 h-px bg-border/40" />}
          </>
        )}
        {others.map((c) => (
          <ChatRow
            key={c.id}
            chat={c}
            active={currentChatId === c.id}
            editing={editingId === c.id}
            editTitle={editTitle}
            onSelect={onSelectChat}
            onDelete={onDeleteChat}
            onRename={onRenameChat}
            onTogglePin={onTogglePin}
            onEdit={onEditChange}
            onEditCommit={onEditCommit}
            onEditCancel={onEditCancel}
            inputRef={inputRef}
          />
        ))}
        {filteredChats.length === 0 && (
          <div className="fx-empty px-2 py-8">
            <MessageSquare className="h-4 w-4 text-muted-foreground/50" />
            <p className="text-[12px] text-muted-foreground/70">{query ? 'No conversations found' : 'No conversations yet'}</p>
          </div>
        )}
      </div>

      <div className="border-t border-border/40 p-2">
        <button
          onClick={() => setActiveTab('settings')}
          aria-current={activeTab === 'settings' ? 'page' : undefined}
          className={cn(
            'fx-nav-item w-full outline-none focus-visible:ring-2 focus-visible:ring-fx-gold/30',
            activeTab === 'settings' && 'text-sidebar-foreground'
          )}
        >
          <Settings className="h-4 w-4 opacity-80" /> Settings
          <kbd className="fx-kbd ml-auto">{mod} ,</kbd>
        </button>
      </div>
    </div>
  )
}

const ChatRow = memo(function ChatRow({
  chat,
  active,
  editing,
  editTitle,
  onSelect,
  onDelete,
  onRename,
  onTogglePin,
  onEdit,
  onEditCommit,
  onEditCancel,
  inputRef,
}: any) {
  return (
    <div className="group relative flex items-center">
      {editing ? (
        <div className="flex w-full items-center rounded-lg bg-background/70 p-1">
          <input
            ref={inputRef}
            value={editTitle}
            onChange={(e) => onEdit(e.target.value)}
            onBlur={() => onEditCommit(chat.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onEditCommit(chat.id)
              if (e.key === 'Escape') onEditCancel()
            }}
            className="h-7 w-full rounded-md border border-border/70 bg-transparent px-2 text-[13px] outline-none focus:border-fx-gold/45"
            autoFocus
            aria-label="Chat title"
          />
        </div>
      ) : (
        <button
          onClick={() => onSelect(chat.id)}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg py-1.5 pl-2.5 pr-8 text-left text-[13px] outline-none transition-colors duration-2 ease-fx focus-visible:ring-2 focus-visible:ring-fx-gold/30',
            active
              ? 'bg-fx-gold/10 font-medium text-foreground shadow-[inset_2px_0_0_hsl(var(--fx-gold)/0.75)]'
              : 'text-muted-foreground hover:bg-sidebar-accent/45 hover:text-sidebar-foreground'
          )}
        >
          <span className="min-w-0 flex-1 truncate">{chat.title || 'New chat'}</span>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/50">
            {formatRelativeTime(chat.updatedAt)}
          </span>
        </button>
      )}
      {!editing && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground transition-opacity duration-2',
                active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                'focus-visible:opacity-100'
              )}
              aria-label="Chat options"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => onTogglePin(chat.id)}>
              <Pin className="h-3.5 w-3.5" />
              {chat.pinned ? 'Unpin' : 'Pin to top'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onRename(chat.id)}>Rename</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onDelete(chat.id)} className="text-destructive focus:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
})

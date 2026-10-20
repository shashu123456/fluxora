import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Search, Settings, MessageSquare, FolderOpen, Library, BarChart3, Brain, X, Star, Pin, Trash2, Pencil, MoreHorizontal, Check, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { useChatStore } from '@/stores/chatStore'
import { FluxoraMark } from '@/components/brand/FluxoraMark'
import { formatRelativeTime, truncate } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

function RailButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-150 hover:scale-105 hover:bg-sidebar-accent/60',
        active
          ? 'bg-fx-gold/10 text-foreground shadow-[inset_0_0_0_1px_hsl(var(--fx-gold)/0.22)]'
          : 'text-muted-foreground hover:text-sidebar-foreground'
      )}
    >
      {icon}
    </button>
  )
}

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const activeTab = useUIStore((s) => s.activeTab)
  const setActiveTab = useUIStore((s) => s.setActiveTab)
  const { chats, filteredChats, currentChatId, searchQuery } = useChatStore()
  const createChat = useChatStore((s) => s.createChat)
  const setCurrentChat = useChatStore((s) => s.setCurrentChat)
  const deleteChat = useChatStore((s) => s.deleteChat)
  const updateChat = useChatStore((s) => s.updateChat)
  const searchChats = useChatStore((s) => s.searchChats)

  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingId])

  useEffect(() => {
    const t = setTimeout(() => searchChats('global', query), 200)
    return () => clearTimeout(t)
  }, [query, searchChats])

  const onSelectChat = useCallback((id: string) => setCurrentChat(id), [setCurrentChat])
  const onDeleteChat = useCallback((id: string) => deleteChat(id), [deleteChat])
  const onRenameChat = useCallback((id: string) => {
    const title = useChatStore.getState().chats.find((c) => c.id === id)?.title || ''
    setEditingId(id)
    setEditTitle(title)
  }, [])
  const onTogglePin = useCallback((id: string) => {
    const c = useChatStore.getState().chats.find((x) => x.id === id)
    if (c) updateChat(id, { pinned: c.pinned ? 0 : 1 })
  }, [updateChat])
  const onEditChange = useCallback((v: string) => setEditTitle(v), [])
  const onEditCommit = useCallback((id: string) => {
    if (id) updateChat(id, { title: editTitle })
    setEditingId(null)
  }, [editTitle, updateChat])
  const onEditCancel = useCallback(() => setEditingId(null), [])

  if (collapsed) {
    return (
      <div className="flex w-12 flex-col items-center border-r bg-sidebar py-2 app-no-drag">
        <RailButton icon={<FluxoraMark size={20} />} label="Home" onClick={() => setActiveTab('chat')} active={activeTab === 'chat'} />
        <div className="mb-1" />
        <RailButton icon={<MessageSquare className="h-[18px] w-[18px]" />} label="Chat" onClick={() => setActiveTab('chat')} active={activeTab === 'chat'} />
        <RailButton icon={<Home className="h-[18px] w-[18px]" />} label="Home" onClick={() => setActiveTab('home')} active={activeTab === 'home'} />
        <div className="mb-1" />
        <RailButton icon={<Search className="h-[18px] w-[18px]" />} label="Global Search" onClick={() => setActiveTab('search')} active={activeTab === 'search'} />
        <RailButton icon={<FolderOpen className="h-[18px] w-[18px]" />} label="Workspace" onClick={() => setActiveTab('workspace')} active={activeTab === 'workspace'} />
        <RailButton icon={<Brain className="h-[18px] w-[18px]" />} label="Memory" onClick={() => setActiveTab('memory')} active={activeTab === 'memory'} />
        <RailButton icon={<Library className="h-[18px] w-[18px]" />} label="Prompt Library" onClick={() => setActiveTab('prompts')} active={activeTab === 'prompts'} />
        <RailButton icon={<BarChart3 className="h-[18px] w-[18px]" />} label="Usage" onClick={() => setActiveTab('usage')} active={activeTab === 'usage'} />
        <div className="flex-1" />
        <RailButton icon={<Settings className="h-[18px] w-[18px]" />} label="Settings" onClick={() => setActiveTab('settings')} active={activeTab === 'settings'} />
      </div>
    )
  }

  const pinned = filteredChats.filter((c) => c.pinned)
  const others = filteredChats.filter((c) => !c.pinned)

  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'search', label: 'Global Search', icon: Search },
    { id: 'workspace', label: 'Workspace', icon: FolderOpen },
    { id: 'memory', label: 'Memory', icon: Brain },
    { id: 'prompts', label: 'Prompt Library', icon: Library },
    { id: 'usage', label: 'Usage', icon: BarChart3 },
  ]

  return (
    <div className="flex w-64 flex-col border-r bg-sidebar">
      <div className="flex items-center gap-2 app-no-drag px-3 pb-1 pt-2.5">
        <FluxoraMark size={18} className="shrink-0" />
        <span className="fx-wordmark text-[13px]">
          FLUXORA
        </span>
      </div>

      <div className="flex items-center gap-2 p-3">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-1.5"
          onClick={() => createChat({ workspaceId: 'global' })}
        >
          <Plus className="h-4 w-4" /> New chat
        </Button>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats..."
            className="h-9 pl-8"
          />
        </div>
      </div>

      <nav className="mb-1 flex flex-col gap-0.5 px-2">
        <div className="fx-caption">Navigate</div>
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              data-active={activeTab === item.id}
              onClick={() => setActiveTab(item.id)}
              className="fx-nav-item"
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          )
        })}
      </nav>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {pinned.length > 0 && (
          <>
            <div className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium uppercase text-muted-foreground">
              <Pin className="h-3 w-3" /> Pinned
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
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">
            {query ? 'No chats found' : 'No chats yet'}
          </div>
        )}
      </div>

      <div className="border-t p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={() => setActiveTab('settings')}
        >
          <Settings className="h-4 w-4" /> Settings
        </Button>
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
        <div className="flex w-full items-center gap-1 rounded-md bg-background p-1">
          <input
            ref={inputRef}
            value={editTitle}
            onChange={(e) => onEdit(e.target.value)}
            onBlur={() => onEditCommit(chat.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onEditCommit(chat.id)
              if (e.key === 'Escape') onEditCancel()
            }}
            className="h-7 w-full rounded border bg-transparent px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
        </div>
      ) : (
        <button
          onClick={() => onSelect(chat.id)}
          className={cn(
            'flex w-full items-center gap-2 rounded-md py-1.5 pl-2.5 pr-8 text-left text-sm transition-colors',
            active ? 'bg-sidebar-accent font-medium text-sidebar-foreground' : 'text-muted-foreground hover:bg-sidebar-accent/60'
          )}
        >
          <span className="flex-1 truncate">{chat.title || 'New chat'}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground/70">
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
                'absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground',
                active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                'focus-visible:opacity-100'
              )}
              aria-label="Chat options"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {chat.pinned ? (
              <DropdownMenuItem onClick={() => onTogglePin(chat.id)}>Unpin</DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => onTogglePin(chat.id)}>Pin to top</DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => onRename(chat.id)}>Rename</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete(chat.id)} className="text-destructive">
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
})
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Sparkles,
  Folder,
  FolderOpen,
  Plus,
  Search,
  MessageSquare,
  Cpu,
  Wallet,
  Brain,
  Pin,
  Clock,
  Flame,
  Layers,
  Activity,
  Star,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn, formatRelativeTime } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { useChatStore } from '@/stores/chatStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useProviderStore } from '@/stores/providerStore'
import { useMemoryStore } from '@/stores/memoryStore'
import { useSettingsStore } from '@/stores/settingsStore'

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'Working late'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

const todayKey = () => new Date().toDateString()

export function DashboardView() {
  const setActiveTab = useUIStore((s) => s.setActiveTab)
  const chats = useChatStore((s) => s.chats)
  const loadChats = useChatStore((s) => s.loadChats)
  const setCurrentChat = useChatStore((s) => s.setCurrentChat)
  const createChat = useChatStore((s) => s.createChat)
  const currentChatId = useChatStore((s) => s.currentChatId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const selectWorkspace = useWorkspaceStore((s) => s.selectWorkspace)
  const openFolder = useWorkspaceStore((s) => s.openFolder)
  const indexes = useWorkspaceStore((s) => s.indexes)
  const providers = useProviderStore((s) => s.providers)
  const connectionStatuses = useProviderStore((s) => s.connectionStatuses)
  const favoriteModels = useProviderStore((s) => s.favoriteModels)
  const memories = useMemoryStore((s) => s.memories)
  const loadMemories = useMemoryStore((s) => s.loadMemories)
  const settings = useSettingsStore((s) => s.settings)

  const [usage, setUsage] = useState<any>(null)
  const [byProvider, setByProvider] = useState<any[]>([])
  const [todayCount, setTodayCount] = useState(0)

  useEffect(() => {
    loadChats('global').catch(() => {})
    loadMemories('global').catch(() => {})
    window.api.usage.summary().then((s: any) => setUsage(s)).catch(() => {})
    window.api.usage.byProvider().then((rows: any[]) => setByProvider(rows || [])).catch(() => {})
    window.api.usage.detailed?.().then((rows: any[]) => {
      const today = (rows || []).filter((r) => new Date(r.createdAt).toDateString() === todayKey())
      setTodayCount(today.length)
    }).catch(() => {})
  }, [loadChats, loadMemories])

  const lastChat = useMemo(() => {
    if (!chats.length) return null
    const pinned = chats.filter((c) => c.pinned)
    return pinned[0] || chats[0]
  }, [chats])

  const recentChats = useMemo(() => [...chats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6), [chats])
  const pinnedWorkspaces = useMemo(() => workspaces.filter((w) => w.lastOpenedAt).sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0)).slice(0, 4), [workspaces])
  const recentWorkspaces = useMemo(() => workspaces.filter((w) => !w.lastOpenedAt || (w.id !== settings.lastWorkspaceId)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3), [workspaces, settings.lastWorkspaceId])
  const enabledProviders = useMemo(() => providers.filter((p) => p.enabled), [providers])
  const totalMemories = memories.length

  const openChat = (id: string) => {
    setCurrentChat(id)
    setActiveTab('chat')
  }

  const resumeLast = () => {
    const id = settings.lastChatId
    if (id && chats.some((c) => c.id === id)) {
      setCurrentChat(id)
      setActiveTab('chat')
    } else if (lastChat) {
      openChat(lastChat.id)
    } else {
      createChat({ workspaceId: 'global' }).then((c) => c && openChat(c.id))
    }
  }

  const openWorkspace = (id: string) => {
    selectWorkspace(id)
    setActiveTab('workspace')
  }

  const maxTokens = usage?.totalTokens || 0
  const maxProviderTokens = Math.max(1, ...byProvider.map((p) => p.totalTokens || 0))

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-8 py-8">
        <div className="fx-card relative overflow-hidden px-7 py-8">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-fx-gold/10 blur-3xl" />
          <div className="relative">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="fx-caption text-fx-gold">
                  {todayKey()}
                </div>
                <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
                  {greeting()}
                </h1>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  {settings.defaultModelId
                    ? `Resume where you left off with ${settings.defaultModelId}.`
                    : 'Resume where you left off, or start something new.'}
                </p>
              </div>
              <Button onClick={resumeLast} className="gap-2 shadow-lg shadow-fx-gold/10 transition-transform duration-150 hover:scale-[1.02]">
                <Sparkles className="h-4 w-4" />
                Continue recent work
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <QuickStat icon={<MessageSquare className="h-4 w-4" />} label="Chats" value={String(chats.length)} />
              <QuickStat icon={<Folder className="h-4 w-4" />} label="Projects" value={String(workspaces.length)} />
              <QuickStat icon={<Cpu className="h-4 w-4" />} label="Providers" value={String(enabledProviders.length)} />
              <QuickStat icon={<Brain className="h-4 w-4" />} label="Memories" value={String(totalMemories)} />
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            {lastChat && (
              <section>
                <SectionHeader icon={<Clock className="h-3.5 w-3.5" />} title="Continue recent work" />
                <button
                  onClick={resumeLast}
                  className="fx-hover-lift group flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-3 text-left"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fx-gold/10 text-fx-gold">
                    <MessageSquare className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{lastChat.title || 'New chat'}</span>
                    <span className="block text-xs text-muted-foreground">
                      Updated {formatRelativeTime(lastChat.updatedAt)} · {lastChat.pinned ? 'Pinned' : 'Most recent'}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-fx-gold" />
                </button>
              </section>
            )}

            <section>
              <SectionHeader icon={<Layers className="h-3.5 w-3.5" />} title="Recent chats" action={chats.length > 0 ? 'View all' : undefined} onAction={() => setActiveTab('chat')} />
              {recentChats.length === 0 ? (
                <EmptyPanel
                  icon={<MessageSquare className="h-5 w-5" />}
                  text="No conversations yet"
                  action="Start a chat"
                  onAction={() => createChat({ workspaceId: 'global' }).then((c) => c && openChat(c.id))}
                />
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {recentChats.map((chat) => (
                    <button
                      key={chat.id}
                      onClick={() => openChat(chat.id)}
                      className={cn(
                        'fx-hover-lift flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-2.5 text-left',
                        chat.id === currentChatId && 'border-fx-gold/25 bg-fx-gold/5'
                      )}
                    >
                      <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm">{chat.title || 'New chat'}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{formatRelativeTime(chat.updatedAt)}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section>
              <SectionHeader icon={<FolderOpen className="h-3.5 w-3.5" />} title="Recent projects" action={workspaces.length > 0 ? 'Open workspace' : undefined} onAction={() => setActiveTab('workspace')} />
              {(workspaces.length === 0) && (
                <EmptyPanel
                  icon={<FolderOpen className="h-5 w-5" />}
                  text="No projects yet"
                  action="Open a folder"
                  onAction={() => openFolder()}
                />
              )}
              {workspaces.length > 0 && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {workspaces.map((ws) => {
                    const idx = indexes[ws.id]
                    return (
                      <button
                        key={ws.id}
                        onClick={() => openWorkspace(ws.id)}
                        className="fx-hover-lift flex items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-2.5 text-left"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-fx-gold/10 text-fx-gold">
                          <Folder className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{ws.name}</span>
                          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            {idx && <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                            <span className="truncate">{idx ? `${idx.fileCount} files indexed` : (ws.path ? 'Not indexed yet' : 'No folder')}</span>
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    )
                  })}
                </div>
              )}
            </section>

            <section>
              <SectionHeader icon={<Activity className="h-3.5 w-3.5" />} title="Today's activity" />
              {todayCount === 0 ? (
                <EmptyPanel icon={<Activity className="h-5 w-5" />} text="No requests recorded today yet" />
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <StatTile label="Requests today" value={String(todayCount)} />
                  <StatTile label="Tokens used" value={formatCompact(usage?.totalTokens || 0)} />
                  <StatTile label="Estimated cost" value={`$${(usage?.cost || 0).toFixed(4)}`} />
                </div>
              )}
            </section>
          </div>

          <div className="flex flex-col gap-6">
            <section>
              <SectionHeader icon={<ZapIcon />} title="Quick actions" />
              <div className="flex flex-col gap-2">
                <QuickAction icon={<Plus className="h-4 w-4" />} label="New chat" onClick={() => createChat({ workspaceId: 'global' }).then((c) => c && openChat(c.id))} />
                <QuickAction icon={<FolderOpen className="h-4 w-4" />} label="Open a folder" onClick={() => openFolder()} />
                <QuickAction icon={<Search className="h-4 w-4" />} label="Global search" onClick={() => setActiveTab('search')} />
                <QuickAction icon={<Cpu className="h-4 w-4" />} label="Command palette  Ctrl K" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))} />
              </div>
            </section>

            {pinnedWorkspaces.length > 0 && (
              <section>
                <SectionHeader icon={<Pin className="h-3.5 w-3.5" />} title="Pinned workspaces" />
                <div className="flex flex-col gap-2">
                  {pinnedWorkspaces.map((ws) => (
                    <button
                      key={ws.id}
                      onClick={() => openWorkspace(ws.id)}
                      className="fx-hover-lift flex items-center gap-2.5 rounded-xl border border-border/60 bg-card/40 px-3.5 py-2.5 text-left"
                    >
                      <Pin className="h-3.5 w-3.5 shrink-0 text-fx-gold" />
                      <span className="min-w-0 flex-1 truncate text-sm">{ws.name}</span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section>
              <SectionHeader icon={<Cpu className="h-3.5 w-3.5" />} title="Provider status" />
              {enabledProviders.length === 0 ? (
                <EmptyPanel icon={<Cpu className="h-5 w-5" />} text="No providers configured" action="Open settings" onAction={() => setActiveTab('settings')} />
              ) : (
                <div className="flex flex-col gap-2">
                  {enabledProviders.slice(0, 5).map((p) => {
                    const status = connectionStatuses[p.id]
                    const fav = favoriteModels[p.id]
                    const dot = status === 'ok' ? 'bg-emerald-500' : status === 'error' || status === 'failed' ? 'bg-red-500' : 'bg-fx-gold/60'
                    return (
                      <div key={p.id} className="fx-hover-lift flex items-center gap-2.5 rounded-xl border border-border/60 bg-card/40 px-3.5 py-2.5">
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', dot)} />
                        <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                        {fav && (
                          <Badge variant="outline" className="gap-1 border-fx-gold/25 bg-fx-gold/5 px-1.5 py-0 text-[10px] text-fx-gold">
                            <Star className="h-2.5 w-2.5 fill-fx-gold" /> {fav}
                          </Badge>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            <section>
              <SectionHeader icon={<Wallet className="h-3.5 w-3.5" />} title="Token usage" />
              <div className="fx-card space-y-4 px-5 py-4">
                <div className="flex items-end justify-between">
                  <div>
                    <div className="fx-caption text-muted-foreground">Total tokens</div>
                    <div className="text-xl font-semibold">{formatCompact(maxTokens)}</div>
                  </div>
                  <div className="text-right">
                    <div className="fx-caption text-muted-foreground">Est. cost</div>
                    <div className="text-lg font-semibold text-fx-gold">${(usage?.cost || 0).toFixed(4)}</div>
                  </div>
                </div>
                {byProvider.length > 0 && (
                  <div className="space-y-2">
                    {byProvider.slice(0, 4).map((p) => (
                      <div key={p.providerId + p.model}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="truncate">{p.providerId}</span>
                          <span className="ml-2 shrink-0 text-muted-foreground">{formatCompact(p.totalTokens || 0)}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-gradient-to-r from-fx-gold/60 to-fx-gold" style={{ width: `${Math.max(2, ((p.totalTokens || 0) / maxProviderTokens) * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section>
              <SectionHeader icon={<Brain className="h-3.5 w-3.5" />} title="Memory overview" />
              <button
                onClick={() => setActiveTab('memory')}
                className="fx-hover-lift flex w-full items-center gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-3 text-left"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fx-gold/10 text-fx-gold">
                  <Brain className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{totalMemories} saved memories</span>
                  <span className="block text-xs text-muted-foreground">Auto-recalled into every request when enabled</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

function ZapIcon() {
  return <Flame className="h-3.5 w-3.5" />
}

function SectionHeader({ icon, title, action, onAction }: { icon: React.ReactNode; title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="text-fx-gold">{icon}</span>
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      {action && (
        <button onClick={onAction} className="ml-auto text-xs text-muted-foreground transition-colors hover:text-fx-gold">
          {action}
        </button>
      )}
    </div>
  )
}

function QuickStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
        {icon}
      </span>
      <span>
        <span className="block text-sm font-semibold leading-tight">{value}</span>
        <span className="block text-[10px] text-muted-foreground">{label}</span>
      </span>
    </div>
  )
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="fx-hover-lift flex items-center gap-2.5 rounded-xl border border-border/60 bg-card/40 px-3.5 py-2.5 text-left text-sm"
    >
      <span className="text-fx-gold">{icon}</span>
      <span className="flex-1">{label}</span>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
    </button>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 px-4 py-3">
      <div className="text-sm font-semibold">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  )
}

function EmptyPanel({ icon, text, action, onAction }: { icon: React.ReactNode; text: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 bg-card/20 px-6 py-10 text-center">
      <span className="text-muted-foreground/60">{icon}</span>
      <p className="text-sm text-muted-foreground">{text}</p>
      {action && (
        <Button variant="outline" size="sm" onClick={onAction} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> {action}
        </Button>
      )}
    </div>
  )
}

function formatCompact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(n)
}
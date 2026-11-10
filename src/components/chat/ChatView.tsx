import { useEffect, useMemo, useRef, useState, memo, useCallback } from 'react'
import { Send, Square, Plus, Paperclip, Copy, User, Bot, RefreshCw, X, FileText as FileTextIcon, XCircle, Settings, Star, ChevronsUpDown, Check, Upload } from 'lucide-react'

import { FluxoraMark } from '@/components/brand/FluxoraMark'
import { Button } from '@/components/ui/button'
import { useChatStore } from '@/stores/chatStore'
import { useProviderStore } from '@/stores/providerStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useUIStore } from '@/stores/uiStore'
import { Markdown } from '@/components/Markdown'
import { cn } from '@/lib/utils'
import { copyToClipboard } from '@/lib/utils'
import type { AttachedFile, ModelConfig } from '@/types'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'

const TEXT_EXTENSIONS = /\.(txt|md|markdown|json|js|jsx|ts|tsx|py|rb|go|rs|java|kt|c|h|cpp|hpp|cs|php|sql|html|css|scss|xml|yml|yaml|sh|bat|ps1|toml|ini|cfg|log|csv|tsv)$/i

function basename(p: string) {
  return p.split(/[\\/]/).pop() || p
}

function newId() {
  return (
    (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function' && globalThis.crypto.randomUUID()) ||
    `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  )
}

function formatCtx(n?: number) {
  if (!n) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}MB`
  if (n >= 1000) {
    const k = n / 1000
    return `${k % 1 === 0 ? k : k.toFixed(1)}K`
  }
  return String(n)
}

type ModelGroupItem = {
  key: string
  providerId: string
  providerName: string
  model: ModelConfig
}

function ModelGroup({
  title,
  items,
  favoriteModels,
  onPick,
  onToggleFavorite,
  activeProviderId,
  activeModelId,
  providerHasKey,
}: {
  title: string
  items: ModelGroupItem[]
  favoriteModels: Record<string, string>
  onPick: (providerId: string, modelId: string) => void
  onToggleFavorite: (providerId: string, modelId: string) => void
  activeProviderId: string
  activeModelId: string
  providerHasKey?: boolean
}) {
  return (
    <div className="mb-1">
      <div className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5">
        {providerHasKey !== undefined && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: providerHasKey ? 'var(--fx-gold)' : '#9ca3af' }}
          />
        )}
        <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
      </div>
      {items.map((it) => {
        const active = activeProviderId === it.providerId && activeModelId === it.model.id
        const fav = favoriteModels[it.providerId] === it.model.id
        return (
          <div key={it.key} className="group flex items-center rounded-md hover:bg-accent/60">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left"
              onClick={() => onPick(it.providerId, it.model.id)}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{it.model.name}</span>
                <span className="block truncate text-[10px] text-muted-foreground/70">{it.model.id}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {it.model.supportsVision && (
                  <span className="rounded bg-primary/15 px-1 py-px text-[9px] font-medium uppercase text-primary">
                    vision
                  </span>
                )}
                {it.model.contextWindow ? (
                  <span className="rounded bg-muted px-1 py-px text-[9px] text-muted-foreground">
                    {formatCtx(it.model.contextWindow)}
                  </span>
                ) : null}
                {active && <Check className="h-3.5 w-3.5 text-primary" />}
              </span>
            </button>
            <button
              type="button"
              className="shrink-0 rounded p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-primary focus:opacity-100 group-hover:opacity-100"
              onClick={() => onToggleFavorite(it.providerId, it.model.id)}
              aria-label={fav ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Star className={`h-3.5 w-3.5 ${fav ? 'fill-current text-primary' : ''}`} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export function ChatView() {
  const messages = useChatStore((s) => s.messages)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const streamingContent = useChatStore((s) => s.streamingContent)
  const error = useChatStore((s) => s.error)
  const currentChatId = useChatStore((s) => s.currentChatId)
  const clearError = useChatStore((s) => s.clearError)
  const chats = useChatStore((s) => s.chats)
  const addUserMessage = useChatStore((s) => s.addUserMessage)
  const streamMessage = useChatStore((s) => s.streamMessage)
  const stopStreaming = useChatStore((s) => s.stopStreaming)
  const setCurrentChat = useChatStore((s) => s.setCurrentChat)
  const createChat = useChatStore((s) => s.createChat)
  const updateChat = useChatStore((s) => s.updateChat)
  const providers = useProviderStore((s) => s.providers)
  const favoriteModels = useProviderStore((s) => s.favoriteModels)
  const toggleModelFavorite = useProviderStore((s) => s.toggleModelFavorite)
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const setActiveTab = useUIStore((s) => s.setActiveTab)
  const pendingPromptContent = useUIStore((s) => s.pendingPromptContent)
  const setPendingPromptContent = useUIStore((s) => s.setPendingPromptContent)
  const pendingAttachment = useUIStore((s) => s.pendingAttachment)
  const setPendingAttachment = useUIStore((s) => s.setPendingAttachment)

  const [input, setInput] = useState('')
  const [files, setFiles] = useState<AttachedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [histPos, setHistPos] = useState(-1)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dragCounterRef = useRef(0)

  const currentChat = useMemo(() => chats.find((c) => c.id === currentChatId), [chats, currentChatId])

  const userHistory = useMemo(
    () => messages.filter((m) => m.role === 'user').map((m) => m.content),
    [messages]
  )

  useEffect(() => {
    if (currentChatId) setHistPos(-1)
  }, [currentChatId])

  const scrollToBottom = (behavior: ScrollBehavior) => {
    bottomRef.current?.scrollIntoView({ behavior })
  }

  useEffect(() => {
    scrollToBottom(isStreaming ? 'auto' : 'smooth')
  }, [messages, isStreaming])

  useEffect(() => {
    if (isStreaming) scrollToBottom('auto')
  }, [streamingContent])

  useEffect(() => {
    return () => {
      useChatStore.getState().cleanup()
    }
  }, [])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
    }
  }, [input])

  const handleSend = async () => {
    const content = input.trim()
    if (!content || isStreaming) return
    setInput('')
    setHistPos(-1)
    const attachments = files
    setFiles([])
    try {
      if (!currentChatId) {
        const chat = await createChat({ workspaceId: 'global', title: content.slice(0, 100) })
        setCurrentChat(chat.id)
      }
      await addUserMessage(content, attachments)
      await new Promise((r) => setTimeout(r, 50))
      streamMessage(content, attachments)
    } catch (e: any) {
      setFiles(attachments)
      setInput(content)
    }
  }

  const handleAttach = async () => {
    const paths: string[] | null = await window.api.dialogs.selectFiles()
    if (!paths || paths.length === 0) return
    const next = paths
      .filter((p) => TEXT_EXTENSIONS.test(p))
      .map((p) => ({ id: newId(), name: basename(p), path: p, type: 'file', size: 0 }))
    setFiles((prev) => [...prev, ...next])
  }

  const handleDropFiles = (fileList: FileList) => {
    const dropped = Array.from(fileList)
      .map((f) => {
        const p = (f as any).path as string | undefined
        if (!p || !TEXT_EXTENSIONS.test(p)) return null
        return { id: newId(), name: f.name, path: p, type: 'file', size: f.size || 0 }
      })
      .filter(Boolean) as AttachedFile[]
    if (dropped.length > 0) {
      setFiles((prev) => {
        const seen = new Set(prev.map((x) => x.path))
        return [...prev, ...dropped.filter((d) => !seen.has(d.path))]
      })
    }
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current++
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current--
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0
      setIsDragging(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleDropFiles(e.dataTransfer.files)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
      return
    }
    if (e.key === 'ArrowUp' && !e.shiftKey && input === '' && userHistory.length > 0) {
      e.preventDefault()
      const next = histPos === -1 ? userHistory.length - 1 : Math.max(0, histPos - 1)
      setHistPos(next)
      setInput(userHistory[next])
      return
    }
    if (e.key === 'ArrowDown' && histPos !== -1) {
      e.preventDefault()
      if (histPos >= userHistory.length - 1) {
        setHistPos(-1)
        setInput('')
      } else {
        const next = histPos + 1
        setHistPos(next)
        setInput(userHistory[next])
      }
    }
  }

  const allProviders = useMemo(() => providers.filter((p) => p.enabled !== false), [providers])
  const models = useMemo(
    () =>
      allProviders.flatMap((p) =>
        (p.models || []).map((m) => ({ providerId: p.id, providerName: p.name, model: m }))
      ),
    [allProviders]
  )
  const modelGroups = useMemo(
    () =>
      allProviders
        .map((p) => ({ provider: p, models: p.models || [] }))
        .filter((g) => g.models.length > 0),
    [allProviders]
  )

  const modelNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const x of models) map.set(x.model.id, x.model.name)
    return map
  }, [models])

  const resolveModelName = useCallback(
    (raw?: string) => (raw && modelNameById.get(raw)) || raw || '',
    [modelNameById]
  )

  const effectiveProviderId = currentChat?.providerId || settings.defaultProviderId || ''
  const effectiveModelId = currentChat?.modelId || settings.defaultModelId || ''
  const effectiveProviderName =
    allProviders.find((p) => p.id === effectiveProviderId)?.name || 'Select a provider'
  const effectiveModelName = resolveModelName(effectiveModelId) || 'Select a model'
  const effectiveProvider = allProviders.find((p) => p.id === effectiveProviderId)

  const favoriteEntries = useMemo(
    () =>
      modelGroups.flatMap((g) => {
        const favId = favoriteModels[g.provider.id]
        if (!favId) return []
        const m = g.models.find((x) => x.id === favId)
        return m
          ? [{ key: `${g.provider.id}:${m.id}`, providerId: g.provider.id, providerName: g.provider.name, model: m }]
          : []
      }),
    [modelGroups, favoriteModels]
  )

  useEffect(() => {
    if (pendingPromptContent) {
      setInput(pendingPromptContent)
      setPendingPromptContent(null)
      requestAnimationFrame(() => textareaRef.current?.focus())
    }
  }, [pendingPromptContent, setPendingPromptContent])

  useEffect(() => {
    if (!pendingAttachment) return
    const attached: AttachedFile = {
      id: newId(),
      name: pendingAttachment.name,
      path: pendingAttachment.path,
      type: 'file',
      size: pendingAttachment.content?.length ?? 0,
      content: pendingAttachment.content,
    }
    setFiles((prev) => {
      if (prev.some((f) => f.path === attached.path)) return prev
      return [...prev, attached]
    })
    setPendingAttachment(null)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [pendingAttachment, setPendingAttachment])

  useEffect(() => {
    const current = allProviders.find((p) => p.id === settings.defaultProviderId)
    if (!current || !current.models?.length) return
    if (!current.models.some((m) => m.id === settings.defaultModelId)) {
      updateSettings({ defaultModelId: current.models[0].id })
    }
  }, [settings.defaultProviderId, settings.defaultModelId, allProviders])

  const handleModelChange = (providerId: string, modelId: string) => {
    updateSettings({ defaultProviderId: providerId, defaultModelId: modelId })
    if (currentChat && currentChatId) {
      updateChat(currentChatId, { providerId, modelId }).catch(() => {})
    }
  }

  return (
    <div
      className="relative flex h-full flex-col"
      onDragEnter={handleDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-xl bg-background/85 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-fx-gold/40 bg-card/60 px-10 py-8 fx-scale-in">
            <Upload className="h-8 w-8 text-fx-gold" />
            <p className="text-sm font-medium">Drop files to attach</p>
            <p className="text-xs text-muted-foreground">Text and code files will be included with your message</p>
          </div>
        </div>
      )}
      <div className="flex flex-1 flex-col overflow-hidden">
        <ScrollArea className="flex-1">
          <div className="mx-auto max-w-3xl px-4 py-6">
            {messages.length === 0 && !streamingContent ? (
              <EmptyState
                onNewChat={() => createChat({ workspaceId: 'global' })}
                currentChatTitle={currentChat?.title}
                needsProvider={providers.length > 0 && !providers.some((p) => p.hasKey || p.apiKey)}
                onSetupProviders={() => setActiveTab('settings')}
              />
            ) : (
              <div className="flex flex-col gap-4">
                {messages.map((m, i) => (
                  <MessageBubble
                    key={m.id || i}
                    role={m.role}
                    content={m.content}
                    model={resolveModelName(m.model)}
                    usage={m.usage}
                    isLast={i === messages.length - 1}
                  />
                ))}
                {isStreaming && (
                  <MessageBubble role="assistant" content={streamingContent} streaming />
                )}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
      </div>

      {error && (
        <div className="mx-auto mb-2 w-full max-w-3xl px-4">
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <XCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button className="shrink-0 hover:text-foreground" onClick={clearError} aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="sr-only" role="status" aria-live="polite">
        {isStreaming ? 'Assistant is responding.' : ''}
      </div>
      <div className="border-t border-border/60 bg-background/60 px-4 pb-3 pt-2">
        <div className="mx-auto max-w-3xl">
          <div className="mb-2 flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="fx-hover-lift h-7 min-w-0 justify-start gap-1.5 border-muted bg-muted/40 px-2.5 hover:bg-muted/70"
                  aria-label="Choose provider and model"
                >
                  <span
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      background:
                        effectiveProvider && (effectiveProvider.hasKey || effectiveProvider.apiKey)
                          ? 'var(--fx-gold)'
                          : '#9ca3af',
                    }}
                  />
                  <span className="max-w-[110px] truncate font-medium">{effectiveProviderName}</span>
                  <span className="text-fx-gold/60">·</span>
                  <span className="max-w-[150px] truncate text-muted-foreground">{effectiveModelName}</span>
                  <ChevronsUpDown className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                side="top"
                className="w-[360px] border-muted bg-card/95 p-0 backdrop-blur-xl"
              >
                <ScrollArea className="max-h-80">
                  <div className="p-1.5">
                    {favoriteEntries.length > 0 && (
                      <ModelGroup
                        title="Favorites"
                        items={favoriteEntries}
                        favoriteModels={favoriteModels}
                        onPick={handleModelChange}
                        onToggleFavorite={(pid, mid) => toggleModelFavorite(pid, mid)}
                        activeProviderId={effectiveProviderId}
                        activeModelId={effectiveModelId}
                      />
                    )}
                    {modelGroups.map((g) => (
                      <ModelGroup
                        key={g.provider.id}
                        title={g.provider.name}
                        providerHasKey={!!(g.provider.hasKey || g.provider.apiKey)}
                        items={g.models.map((m) => ({
                          key: `${g.provider.id}:${m.id}`,
                          providerId: g.provider.id,
                          providerName: g.provider.name,
                          model: m,
                        }))}
                        favoriteModels={favoriteModels}
                        onPick={handleModelChange}
                        onToggleFavorite={(pid, mid) => toggleModelFavorite(pid, mid)}
                        activeProviderId={effectiveProviderId}
                        activeModelId={effectiveModelId}
                      />
                    ))}
                    {modelGroups.length === 0 && (
                      <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                        No models available. Open Settings to add a provider.
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </PopoverContent>
            </Popover>
            {effectiveProvider?.capabilities?.detectedType && (
              <span className="hidden text-[10px] text-muted-foreground sm:inline">
                {effectiveProvider.capabilities.detectedType}
                {effectiveProvider.capabilities.supportsVision ? ' · vision' : ''}
                {effectiveProvider.capabilities.contextWindow ? ` · ${formatCtx(effectiveProvider.capabilities.contextWindow)} ctx` : ''}
              </span>
            )}
          </div>

          {files.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {files.map((f) => (
                <span
                  key={f.id}
                  className="flex max-w-[220px] items-center gap-1.5 rounded-md border bg-muted/60 px-2 py-1 text-xs"
                >
                  <FileTextIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{f.name}</span>
                  <button
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="fx-composer-surface fx-focus-gold flex items-end gap-1.5 rounded-2xl p-2 shadow-float transition-all duration-2 ease-fx">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 transition-transform duration-150 hover:scale-105 hover:text-fx-gold" onClick={handleAttach} aria-label="Attach file">
              <Paperclip className="h-4 w-4" />
            </Button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                if (histPos !== -1 && e.target.value !== userHistory[histPos]) setHistPos(-1)
              }}
              onKeyDown={handleKeyDown}
              placeholder={currentChatId ? 'Type a message...' : 'Start a new conversation...'}
              rows={1}
              className="max-h-[200px] flex-1 resize-none bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
            />
            {isStreaming ? (
              <Button variant="secondary" size="icon" className="h-8 w-8 shrink-0" onClick={stopStreaming} aria-label="Stop generating">
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="icon" className="h-8 w-8 shrink-0 transition-transform duration-150 hover:scale-105" onClick={handleSend} disabled={!input.trim()} aria-label="Send message">
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="mt-1 text-center text-[10px] text-muted-foreground">
            AI can make mistakes. Check important information.
          </p>
        </div>
      </div>
    </div>
  )
}

function EmptyState({
  onNewChat,
  currentChatTitle,
  needsProvider,
  onSetupProviders,
}: {
  onNewChat: () => void
  currentChatTitle?: string
  needsProvider?: boolean
  onSetupProviders?: () => void
}) {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden py-20 text-center">
      <div className="pointer-events-none absolute bottom-0 h-56 w-[120%] bg-gradient-to-t from-background to-transparent" />
      <div className="relative flex flex-col items-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#161311] to-[#080705] shadow-[0_16px_44px_-18px_rgba(216,189,132,0.45)] ring-1 ring-white/10">
          <FluxoraMark size={34} />
        </div>
        <h1 className="fx-display">{currentChatTitle || 'Fluxora'}</h1>
        <p className="fx-prose-lead mt-2 max-w-md text-center">
          {needsProvider
            ? 'Connect an AI provider to start chatting — it takes less than a minute.'
            : currentChatTitle
            ? 'Continue this conversation or start a new one.'
            : 'Ask me anything, write and edit code, or get help with your projects.'}
        </p>
        <div className="mt-6 flex items-center gap-2">
          {needsProvider && onSetupProviders && (
            <Button onClick={onSetupProviders}>
              <Settings className="h-4 w-4" /> Set up provider
            </Button>
          )}
          <Button variant="outline" onClick={onNewChat}>
            <Plus className="h-4 w-4" /> New chat
          </Button>
        </div>
      </div>
    </div>
  )
}

const MessageBubble = memo(function MessageBubble({
  role,
  content,
  model,
  usage,
  isLast,
  streaming,
}: {
  role: 'user' | 'assistant' | 'system'
  content: string
  model?: string
  usage?: any
  isLast?: boolean
  streaming?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [showBar, setShowBar] = useState(false)
  const regenerateLastMessage = useChatStore((s) => s.regenerateLastMessage)

  const isUser = role === 'user'

  const fmtTokens = (n: number) => {
    if (!n) return null
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
  }
  const metaBits: string[] = []
  if (usage?.responseTimeMs) metaBits.push(`⚡ ${usage.responseTimeMs} ms`)
  if (usage?.totalTokens) metaBits.push(`${fmtTokens(usage.totalTokens)} tok`)
  if (usage?.cost) metaBits.push(`~$${Number(usage.cost.toFixed(6)).toString()}`)

  const handleCopy = () => {
    copyToClipboard(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      className={cn('fx-message-enter flex gap-3', isUser && 'flex-row-reverse')}
      onMouseEnter={() => setShowBar(true)}
      onMouseLeave={() => setShowBar(false)}
    >
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full shadow-sm',
          isUser
            ? 'bg-gradient-to-br from-primary to-primary/70 text-primary-foreground'
            : 'bg-muted text-muted-foreground ring-1 ring-border/60'
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className={cn('min-w-0 max-w-[85%]', isUser && 'text-right')}>
        {!isUser && model && (
          <div className="mb-1 text-[11px] text-muted-foreground">
            {model}
            {metaBits.length > 0 && <span className="opacity-70"> · {metaBits.join(' · ')}</span>}
          </div>
        )}
        <div
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm leading-relaxed transition-colors duration-200',
            isUser
              ? 'bg-gradient-to-br from-primary to-primary/85 text-primary-foreground text-left shadow-md shadow-primary/15'
              : streaming
              ? 'bg-muted/40 ring-1 ring-border/40'
              : 'fx-msg-bubble-assistant text-left'
          )}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap">{content}</div>
          ) : (
            <Markdown content={content} />
          )}
          {streaming && content && <Cursor />}
        </div>
        {!isUser && (
          <div className="mt-1 flex items-center gap-1">
            {showBar && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleCopy}
                  aria-label="Copy"
                >
                  {copied ? <span className="text-[10px] text-green-500">✓</span> : <Copy className="h-3.5 w-3.5" />}
                </Button>
                {isLast && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={regenerateLastMessage}
                    aria-label="Regenerate"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
})

function Cursor() {
  return <span className="ml-0.5 inline-block h-[1.05em] w-[2px] animate-stream-pulse rounded-full bg-fx-gold/90 align-[-0.15em]" />
}
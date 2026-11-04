import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useMemoryStore } from '@/stores/memoryStore'
import { useUIStore } from '@/stores/uiStore'
import type { MemoryEntry } from '@/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PageHeader } from '@/components/layout/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn, formatRelativeTime, truncate } from '@/lib/utils'
import {
  Plus, Search, Star, Pencil, Trash2, Brain, Loader2, Sparkles, Database,
} from 'lucide-react'

const TYPE_COLORS: Record<string, string> = {
  user: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
  conversation: 'bg-green-500/20 text-green-700 dark:text-green-400',
  project: 'bg-purple-500/20 text-purple-700 dark:text-purple-400',
  custom: 'bg-gray-500/20 text-gray-700 dark:text-gray-400',
}

const ALL_TYPES = ['user', 'conversation', 'project', 'custom'] as const

type MemoryType = (typeof ALL_TYPES)[number]

function MemoryDialog({
  open,
  onOpenChange,
  onSave,
  initial,
  isEdit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: Partial<MemoryEntry>) => Promise<void>
  initial?: MemoryEntry
  isEdit: boolean
}) {
  const [content, setContent] = useState('')
  const [type, setType] = useState<MemoryType>('user')
  const [scope, setScope] = useState<string>('global')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setError(null)
      if (initial) {
        setContent(initial.content)
        setType(initial.type)
        setScope(initial.scope)
      } else {
        setContent('')
        setType('user')
        setScope('global')
      }
    }
  }, [open, initial])

  const handleSubmit = async () => {
    if (!content.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onSave({
        content: content.trim(),
        type,
        scope: scope as any,
      })
      onOpenChange(false)
    } catch (err: any) {
      setError(err?.message || 'Failed to save memory. Please try again.')
    }
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Memory' : 'Add Memory'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update this memory entry.' : 'Store a new piece of information for the AI to recall.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Content</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What should the AI remember?"
              rows={4}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as MemoryType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="conversation">Conversation</SelectItem>
                  <SelectItem value="project">Project</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Scope</Label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global</SelectItem>
                  <SelectItem value="project">Project</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          {error && (
            <div className="mr-auto flex-1 text-sm text-red-500 dark:text-red-400">{error}</div>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || !content.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Add Memory'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MemoryView() {
  const {
    memories, isLoading, searchResults, memoryEnabled,
    loadMemories, addMemory, updateMemory, deleteMemory,
    searchMemories, toggleMemory, getMemorySettings,
  } = useMemoryStore()

  const [scope, setScope] = useState<string>('global')
  const [typeFilter, setTypeFilter] = useState<MemoryType | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<MemoryEntry | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MemoryEntry | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extractedCount, setExtractedCount] = useState<number | null>(null)

  const pendingCreate = useUIStore((s) => s.pendingCreate)
  const setPendingCreate = useUIStore((s) => s.setPendingCreate)

  useEffect(() => {
    getMemorySettings()
  }, [])

  useEffect(() => {
    if (pendingCreate === 'memory') {
      setPendingCreate(null)
      setAddOpen(true)
    }
  }, [pendingCreate, setPendingCreate])

  useEffect(() => {
    if (!searchQuery.trim()) {
      loadMemories(scope)
    }
  }, [scope])

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
  }, [])

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query)
    if (!query.trim()) {
      if (searchTimer.current) clearTimeout(searchTimer.current)
      setSearching(false)
      loadMemories(scope)
      return
    }
    setSearching(true)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      await searchMemories(query)
    }, 200)
  }, [scope, loadMemories, searchMemories])

  const displayedMemories = useMemo(
    () =>
      searching
        ? searchResults
        : typeFilter === 'all'
          ? memories
          : memories.filter((m) => m.type === typeFilter),
    [searching, searchResults, typeFilter, memories]
  )

  const typeCounts = useMemo(() => {
    const source = searching ? searchResults : memories
    const counts: Record<string, number> = {}
    for (const m of source) counts[m.type] = (counts[m.type] || 0) + 1
    return counts
  }, [searching, searchResults, memories])

  const handlePin = useCallback((memory: MemoryEntry) => {
    updateMemory(memory.id, { pinned: memory.pinned ? 0 : 1 })
  }, [updateMemory])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    await deleteMemory(deleteTarget.id)
    setDeleteTarget(null)
  }, [deleteTarget, deleteMemory])

  const handleAdd = useCallback(async (data: Partial<MemoryEntry>) => {
    await addMemory(data)
  }, [addMemory])

  const handleEdit = useCallback(async (data: Partial<MemoryEntry>) => {
    if (!editTarget) return
    await updateMemory(editTarget.id, data)
    setEditTarget(null)
  }, [editTarget, updateMemory])

  const handleAutoExtract = useCallback(async () => {
    setExtracting(true)
    setExtractedCount(null)
    try {
      const joined = memories.map((m) => m.content).join('\n')
      if (!joined.trim()) {
        setExtractedCount(0)
        setExtracting(false)
        return
      }
      const facts = await window.api.memory.autoExtract(scope, joined)
      let added = 0
      for (const fact of facts) {
        const created = await addMemory({
          content: fact,
          type: 'custom',
          scope: scope as any,
          source: 'auto-extract',
        })
        if (created) added++
      }
      setExtractedCount(added)
    } catch {
      setExtractedCount(0)
    }
    setExtracting(false)
  }, [memories, scope, addMemory])

  const handleToggleEnabled = useCallback(async (enabled: boolean) => {
    await toggleMemory(enabled)
  }, [toggleMemory])

  if (isLoading && memories.length === 0) {
    return (
      <div className="h-full p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-full" />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <PageHeader
          eyebrow="Knowledge"
          title="Memory"
          description="Durable facts, preferences and context Fluxora remembers across conversations."
          icon={Brain}
          actions={
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Switch checked={memoryEnabled} onCheckedChange={handleToggleEnabled} />
                {memoryEnabled ? 'Enabled' : 'Disabled'}
              </label>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAutoExtract}
                disabled={extracting || memories.length === 0}
              >
                {extracting ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                )}
                Auto-extract
              </Button>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Add memory
              </Button>
            </div>
          }
        />

        {extractedCount !== null && (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {extractedCount > 0
              ? `Extracted and added ${extractedCount} new ${extractedCount === 1 ? 'fact' : 'facts'}.`
              : 'No new facts found to extract.'}
          </div>
        )}

        {!memoryEnabled && (
          <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-yellow-700 dark:text-yellow-400">
              <Brain className="h-4 w-4" />
              Memory is currently disabled. The AI will not recall stored information.
            </div>
            <Button size="sm" variant="outline" onClick={() => handleToggleEnabled(true)}>
              Enable
            </Button>
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search memories..."
              className="pl-9"
            />
          </div>
          <Select value={scope} onValueChange={(v) => { setScope(v); setSearchQuery(''); setSearching(false) }}>
            <SelectTrigger className="w-[120px]">
              <Database className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Global</SelectItem>
              <SelectItem value="project">Project</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTypeFilter('all')}
            className={cn(
              'fx-press inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium transition-colors duration-1',
              typeFilter === 'all'
                ? 'border-fx-gold/30 bg-fx-gold/15 text-foreground'
                : 'border-transparent bg-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
          >
            All ({searching ? searchResults.length : memories.length})
          </button>
          {ALL_TYPES.map((t) => {
            const count = typeCounts[t] || 0
            return (
              <button
                key={t}
                onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}
                className={cn(
                  'fx-press inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium transition-colors duration-1',
                  typeFilter === t
                    ? 'border-fx-gold/30 bg-fx-gold/15 text-foreground'
                    : 'border-transparent bg-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                )}
              >
                {t} ({count})
              </button>
            )
          })}
        </div>

        {displayedMemories.length === 0 ? (
          <div className="fx-empty py-20">
            <div className="mb-4 rounded-2xl bg-muted/40 p-4">
              <Brain className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-display text-lg">No memories found</h3>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              {searchQuery
                ? 'Try adjusting your search terms.'
                : 'Add your first memory or let the AI auto-extract facts from conversations.'}
            </p>
            {!searchQuery && (
              <Button onClick={() => setAddOpen(true)} className="mt-4">
                <Plus className="mr-1.5 h-4 w-4" /> Add memory
              </Button>
            )}
          </div>
        ) : (
          <div className="fx-panel divide-y divide-border/40 overflow-hidden">
            {displayedMemories.map((memory) => (
              <div
                key={memory.id}
                className="group p-4 transition-colors duration-2 hover:bg-accent/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={cn('text-[10px] capitalize', TYPE_COLORS[memory.type])}
                      >
                        {memory.type}
                      </Badge>
                      {memory.source && (
                        <Badge variant="outline" className="text-[10px]">
                          {memory.source}
                        </Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {formatRelativeTime(memory.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">
                      {truncate(memory.content, 300)}
                    </p>
                    {memory.tags && memory.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {memory.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[10px]">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handlePin(memory)}
                        >
                          <Star
                            className={cn(
                              'h-3.5 w-3.5',
                              memory.pinned ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'
                            )}
                          />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{memory.pinned ? 'Unpin' : 'Pin'}</TooltipContent>
                    </Tooltip>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setEditTarget(memory)}
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setDeleteTarget(memory)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-md bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
          Memory is injected into chat context automatically when enabled. Facts are recalled based on relevance to the current conversation.
        </div>
      </div>

      <MemoryDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSave={handleAdd}
        isEdit={false}
      />
      <MemoryDialog
        open={!!editTarget}
        onOpenChange={(o) => { if (!o) setEditTarget(null) }}
        onSave={handleEdit}
        initial={editTarget ?? undefined}
        isEdit
      />

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Memory</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this memory? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/50 p-3">
            <p className="text-sm text-muted-foreground line-clamp-3">{deleteTarget?.content}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  )
}

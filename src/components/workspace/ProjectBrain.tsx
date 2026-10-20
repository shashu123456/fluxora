import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Brain,
  Plus,
  Search,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  StickyNote,
  GitBranch,
  Layers,
  Lightbulb,
  ListTodo,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn, formatRelativeTime } from '@/lib/utils'
import type { ProjectBrainEntry, ProjectBrainKind } from '@/types'
import { Markdown } from '@/components/Markdown'

const KIND_META: Record<ProjectBrainKind, { label: string; icon: React.ReactNode; badge: string }> = {
  note: { label: 'Note', icon: <StickyNote className="h-3.5 w-3.5" />, badge: 'bg-sky-500/10 text-sky-500 border-sky-500/25' },
  decision: { label: 'Decision', icon: <GitBranch className="h-3.5 w-3.5" />, badge: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/25' },
  architecture: { label: 'Architecture', icon: <Layers className="h-3.5 w-3.5" />, badge: 'bg-purple-500/10 text-purple-500 border-purple-500/25' },
  convention: { label: 'Convention', icon: <Lightbulb className="h-3.5 w-3.5" />, badge: 'bg-amber-500/10 text-amber-500 border-amber-500/25' },
  todo: { label: 'Todo', icon: <ListTodo className="h-3.5 w-3.5" />, badge: 'bg-red-500/10 text-red-500 border-red-500/25' },
}

export function ProjectBrain({ workspaceId }: { workspaceId: string }) {
  const [entries, setEntries] = useState<ProjectBrainEntry[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<ProjectBrainEntry | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [kind, setKind] = useState<ProjectBrainKind>('note')
  const [status, setStatus] = useState('')
  const [tags, setTags] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const load = async () => {
    try {
      const rows = await window.api.brain.list(workspaceId)
      setEntries(rows || [])
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    load()
  }, [workspaceId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(
      (e) => e.title.toLowerCase().includes(q) || e.content.toLowerCase().includes(q) || (e.tags || []).some((t) => t.toLowerCase().includes(q))
    )
  }, [entries, query])

  const openCreate = () => {
    setEditing(null)
    setTitle('')
    setContent('')
    setKind('note')
    setStatus('')
    setTags('')
    setEditorOpen(true)
  }

  const openEdit = (entry: ProjectBrainEntry) => {
    setEditing(entry)
    setTitle(entry.title)
    setContent(entry.content)
    setKind(entry.kind)
    setStatus(entry.status || '')
    setTags((entry.tags || []).join(', '))
    setEditorOpen(true)
  }

  const save = async () => {
    if (!title.trim()) return
    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean)
    try {
      if (editing) {
        await window.api.brain.update(editing.id, {
          title: title.trim(),
          content,
          kind,
          status: status.trim() || null,
          tags: tagList,
        })
      } else {
        await window.api.brain.create({
          workspaceId,
          title: title.trim(),
          content,
          kind,
          status: kind === 'todo' && status.trim() ? status.trim() : undefined,
          tags: tagList,
          source: 'manual',
        })
      }
      setEditorOpen(false)
      await load()
    } catch (err: any) {
      await window.api.notifications?.create?.({ type: 'error', title: 'Brain Save Failed', message: err.message })
    }
  }

  const togglePin = async (entry: ProjectBrainEntry) => {
    await window.api.brain.update(entry.id, { pinned: entry.pinned ? 0 : 1 })
    await load()
  }

  const remove = async () => {
    if (!confirmId) return
    await window.api.brain.delete(confirmId)
    setConfirmId(null)
    await load()
  }

  const stats = (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span>{entries.length} entries</span>
      <span>·</span>
      <span>{entries.filter((e) => e.pinned).length} pinned</span>
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-fx-gold/10 text-fx-gold">
          <Brain className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">Project Brain</div>
          {stats}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search brain..."
              className="h-8 w-48 pl-7 text-xs"
            />
            {query && (
              <Button variant="ghost" size="icon" className="absolute right-0.5 top-1/2 h-5 w-5 -translate-y-1/2" onClick={() => setQuery('')}>
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          <Button size="sm" className="gap-1.5" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />
            New entry
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 px-4 pb-4">
        {loading ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 bg-card/20 px-6 py-14 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Brain className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">{query ? 'No matching entries' : 'Your project brain is empty'}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Save decisions, architecture notes, and conventions that the AI should remember about this project.
              </p>
            </div>
            {!query && (
              <Button size="sm" className="gap-1.5" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" />
                Add your first entry
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((entry) => {
              const meta = KIND_META[entry.kind] || KIND_META.note
              return (
                <div
                  key={entry.id}
                  className={cn(
                    'group rounded-xl border border-border/60 bg-card/40 px-4 py-3 transition-colors',
                    entry.pinned && 'border-fx-gold/25'
                  )}
                >
                  <div className="flex items-start gap-3">
                    {entry.pinned ? (
                      <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fx-gold" />
                    ) : (
                      <span className="mt-0.5 shrink-0 text-muted-foreground/40">{meta.icon}</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <button
                          className="truncate text-sm font-medium hover:underline"
                          onClick={() => openEdit(entry)}
                        >
                          {entry.title}
                        </button>
                        <Badge variant="outline" className={cn('shrink-0 px-1.5 py-0 text-[10px] font-normal', meta.badge)}>
                          {meta.label}
                        </Badge>
                        {entry.kind === 'todo' && entry.status && (
                          <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] font-normal">
                            {entry.status}
                          </Badge>
                        )}
                      </div>
                      {entry.content && (
                        <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {entry.content}
                        </div>
                      )}
                      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground/70">
                        <span>{formatRelativeTime(entry.updatedAt)}</span>
                        {(entry.tags || []).length > 0 && (
                          <span className="flex items-center gap-1">
                            {entry.tags!.slice(0, 4).map((t) => (
                              <span key={t} className="rounded bg-muted px-1 py-px">#{t}</span>
                            ))}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => togglePin(entry)} title={entry.pinned ? 'Unpin' : 'Pin'}>
                        {entry.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(entry)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setConfirmId(entry.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </ScrollArea>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit entry' : 'New brain entry'}</DialogTitle>
            <DialogDescription>
              Captured knowledge that should persist for this project.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Kind</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as ProjectBrainKind)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(KIND_META).map(([k, m]) => (
                      <SelectItem key={k} value={k}>
                        <span className="flex items-center gap-2">{m.icon} {m.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {kind === 'todo' && (
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Input
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    placeholder="todo / in-progress / done"
                    className="h-8 text-sm"
                  />
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="We use Zustand for client state"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') save() }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Optional detail, rationale, or markdown..."
                rows={5}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tags</Label>
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="state, tech-stack, decision"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={save} disabled={!title.trim()}>
              {editing ? 'Save changes' : 'Add entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmId} onOpenChange={(open) => { if (!open) setConfirmId(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete entry</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={remove}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
import { useEffect, useState, useCallback } from 'react'
import { usePromptStore } from '@/stores/promptStore'
import { useUIStore } from '@/stores/uiStore'
import type { PromptTemplate, PromptVariable } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn, truncate, copyToClipboard } from '@/lib/utils'
import {
  Plus, Search, Star, Copy, Pencil, Trash2, MoreVertical, FileText, Loader2, Send,
} from 'lucide-react'

interface PromptFormState {
  name: string
  description: string
  category: string
  content: string
  variables: PromptVariable[]
}

const emptyForm: PromptFormState = {
  name: '',
  description: '',
  category: '',
  content: '',
  variables: [],
}

function VariableEditor({ variables, onChange }: { variables: PromptVariable[]; onChange: (v: PromptVariable[]) => void }) {
  const add = () => onChange([...variables, { name: '', defaultValue: '' }])
  const remove = (i: number) => onChange(variables.filter((_, idx) => idx !== i))
  const update = (i: number, field: keyof PromptVariable, value: string) => {
    const next = [...variables]
    next[i] = { ...next[i], [field]: value }
    onChange(next)
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Variables</Label>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={add}>
          <Plus className="mr-1 h-3 w-3" /> Add
        </Button>
      </div>
      {variables.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            placeholder="Name"
            value={v.name}
            onChange={(e) => update(i, 'name', e.target.value)}
            className="h-8 flex-1"
          />
          <Input
            placeholder="Default value"
            value={v.defaultValue}
            onChange={(e) => update(i, 'defaultValue', e.target.value)}
            className="h-8 flex-1"
          />
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => remove(i)}>
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      ))}
    </div>
  )
}

function PromptDialog({
  open,
  onOpenChange,
  onSave,
  initial,
  isEdit,
  categories,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: Partial<PromptTemplate>) => Promise<void>
  initial?: PromptTemplate
  isEdit: boolean
  categories: string[]
}) {
  const [form, setForm] = useState<PromptFormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setError(null)
      if (initial) {
        setForm({
          name: initial.name,
          description: initial.description ?? '',
          category: initial.category ?? '',
          content: initial.content,
          variables: initial.variables.map((v) => ({ ...v })),
        })
      } else {
        setForm(emptyForm)
      }
    }
  }, [open, initial])

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.content.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onSave({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        category: form.category.trim(),
        content: form.content,
        variables: form.variables.filter((v) => v.name.trim()),
      })
      onOpenChange(false)
    } catch (err: any) {
      setError(err?.message || 'Failed to save prompt. Please try again.')
    }
    setSaving(false)
  }

  const uniqueCategories = [...new Set([...categories, ...form.category ? [form.category] : []])].filter(Boolean)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Prompt' : 'New Prompt'}</DialogTitle>
          <DialogDescription>{isEdit ? 'Update prompt details.' : 'Create a reusable prompt template.'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Code Review"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Optional short description"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Input
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="e.g. Development"
              list="category-suggestions"
            />
            <datalist id="category-suggestions">
              {uniqueCategories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label>Content</Label>
            <Textarea
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="Write your prompt template here. Use {{variable}} syntax for variables."
              rows={6}
              className="font-mono text-sm"
            />
          </div>
          <Separator />
          <VariableEditor
            variables={form.variables}
            onChange={(variables) => setForm((f) => ({ ...f, variables }))}
          />
        </div>
        <DialogFooter>
          {error && (
            <div className="mr-auto flex-1 text-sm text-red-500 dark:text-red-400">{error}</div>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || !form.name.trim() || !form.content.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function UseDialog({
  open,
  onOpenChange,
  prompt,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  prompt: PromptTemplate | null
}) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open && prompt) {
      const initial: Record<string, string> = {}
      for (const v of prompt.variables) {
        initial[v.name] = v.defaultValue
      }
      setValues(initial)
      setCopied(false)
    }
  }, [open, prompt])

  const fillTemplate = (content: string, vars: Record<string, string>): string => {
    let result = content
    for (const [key, val] of Object.entries(vars)) {
      result = result.split(`{{${key}}}`).join(val)
    }
    return result
  }

  const handleCopy = () => {
    if (!prompt) return
    const filled = fillTemplate(prompt.content, values)
    copyToClipboard(filled)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSendToChat = () => {
    if (!prompt) return
    const filled = fillTemplate(prompt.content, values)
    useUIStore.getState().setPendingPromptContent(filled)
    useUIStore.getState().setActiveTab('chat')
    onOpenChange(false)
  }

  if (!prompt) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Use: {prompt.name}</DialogTitle>
          <DialogDescription>Fill in the variables below.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
          {prompt.variables.map((v) => (
            <div key={v.name} className="space-y-1.5">
              <Label>{v.name}</Label>
              <Input
                value={values[v.name] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [v.name]: e.target.value }))}
                placeholder={v.defaultValue || `Enter ${v.name}`}
              />
            </div>
          ))}
          {prompt.variables.length === 0 && (
            <p className="text-sm text-muted-foreground">This prompt has no variables.</p>
          )}
          <Separator />
          <div className="space-y-1.5">
            <Label>Preview</Label>
            <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/50 p-3 text-xs font-mono">
              {fillTemplate(prompt.content, values)}
            </pre>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="secondary" onClick={handleSendToChat}>
            <Send className="mr-1 h-4 w-4" /> Send to chat
          </Button>
          <Button onClick={handleCopy}>
            {copied ? (
              <><span className="text-green-500">Copied!</span></>
            ) : (
              <><Copy className="mr-1 h-4 w-4" /> Copy</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PreviewDialog({
  open,
  onOpenChange,
  prompt,
  onUse,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  prompt: PromptTemplate | null
  onUse: () => void
}) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) setCopied(false)
  }, [open])

  const handleCopy = () => {
    if (!prompt) return
    copyToClipboard(prompt.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!prompt) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{prompt.name}</DialogTitle>
          {prompt.description && (
            <DialogDescription>{prompt.description}</DialogDescription>
          )}
        </DialogHeader>
        {prompt.category && (
          <Badge variant="secondary" className="w-fit">{prompt.category}</Badge>
        )}
        <pre className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/50 p-4 text-sm font-mono">
          {prompt.content}
        </pre>
        {prompt.variables.length > 0 && (
          <div className="space-y-1.5">
            <Label>Variables</Label>
            <div className="flex flex-wrap gap-2">
              {prompt.variables.map((v) => (
                <Badge key={v.name} variant="outline" className="font-mono text-xs">
                  {v.name}{v.defaultValue ? ` = ${v.defaultValue}` : ''}
                </Badge>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="outline" onClick={handleCopy}>
            {copied ? 'Copied!' : <><Copy className="mr-1 h-4 w-4" /> Copy</>}
          </Button>
          <Button onClick={onUse}>Use</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function PromptsView() {
  const {
    prompts, filteredPrompts, categories, selectedCategory, searchQuery, isLoading,
    loadPrompts, createPrompt, updatePrompt, deletePrompt, setCategory, setSearch,
  } = usePromptStore()

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<PromptTemplate | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PromptTemplate | null>(null)
  const [previewTarget, setPreviewTarget] = useState<PromptTemplate | null>(null)
  const [useTarget, setUseTarget] = useState<PromptTemplate | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    loadPrompts()
  }, [])

  const handleCopy = useCallback((prompt: PromptTemplate) => {
    copyToClipboard(prompt.content)
    setCopiedId(prompt.id)
    setTimeout(() => setCopiedId(null), 2000)
  }, [])

  const handlePin = useCallback((prompt: PromptTemplate) => {
    updatePrompt(prompt.id, { pinned: prompt.pinned ? 0 : 1 })
  }, [updatePrompt])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    await deletePrompt(deleteTarget.id)
    setDeleteTarget(null)
  }, [deleteTarget, deletePrompt])

  const handleCreate = useCallback(async (data: Partial<PromptTemplate>) => {
    await createPrompt(data)
  }, [createPrompt])

  const handleEdit = useCallback(async (data: Partial<PromptTemplate>) => {
    if (!editTarget) return
    await updatePrompt(editTarget.id, data)
    setEditTarget(null)
  }, [editTarget, updatePrompt])

  const pinnedPrompts = filteredPrompts.filter((p) => p.pinned)
  const unpinnedPrompts = filteredPrompts.filter((p) => !p.pinned)

  if (isLoading) {
    return (
      <div className="h-full p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-full" />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search prompts..."
              className="pl-9"
            />
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> New Prompt
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCategory(null)}
            className={cn(
              'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              !selectedCategory
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-transparent text-muted-foreground hover:bg-accent'
            )}
          >
            All ({prompts.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                selectedCategory === cat
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-transparent text-muted-foreground hover:bg-accent'
              )}
            >
              {cat} ({prompts.filter((p) => p.category === cat).length})
            </button>
          ))}
        </div>

        {filteredPrompts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">No prompts found</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              {searchQuery || selectedCategory
                ? 'Try adjusting your search or filter.'
                : 'Create your first prompt template to get started.'}
            </p>
            {!searchQuery && !selectedCategory && (
              <Button onClick={() => setCreateOpen(true)} className="mt-4">
                <Plus className="mr-1.5 h-4 w-4" /> New Prompt
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {pinnedPrompts.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pinned</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {pinnedPrompts.map((prompt) => (
                    <PromptCard
                      key={prompt.id}
                      prompt={prompt}
                      copiedId={copiedId}
                      onCopy={handleCopy}
                      onPin={handlePin}
                      onPreview={() => setPreviewTarget(prompt)}
                      onUse={() => setUseTarget(prompt)}
                      onEdit={() => setEditTarget(prompt)}
                      onDelete={() => setDeleteTarget(prompt)}
                    />
                  ))}
                </div>
              </div>
            )}
            {unpinnedPrompts.length > 0 && (
              <div className="space-y-3">
                {pinnedPrompts.length > 0 && (
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">All</h3>
                )}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {unpinnedPrompts.map((prompt) => (
                    <PromptCard
                      key={prompt.id}
                      prompt={prompt}
                      copiedId={copiedId}
                      onCopy={handleCopy}
                      onPin={handlePin}
                      onPreview={() => setPreviewTarget(prompt)}
                      onUse={() => setUseTarget(prompt)}
                      onEdit={() => setEditTarget(prompt)}
                      onDelete={() => setDeleteTarget(prompt)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <PromptDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSave={handleCreate}
        isEdit={false}
        categories={categories}
      />
      <PromptDialog
        open={!!editTarget}
        onOpenChange={(o) => { if (!o) setEditTarget(null) }}
        onSave={handleEdit}
        initial={editTarget ?? undefined}
        isEdit
        categories={categories}
      />
      <PreviewDialog
        open={!!previewTarget}
        onOpenChange={(o) => { if (!o) setPreviewTarget(null) }}
        prompt={previewTarget}
        onUse={() => { setUseTarget(previewTarget); setPreviewTarget(null) }}
      />
      <UseDialog
        open={!!useTarget}
        onOpenChange={(o) => { if (!o) setUseTarget(null) }}
        prompt={useTarget}
      />

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Prompt</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  )
}

function PromptCard({
  prompt,
  copiedId,
  onCopy,
  onPin,
  onPreview,
  onUse,
  onEdit,
  onDelete,
}: {
  prompt: PromptTemplate
  copiedId: string | null
  onCopy: (p: PromptTemplate) => void
  onPin: (p: PromptTemplate) => void
  onPreview: () => void
  onUse: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <Card className="group cursor-pointer transition-shadow hover:shadow-md" onClick={onPreview}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="font-medium text-sm truncate">{prompt.name}</h4>
            {prompt.description && (
              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{prompt.description}</p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onUse() }}>Use</DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit() }}>
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => { e.stopPropagation(); onDelete() }}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <pre className="text-xs text-muted-foreground font-mono line-clamp-3 whitespace-pre-wrap">
          {truncate(prompt.content, 150)}
        </pre>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {prompt.category && (
              <Badge variant="secondary" className="text-[10px]">{prompt.category}</Badge>
            )}
          </div>
          <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onPin(prompt)}
                >
                  <Star
                    className={cn(
                      'h-3.5 w-3.5',
                      prompt.pinned ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'
                    )}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{prompt.pinned ? 'Unpin' : 'Pin'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onCopy(prompt)}
                >
                  {copiedId === prompt.id ? (
                    <span className="text-[10px] text-green-500 font-medium">Copied!</span>
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy to clipboard</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

import { useEffect, useState, useCallback, useRef, useMemo, memo } from 'react'
import {
  Folder,
  File,
  FileText,
  FileCode,
  FileJson,
  FileImage,
  ChevronRight,
  ChevronDown,
  Search,
  GitBranch,
  Plus,
  Trash2,
  Pencil,
  Upload,
  RefreshCw,
  Copy,
  Check,
  Folders,
  X,
  FolderOpen,
  Brain,
  MoreHorizontal,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn, formatBytes, copyToClipboard, formatRelativeTime } from '@/lib/utils'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useUIStore } from '@/stores/uiStore'
import { CodingAgent } from './CodingAgent'
import { WorkspaceIntelligence } from './WorkspaceIntelligence'
import { ProjectBrain } from './ProjectBrain'
import { Markdown } from '@/components/Markdown'
import type { FileEntry, FileSearchResult, Workspace } from '@/types'

function getFileIcon(entry: FileEntry) {
  const ext = entry.name.split('.').pop()?.toLowerCase() || ''
  if (entry.type === 'directory') return <Folder className="h-4 w-4 text-blue-400" />
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) return <FileCode className="h-4 w-4 text-blue-400" />
  if (['json', 'jsonc'].includes(ext)) return <FileJson className="h-4 w-4 text-yellow-400" />
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'].includes(ext)) return <FileImage className="h-4 w-4 text-purple-400" />
  if (['md', 'mdx', 'txt', 'log'].includes(ext)) return <FileText className="h-4 w-4 text-green-400" />
  if (['css', 'scss', 'less'].includes(ext)) return <FileCode className="h-4 w-4 text-pink-400" />
  if (['html', 'htm'].includes(ext)) return <FileCode className="h-4 w-4 text-orange-400" />
  if (['yaml', 'yml', 'toml'].includes(ext)) return <FileText className="h-4 w-4 text-blue-300" />
  if (['py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h'].includes(ext)) return <FileCode className="h-4 w-4 text-red-400" />
  return <File className="h-4 w-4 text-muted-foreground" />
}

interface FileTreeNodeProps {
  entry: FileEntry
  depth: number
  onFileClick: (entry: FileEntry) => void
  onRename: (entry: FileEntry) => void
  onDelete: (entry: FileEntry) => void
  selectedPath: string | null
}

function FileTreeNodeBase({ entry, depth, onFileClick, onRename, onDelete, selectedPath }: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)

  const toggleExpand = async () => {
    if (entry.type !== 'directory') {
      onFileClick(entry)
      return
    }
    if (expanded) {
      setExpanded(false)
      return
    }
    setLoading(true)
    try {
      const entries: FileEntry[] = await window.api.workspace.listDirectory(entry.path)
      setChildren(entries.sort((a: FileEntry, b: FileEntry) => {
        if (a.type === b.type) return a.name.localeCompare(b.name)
        return a.type === 'directory' ? -1 : 1
      }))
      setExpanded(true)
    } catch {
      setChildren([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1 rounded-md px-2 py-0.5 text-sm transition-colors hover:bg-muted/50',
          selectedPath === entry.path && 'bg-muted font-medium'
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={toggleExpand}
      >
        {entry.type === 'directory' ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-3.5" />
        )}
        {getFileIcon(entry)}
        <span className="flex-1 truncate">{entry.name}</span>
        {entry.type === 'directory' && children.length > 0 && (
          <span className="shrink-0 text-[10px] text-muted-foreground">{children.length}</span>
        )}
        <div className="hidden shrink-0 group-hover:flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={(e) => { e.stopPropagation(); onRename(entry) }}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-destructive"
            onClick={(e) => { e.stopPropagation(); onDelete(entry) }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      {expanded && loading && (
        <div className="ml-8 py-1 text-xs text-muted-foreground">Loading...</div>
      )}
      {expanded && !loading && children.map((child) => (
        <FileTreeNode
          key={child.path}
          entry={child}
          depth={depth + 1}
          onFileClick={onFileClick}
          onRename={onRename}
          onDelete={onDelete}
          selectedPath={selectedPath}
        />
      ))}
    </div>
  )
}

const FileTreeNode = memo(FileTreeNodeBase)

interface FilePreviewProps {
  filePath: string
  onAttach?: (file: { path: string; name: string; content: string }) => void
}

function FilePreviewBase({ filePath, onAttach }: FilePreviewProps) {
  const [content, setContent] = useState<string | null>(null)
  const [imageData, setImageData] = useState<string | null>(null)
  const [pdfInfo, setPdfInfo] = useState<{ text: string; pageCount: number } | null>(null)
  const [detectedType, setDetectedType] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const fileName = filePath.split(/[\\/]/).pop() || ''

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      setContent(null)
      setImageData(null)
      setPdfInfo(null)
      try {
        const detected = await window.api.tools.detectFile(filePath)
        if (cancelled) return
        setDetectedType(detected.mimeType || '')

        if (detected.mimeType?.startsWith('image/')) {
          const img = await window.api.tools.readImage(filePath)
          if (!cancelled) setImageData(img.dataUrl)
        } else if (detected.mimeType === 'application/pdf') {
          const pdf = await window.api.tools.readPdf(filePath)
          if (!cancelled) setPdfInfo(pdf)
        } else {
          const res: any = await window.api.workspace.readFile(filePath)
          if (!cancelled) {
            if (!res || res.error) {
              setContent(res?.error ? `Error: ${res.error}` : 'No preview available')
            } else if (res.base64) {
              setContent(`[Binary file: ${detected.mimeType || 'unknown'}]`)
            } else {
              const text: string = res.content || ''
              const ext = fileName.split('.').pop()?.toLowerCase()
              let body = text
              if (ext === 'json') {
                try {
                  body = JSON.stringify(JSON.parse(text), null, 2)
                } catch {
                  body = text
                }
              }
              setContent(res.truncated ? `${body}\n\n… (file truncated for preview)` : body)
            }
          }
        }
      } catch (err: any) {
        if (!cancelled) setContent(`Error: ${err.message}`)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [filePath])

  const handleCopy = () => {
    if (content) {
      copyToClipboard(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  const handleAttach = () => {
    if (onAttach && content) {
      onAttach({ path: filePath, name: fileName, content })
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate text-sm font-medium">{fileName}</span>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {formatBytes(new Blob([content || '']).size)}
          </Badge>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onAttach && (
            <Button variant="ghost" size="sm" onClick={handleAttach} className="gap-1 text-xs">
              <Upload className="h-3 w-3" />
              Attach
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy}>
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {imageData && (
          <div className="flex items-center justify-center p-4">
            <img src={imageData} alt={fileName} className="max-w-full rounded-md border" />
          </div>
        )}
        {pdfInfo && (
          <div className="p-3">
            <div className="mb-3 flex items-center gap-2">
              <Badge variant="secondary">{pdfInfo.pageCount} page{pdfInfo.pageCount !== 1 ? 's' : ''}</Badge>
            </div>
            <ScrollArea className="h-[calc(100%-2.5rem)]">
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground">
                {pdfInfo.text}
              </pre>
            </ScrollArea>
          </div>
        )}
        {content && !imageData && !pdfInfo && (
          /\.(md|mdx)$/i.test(fileName) || detectedType === 'markdown' ? (
            <div className="h-full overflow-auto p-4">
              <Markdown content={content} />
            </div>
          ) : (
            <pre className="p-3 font-mono text-xs leading-relaxed">{content}</pre>
          )
        )}
        {!content && !imageData && !pdfInfo && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No preview available
          </div>
        )}
      </div>
    </div>
  )
}

const FilePreview = memo(FilePreviewBase)

interface NewWorkspaceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onBrowse: () => void
}

/**
 * Single source of truth for the "New Workspace" form. Previously this markup
 * was duplicated in two places (the empty state and the toolbar), which meant
 * a change to one copy silently drifted from the other.
 */
function NewWorkspaceDialog({ open, onOpenChange, onBrowse }: NewWorkspaceDialogProps) {
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace)
  const [name, setName] = useState('')
  const [path, setPath] = useState('')

  const handleCreate = async () => {
    if (!name.trim()) return
    await createWorkspace(name.trim(), path.trim() || undefined)
    setName('')
    setPath('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Workspace</DialogTitle>
          <DialogDescription>Create a workspace to organize your project.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ws-name">Name</Label>
            <Input
              id="ws-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Project"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ws-path">Folder path (optional)</Label>
            <div className="flex gap-2">
              <Input
                id="ws-path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="C:\projects\my-app"
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={onBrowse}>
                Browse
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleCreate} disabled={!name.trim()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function WorkspaceView() {
  const {
    workspaces,
    currentWorkspace,
    selectWorkspace,
    openFolder,
    updateWorkspace,
    deleteWorkspace,
    panel,
    setPanel,
    pendingFile,
    setPendingFile,
  } = useWorkspaceStore()
  const setPendingAttachment = useUIStore((s) => s.setPendingAttachment)
  const setActiveTab = useUIStore((s) => s.setActiveTab)

  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<FileSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [renamingEntry, setRenamingEntry] = useState<FileEntry | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deletingEntry, setDeletingEntry] = useState<FileEntry | null>(null)
  const [isWorkspaceAction, setIsWorkspaceAction] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createType, setCreateType] = useState<'file' | 'directory'>('file')
  const [sidebarKey, setSidebarKey] = useState(0)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const refreshSidebar = () => setSidebarKey((k) => k + 1)

  // Deep-link target coming from global search / command palette.
  useEffect(() => {
    if (!pendingFile) return
    setSelectedFile(pendingFile)
    setPendingFile(null)
  }, [pendingFile, setPendingFile])

  useEffect(() => {
    if (currentWorkspace?.path && searchQuery.trim()) {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
      searchTimerRef.current = setTimeout(async () => {
        setIsSearching(true)
        try {
          const results = await window.api.workspace.searchFiles({
            path: currentWorkspace.path!,
            query: searchQuery.trim(),
          })
          setSearchResults(results)
        } catch {
          setSearchResults([])
        } finally {
          setIsSearching(false)
        }
      }, 300)
    } else {
      setSearchResults([])
    }
  }, [searchQuery, currentWorkspace])

  const handleOpenFolder = async () => {
    await openFolder()
  }

  const handleRename = async () => {
    if (!renamingEntry || !renameValue.trim()) return
    try {
      if (isWorkspaceAction && currentWorkspace) {
        await updateWorkspace(currentWorkspace.id, { name: renameValue.trim() })
      } else {
        if (!currentWorkspace?.path) return
        const dir = renamingEntry.path.replace(/[\\/][^\\/]+$/, '')
        const newPath = dir + '\\' + renameValue.trim()
        await window.api.workspace.renameFile(renamingEntry.path, newPath)
        refreshSidebar()
      }
    } catch (err: any) {
      await window.api.notifications.create({
        type: 'error',
        title: 'Rename Failed',
        message: err.message,
      })
    }
    setRenamingEntry(null)
    setIsWorkspaceAction(false)
  }

  const handleDelete = async () => {
    if (!deletingEntry) return
    try {
      if (isWorkspaceAction && currentWorkspace) {
        await deleteWorkspace(currentWorkspace.id)
      } else {
        await window.api.workspace.deleteFile(deletingEntry.path)
        if (selectedFile === deletingEntry.path) setSelectedFile(null)
        refreshSidebar()
      }
    } catch (err: any) {
      await window.api.notifications.create({
        type: 'error',
        title: 'Delete Failed',
        message: err.message,
      })
    }
    setDeletingEntry(null)
    setIsWorkspaceAction(false)
  }

  const handleCreateFile = async () => {
    if (!createName.trim() || !currentWorkspace?.path) return
    const fullPath = currentWorkspace.path + '\\' + createName.trim()
    try {
      if (createType === 'file') {
        await window.api.workspace.createFile({ path: fullPath, content: '' })
      } else {
        await window.api.workspace.createDirectory(fullPath)
      }
      refreshSidebar()
    } catch (err: any) {
      await window.api.notifications.create({
        type: 'error',
        title: 'Create Failed',
        message: err.message,
      })
    }
    setCreateName('')
    setShowCreateDialog(false)
  }

  const handleAttach = useCallback(
    (file: { path: string; name: string; content: string }) => {
      setPendingAttachment(file)
      setActiveTab('chat')
    },
    [setPendingAttachment, setActiveTab]
  )

  const handleFileClick = useCallback((e: FileEntry) => {
    setSelectedFile(e.path)
    try {
      void window.api?.developer?.track('file_opened', {
        key: e.path,
        value: e.name,
        workspaceId: currentWorkspace?.id,
      })
    } catch {
      /* tracking is best-effort */
    }
  }, [currentWorkspace?.id])
  const handleTreeRename = useCallback((e: FileEntry) => {
    setIsWorkspaceAction(false)
    setRenamingEntry(e)
    setRenameValue(e.name)
  }, [])
  const handleTreeDelete = useCallback((e: FileEntry) => {
    setIsWorkspaceAction(false)
    setDeletingEntry(e)
  }, [])
  const rootEntry = useMemo<FileEntry | null>(() => {
    if (!currentWorkspace?.path) return null
    return {
      name: currentWorkspace.name,
      path: currentWorkspace.path,
      type: 'directory',
      size: 0,
      modifiedAt: 0,
    }
  }, [currentWorkspace?.name, currentWorkspace?.path])

  if (!currentWorkspace) {
    return (
      <div className="flex h-full flex-col">
        <div className="fx-empty h-full gap-7 py-0">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-fx-gold/10 ring-1 ring-fx-gold/20">
              <Folders className="h-7 w-7 text-fx-gold" />
            </div>
            <h2 className="fx-title">Open a folder to get started</h2>
            <p className="fx-prose-lead max-w-sm text-center">
              Browse files, run commands and keep your code beside the conversation.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <Button onClick={handleOpenFolder} className="gap-2">
              <FolderOpen className="h-4 w-4" />
              Open folder
            </Button>
            <Button variant="outline" onClick={() => setShowNewDialog(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              New workspace
            </Button>
          </div>
          {workspaces.length > 0 && (
            <div className="mt-2 flex flex-col items-center gap-2.5">
              <span className="fx-label">Recent workspaces</span>
              <div className="flex flex-wrap justify-center gap-2">
                {workspaces.map((ws) => (
                  <Button
                    key={ws.id}
                    variant="ghost"
                    size="sm"
                    onClick={() => selectWorkspace(ws.id)}
                    className="gap-1.5 text-muted-foreground"
                  >
                    <Folder className="h-3.5 w-3.5" />
                    {ws.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
        <NewWorkspaceDialog open={showNewDialog} onOpenChange={setShowNewDialog} onBrowse={handleOpenFolder} />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/40 px-4">
        <Select
          value={currentWorkspace.id}
          onValueChange={(v) => selectWorkspace(v)}
        >
          <SelectTrigger className="h-8 w-[190px] border-transparent bg-transparent shadow-none hover:bg-accent/50 focus:ring-0">
            <SelectValue>
              <div className="flex items-center gap-1.5 text-[13px] font-medium">
                <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                {currentWorkspace.name}
              </div>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {workspaces.map((ws) => (
              <SelectItem key={ws.id} value={ws.id}>
                <div className="flex items-center gap-1.5">
                  <Folder className="h-3.5 w-3.5" />
                  {ws.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="mx-1 h-4 w-px bg-border/60" />

        <Button variant="ghost" size="sm" onClick={handleOpenFolder} className="gap-1.5 text-muted-foreground">
          <FolderOpen className="h-3.5 w-3.5" />
          Open folder
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowNewDialog(true)} className="gap-1.5 text-muted-foreground">
          <Plus className="h-3.5 w-3.5" />
          New
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" aria-label="Workspace options">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onClick={() => {
              setIsWorkspaceAction(true)
              setRenamingEntry({ name: currentWorkspace.name, path: '', type: 'file', size: 0, modifiedAt: 0 })
              setRenameValue(currentWorkspace.name)
            }}>
              <Pencil className="h-3.5 w-3.5" /> Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                setIsWorkspaceAction(true)
                setDeletingEntry({ name: currentWorkspace.name, path: '', type: 'file', size: 0, modifiedAt: 0 })
              }}
              className="text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {currentWorkspace.path && (
          <span className="fx-meta ml-auto truncate font-mono text-[10px] text-muted-foreground/70">
            {currentWorkspace.path}
          </span>
        )}
      </div>

      <Tabs value={panel} onValueChange={(v) => setPanel(v as any)} className="flex flex-1 overflow-hidden">
        <TabsList className="mx-4 mt-2 w-fit">
          <TabsTrigger value="explorer" className="gap-1.5">
            <Folders className="h-3.5 w-3.5" />
            Explorer
          </TabsTrigger>
          <TabsTrigger value="terminal-git" className="gap-1.5">
            <GitBranch className="h-3.5 w-3.5" />
            Terminal & Git
          </TabsTrigger>
          <TabsTrigger value="intelligence" className="gap-1.5">
            <Brain className="h-3.5 w-3.5" />
            Intelligence
          </TabsTrigger>
          <TabsTrigger value="brain" className="gap-1.5">
            <Brain className="h-3.5 w-3.5" />
            Brain
          </TabsTrigger>
        </TabsList>

        <TabsContent value="explorer" className="mt-0 flex-1 overflow-hidden">
          <div className="flex h-full">
            {currentWorkspace.path && (
              <div className="flex w-72 flex-col border-r">
                <div className="flex items-center gap-1 border-b px-3 py-2">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search files..."
                    className="h-7 border-0 bg-transparent text-xs shadow-none focus-visible:ring-0"
                  />
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => setSearchQuery('')}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <div className="flex items-center justify-between px-3 py-1.5">
                  <span className="text-[10px] font-medium uppercase text-muted-foreground">Files</span>
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={refreshSidebar}
                    >
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => setShowCreateDialog(true)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <ScrollArea className="flex-1">
                  {searchQuery.trim() ? (
                    <div className="p-2">
                      {isSearching ? (
                        <div className="py-4 text-center text-xs text-muted-foreground">Searching...</div>
                      ) : searchResults.length === 0 ? (
                        <div className="py-4 text-center text-xs text-muted-foreground">No results</div>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          {searchResults.map((result, i) => (
                            <div
                              key={`${result.path}-${i}`}
                              className="cursor-pointer rounded-md px-2 py-1 text-xs hover:bg-muted/50"
                              onClick={() => setSelectedFile(result.path)}
                            >
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                {getFileIcon({ name: result.name, path: result.path, type: 'file', size: 0, modifiedAt: 0 })}
                                <span className="truncate">{result.name}</span>
                              </div>
                              {result.matches.slice(0, 2).map((match, j) => (
                                <div key={j} className="mt-0.5 truncate pl-5 text-[10px] text-muted-foreground/70">
                                  L{match.line}: {match.text}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-1" key={sidebarKey}>
                      <FileTreeNode
                        entry={rootEntry!}
                        depth={0}
                        onFileClick={handleFileClick}
                        onRename={handleTreeRename}
                        onDelete={handleTreeDelete}
                        selectedPath={selectedFile}
                      />
                    </div>
                  )}
                </ScrollArea>
              </div>
            )}

            <div className="flex-1 overflow-hidden">
              {selectedFile ? (
                <FilePreview filePath={selectedFile} onAttach={handleAttach} />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <FileText className="h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">
                    {currentWorkspace.path
                      ? 'Select a file to preview'
                      : 'No folder selected — use Open Folder to start'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="terminal-git" className="mt-0 flex-1 overflow-hidden px-4 pb-4">
          {currentWorkspace.path ? (
            <CodingAgent cwd={currentWorkspace.path} workspaceId={currentWorkspace.id} onUseInChat={handleAttach as any} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <GitBranch className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                Open a folder to use terminal and git features
              </p>
            </div>
          )}
        </TabsContent>
      <TabsContent value="intelligence" className="mt-0 flex-1 overflow-hidden">
          <WorkspaceIntelligence workspaceId={currentWorkspace.id} path={currentWorkspace.path} />
        </TabsContent>
        <TabsContent value="brain" className="mt-0 flex-1 overflow-hidden">
          <ProjectBrain workspaceId={currentWorkspace.id} />
        </TabsContent>
      </Tabs>

      <NewWorkspaceDialog open={showNewDialog} onOpenChange={setShowNewDialog} onBrowse={handleOpenFolder} />

      <Dialog open={!!renamingEntry} onOpenChange={(open) => { if (!open) { setRenamingEntry(null); setIsWorkspaceAction(false) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-input">New name</Label>
            <Input
              id="rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRename() }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleRename} disabled={!renameValue.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingEntry} onOpenChange={(open) => { if (!open) { setDeletingEntry(null); setIsWorkspaceAction(false) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deletingEntry?.name}"? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create {createType === 'file' ? 'File' : 'Folder'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant={createType === 'file' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCreateType('file')}
              >
                File
              </Button>
              <Button
                variant={createType === 'directory' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCreateType('directory')}
              >
                Folder
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-name">Name</Label>
              <Input
                id="create-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFile() }}
                placeholder={createType === 'file' ? 'index.ts' : 'src'}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleCreateFile} disabled={!createName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

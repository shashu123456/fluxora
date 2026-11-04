import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Terminal as TerminalIcon,
  Play,
  RotateCcw,
  RefreshCw,
  GitBranch,
  Copy,
  Check,
  ShieldAlert,
  Wand2,
} from 'lucide-react'
import { AgentWorkflow } from '@/components/workspace/AgentWorkflow'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn, copyToClipboard, formatRelativeTime } from '@/lib/utils'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import type { GitStatus } from '@/types'
import type { TerminalActivityEntry } from '@/types/terminal'

function getStatusColor(status: string): string {
  if (status.includes('A') || status.includes('??')) return 'text-green-500'
  if (status.includes('M')) return 'text-yellow-500'
  if (status.includes('D')) return 'text-red-500'
  if (status.includes('R')) return 'text-blue-500'
  return 'text-muted-foreground'
}

function getStatusLabel(status: string): string {
  if (status.includes('A') || status.includes('??')) return 'Added'
  if (status.includes('M')) return 'Modified'
  if (status.includes('D')) return 'Deleted'
  if (status.includes('R')) return 'Renamed'
  return status
}

interface TerminalSectionProps {
  cwd: string
  workspaceId?: string
}

export function TerminalSection({ cwd, workspaceId }: TerminalSectionProps) {
  const [command, setCommand] = useState('')
  const [output, setOutput] = useState('')
  const [exitCode, setExitCode] = useState<number | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [history, setHistory] = useState<TerminalActivityEntry[]>([])
  const [historyCommand, setHistoryCommand] = useState('')
  const [histIdx, setHistIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  const loadHistory = useCallback(async () => {
    try {
      const cmds = workspaceId ? await window.api.terminal.history(workspaceId) : await window.api.terminal.history()
      setHistory(cmds)
    } catch {}
  }, [workspaceId])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const handleRun = async (cmd?: string) => {
    const runCommand = (cmd || command).trim()
    if (!runCommand || isRunning) return
    setIsRunning(true)
    setOutput('')
    setExitCode(null)
    setHistoryCommand(runCommand)
    try {
      const result = await window.api.terminal.run({ command: runCommand, cwd, workspaceId })
      try {
        void window.api?.developer?.track('command_run', {
          key: runCommand.trim().split(/\s+/)[0] || runCommand,
          value: runCommand,
          workspaceId,
        })
      } catch {
        /* tracking is best-effort */
      }
      setOutput(result.output || result.error || (result.cancelled ? '[Command cancelled]' : result.timedOut ? '[Command timed out]' : ''))
      setExitCode(result.exitCode)
      await loadHistory()
      setHistIdx(-1)
    } catch (err: any) {
      setOutput(err.message || 'Failed to run command')
      setExitCode(1)
    } finally {
      setIsRunning(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleRun()
      return
    }
    if (e.key === 'ArrowUp' && history.length > 0) {
      e.preventDefault()
      const next = histIdx === -1 ? 0 : Math.min(histIdx + 1, history.length - 1)
      setHistIdx(next)
      setCommand(history[next].command)
      return
    }
    if (e.key === 'ArrowDown' && histIdx !== -1) {
      e.preventDefault()
      if (histIdx === 0) {
        setHistIdx(-1)
        setCommand('')
      } else {
        const next = histIdx - 1
        setHistIdx(next)
        setCommand(history[next].command)
      }
    }
  }

  const handleManualChange = (v: string) => {
    setCommand(v)
    if (histIdx !== -1) setHistIdx(-1)
  }

  const handleCopyOutput = () => {
    copyToClipboard(output)
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <TerminalIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={command}
            onChange={(e) => handleManualChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="h-9 pl-8 font-mono text-sm"
            disabled={isRunning}
          />
        </div>
        <Button
          size="sm"
          onClick={() => handleRun()}
          disabled={!command.trim() || isRunning}
          className="gap-1.5"
        >
          {isRunning ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {isRunning ? 'Running...' : 'Run'}
        </Button>
      </div>

      {(output || isRunning) && (
        <div className="relative min-h-[120px] flex-1 overflow-hidden rounded-md border bg-muted/30">
          <div className="absolute right-2 top-2 z-10">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopyOutput} disabled={!output}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <ScrollArea className="h-full">
            <pre className={cn('p-3 font-mono text-xs leading-relaxed', isRunning && 'animate-pulse')}>
              {isRunning ? (
                <span className="text-muted-foreground">Running...</span>
              ) : (
                <>
                  <div className="mb-1 text-muted-foreground">
                    $ {historyCommand}
                  </div>
                  <span className={cn(
                    exitCode === 0 ? 'text-green-500' : exitCode !== null ? 'text-red-500' : 'text-foreground'
                  )}>
                    {output}
                  </span>
                  {exitCode !== null && (
                    <div className={cn('mt-1 text-[10px]', exitCode === 0 ? 'text-green-500' : 'text-red-500')}>
                      exit code: {exitCode}
                    </div>
                  )}
                </>
              )}
            </pre>
          </ScrollArea>
        </div>
      )}

      {history.length > 0 && (
        <div className="flex-1 overflow-hidden">
          <div className="mb-2 text-xs font-medium text-muted-foreground">Recent Commands</div>
          <ScrollArea className="h-[calc(100%-1.5rem)]">
            <div className="flex flex-col gap-1">
              {history.map((cmd) => (
                <div
                  key={cmd.runId}
                  className="group flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-1.5"
                >
                  <TerminalIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <code className="flex-1 truncate font-mono text-xs">{cmd.command}</code>
                  {cmd.approvedBy && (
                    <Badge
                      variant="outline"
                      className="shrink-0 gap-1 text-[9px] text-amber-500"
                      title={`Approved: ${cmd.approvedBy}`}
                    >
                      <ShieldAlert className="h-2.5 w-2.5" />
                      {cmd.approvedBy === 'session' ? 'session approved' : 'approved'}
                    </Badge>
                  )}
                  {cmd.exitCode !== null && (
                    <Badge
                      variant={cmd.exitCode === 0 ? 'success' : 'destructive'}
                      className="shrink-0 text-[10px]"
                    >
                      {cmd.exitCode}
                    </Badge>
                  )}
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatRelativeTime(cmd.startedAt)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100"
                    onClick={() => {
                      setCommand(cmd.command)
                      inputRef.current?.focus()
                    }}
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}

interface GitSectionProps {
  cwd: string
}

export function GitSection({ cwd }: GitSectionProps) {
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null)
  const [diff, setDiff] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)
  const [showCommitDialog, setShowCommitDialog] = useState(false)
  const [showDiffDialog, setShowDiffDialog] = useState(false)
  const [copied, setCopied] = useState(false)

  const refreshStatus = useCallback(async () => {
    setIsLoading(true)
    try {
      const status = await window.api.git.status(cwd)
      setGitStatus(status)
    } catch {
      setGitStatus(null)
    } finally {
      setIsLoading(false)
    }
  }, [cwd])

  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  const handleCommit = async () => {
    if (!commitMessage.trim() || isCommitting) return
    setIsCommitting(true)
    try {
      await window.api.git.commit(cwd, commitMessage.trim())
      setCommitMessage('')
      setShowCommitDialog(false)
      await refreshStatus()
      await window.api.notifications.create({
        type: 'success',
        title: 'Commit Created',
        message: commitMessage.trim(),
      })
    } catch (err: any) {
      await window.api.notifications.create({
        type: 'error',
        title: 'Commit Failed',
        message: err.message || 'Failed to create commit',
      })
    } finally {
      setIsCommitting(false)
    }
  }

  const handleViewDiff = async () => {
    setShowDiffDialog(true)
    try {
      const result = await window.api.git.diff(cwd)
      setDiff(result || '')
    } catch {
      setDiff('Failed to load diff')
    }
  }

  const handleCopyDiff = () => {
    copyToClipboard(diff)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          {gitStatus ? (
            <Badge variant="outline" className="font-mono text-xs">
              {gitStatus.branch}
            </Badge>
          ) : (
            <span className="text-sm text-muted-foreground">
              {isLoading ? 'Loading...' : 'No git repository'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refreshStatus} disabled={isLoading} className="gap-1.5">
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            Refresh
          </Button>
          {gitStatus && gitStatus.changes.length > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleViewDiff}
                className="gap-1.5"
              >
                View Diff
              </Button>
              <Dialog open={showCommitDialog} onOpenChange={setShowCommitDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1.5">
                    Commit
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Commit</DialogTitle>
                    <DialogDescription>
                      Commit {gitStatus.changes.length} changed file{gitStatus.changes.length !== 1 ? 's' : ''} on branch {gitStatus.branch}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2">
                    <Label htmlFor="commit-msg">Commit message</Label>
                    <Textarea
                      id="commit-msg"
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      placeholder="Describe your changes..."
                      rows={3}
                      className="font-mono text-sm"
                    />
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button
                      onClick={handleCommit}
                      disabled={!commitMessage.trim() || isCommitting}
                    >
                      {isCommitting ? 'Committing...' : 'Commit'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      {gitStatus && (
        <div className="flex-1 overflow-hidden">
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            Changes ({gitStatus.changes.length})
          </div>
          <ScrollArea className="h-[calc(100%-1.5rem)]">
            <div className="flex flex-col gap-0.5">
              {gitStatus.changes.map((change) => (
                <div
                  key={change.path}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-sm"
                >
                  <span className={cn('w-4 font-mono text-xs font-bold', getStatusColor(change.status))}>
                    {change.status}
                  </span>
                  <span className="flex-1 truncate font-mono text-xs">{change.path}</span>
                  <span className={cn('text-[10px]', getStatusColor(change.status))}>
                    {getStatusLabel(change.status)}
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {!gitStatus && !isLoading && (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <GitBranch className="mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Not a git repository</p>
          <p className="text-xs text-muted-foreground/70">Navigate to a git-enabled folder to use git features</p>
        </div>
      )}

      <Dialog open={showDiffDialog} onOpenChange={setShowDiffDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Diff</DialogTitle>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopyDiff}>
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <pre className="rounded-md bg-muted/30 p-3 font-mono text-xs leading-relaxed">
              {diff ? (
                diff.split('\n').map((line, i) => {
                  let colorClass = 'text-foreground'
                  if (line.startsWith('+') && !line.startsWith('+++')) colorClass = 'text-green-500'
                  else if (line.startsWith('-') && !line.startsWith('---')) colorClass = 'text-red-500'
                  else if (line.startsWith('@@')) colorClass = 'text-blue-400'
                  return (
                    <div key={i} className={colorClass}>
                      {line || ' '}
                    </div>
                  )
                })
              ) : (
                <span className="text-muted-foreground">No changes</span>
              )}
            </pre>
          </ScrollArea>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function CodingAgent({ cwd, workspaceId, onUseInChat }: { cwd: string; workspaceId?: string; onUseInChat?: (text: string) => void }) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Tabs defaultValue="agent" className="flex h-full flex-col">
        <TabsList className="mx-4 mt-2 w-fit">
          <TabsTrigger value="agent" className="gap-1.5">
            <Wand2 className="h-3.5 w-3.5" />
            Agent
          </TabsTrigger>
          <TabsTrigger value="terminal" className="gap-1.5">
            <TerminalIcon className="h-3.5 w-3.5" />
            Terminal
          </TabsTrigger>
          <TabsTrigger value="git" className="gap-1.5">
            <GitBranch className="h-3.5 w-3.5" />
            Git
          </TabsTrigger>
        </TabsList>
        <TabsContent value="agent" className="mt-0 flex-1 overflow-hidden px-4 pb-4">
          <AgentWorkflow cwd={cwd} workspaceId={workspaceId} onUseInChat={onUseInChat as any} />
        </TabsContent>
        <TabsContent value="terminal" className="mt-0 flex-1 overflow-hidden px-4 pb-4">
          <TerminalSection cwd={cwd} workspaceId={workspaceId} />
        </TabsContent>
        <TabsContent value="git" className="mt-0 flex-1 overflow-hidden px-4 pb-4">
          <GitSection cwd={cwd} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

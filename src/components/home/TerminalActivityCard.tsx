import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, Clock, Loader2, TerminalSquare, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn, formatRelativeTime } from '@/lib/utils'
import type { TerminalActivityEntry, TerminalActivitySnapshot } from '@/types/terminal'

function durationLabel(entry: TerminalActivityEntry): string {
  if (entry.status === 'running') {
    return `${Math.max(1, Math.round((Date.now() - entry.startedAt) / 1000))}s`
  }
  return entry.durationMs < 1000 ? `${entry.durationMs}ms` : `${Math.round(entry.durationMs / 1000)}s`
}

function statusMeta(entry: TerminalActivityEntry) {
  switch (entry.status) {
    case 'running':
      return { label: 'Running', icon: Loader2, className: 'text-fx-gold', spin: true }
    case 'success':
      return { label: 'Passed', icon: Check, className: 'text-emerald-400', spin: false }
    case 'cancelled':
      return { label: 'Cancelled', icon: X, className: 'text-fx-muted', spin: false }
    case 'timed-out':
      return { label: 'Timed out', icon: Clock, className: 'text-amber-400', spin: false }
    default:
      return { label: 'Failed', icon: AlertTriangle, className: 'text-red-400', spin: false }
  }
}

export function TerminalActivityCard({ workspaceId }: { workspaceId?: string }) {
  const [snapshot, setSnapshot] = useState<TerminalActivitySnapshot | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const result = await window.api.terminal.activity(workspaceId)
      setSnapshot(result)
    } catch {
      setSnapshot(null)
    }
  }, [workspaceId])

  useEffect(() => {
    void refresh()
    const unsubscribe = window.api.terminal.onUpdated(() => {
      void refresh()
    })
    return unsubscribe
  }, [refresh])

  const cancel = async (runId: string) => {
    setCancelling(runId)
    try {
      await window.api.terminal.cancel(runId)
    } finally {
      setCancelling(null)
      void refresh()
    }
  }

  const running = snapshot?.running ?? []
  const recent = (snapshot?.recent ?? []).filter((entry) => entry.status !== 'running').slice(0, 4)
  if (running.length === 0 && recent.length === 0) return null

  return (
    <section className="fx-panel p-6" aria-label="Terminal activity">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-fx-hairline bg-fx-inset text-fx-gold">
            <TerminalSquare className="h-4 w-4" />
          </span>
          <div>
            <h2 className="fx-heading">Terminal activity</h2>
            <p className="fx-caption mt-1">Approved commands, captured results and anything currently running.</p>
          </div>
        </div>
        {running.length > 0 && (
          <span className="fx-chip border-fx-gold/30 bg-fx-gold/10 text-fx-gold">{running.length} running</span>
        )}
      </div>

      {running.length > 0 && (
        <div className="mt-5 space-y-2">
          {running.map((entry) => {
            const meta = statusMeta(entry)
            const Icon = meta.icon
            return (
              <div key={entry.runId} className="fx-row flex items-center gap-3 px-3 py-2.5">
                <Icon className={cn('h-4 w-4 shrink-0', meta.className, meta.spin && 'animate-spin')} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-fx-text">{entry.command}</p>
                  <p className="fx-caption mt-0.5 truncate">
                    {entry.workspaceName || entry.workspaceId} · {durationLabel(entry)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={cancelling === entry.runId}
                  onClick={() => void cancel(entry.runId)}
                  aria-label={`Cancel ${entry.command}`}
                >
                  {cancelling === entry.runId ? 'Stopping' : 'Cancel'}
                </Button>
              </div>
            )
          })}
        </div>
      )}

      {recent.length > 0 && (
        <div className="mt-5 space-y-1">
          <p className="fx-label mb-2">Recent</p>
          {recent.map((entry) => {
            const meta = statusMeta(entry)
            const Icon = meta.icon
            return (
              <div key={entry.runId} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-fx-inset">
                <Icon className={cn('h-3.5 w-3.5 shrink-0', meta.className)} />
                <p className="min-w-0 flex-1 truncate font-mono text-xs text-fx-muted">{entry.command}</p>
                <span className={cn('shrink-0 text-[11px]', meta.className)}>{meta.label}</span>
                <span className="fx-caption w-16 shrink-0 text-right">{durationLabel(entry)}</span>
                <span className="fx-caption hidden w-20 shrink-0 text-right sm:block">
                  {formatRelativeTime(entry.finishedAt || entry.startedAt)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

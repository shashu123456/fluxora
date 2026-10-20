import { useEffect, useState } from 'react'
import {
  Brain,
  Files,
  Folders,
  HardDrive,
  Clock,
  RefreshCw,
  GitBranch,
  GitCommit,
  Wrench,
  Package,
  BookOpen,
  FolderTree,
  History,
  Boxes,
  GitFork,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn, formatBytes, formatRelativeTime } from '@/lib/utils'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { WorkspaceIndex } from '@/types'

export function WorkspaceIntelligence({ workspaceId, path }: { workspaceId: string; path?: string }) {
  const indexes = useWorkspaceStore((s) => s.indexes)
  const indexing = useWorkspaceStore((s) => s.indexing)
  const getIndex = useWorkspaceStore((s) => s.getIndex)
  const indexWorkspace = useWorkspaceStore((s) => s.indexWorkspace)
  const [error, setError] = useState<string | null>(null)

  const index: WorkspaceIndex | undefined = path ? indexes[workspaceId] : undefined
  const isIndexing = path ? !!indexing[workspaceId] : false

  useEffect(() => {
    if (!path) {
      setError(null)
      return
    }
    let cancelled = false
    const load = async () => {
      setError(null)
      try {
        const cached = await getIndex(workspaceId)
        if (cancelled) return
        if (!cached) await indexWorkspace(workspaceId)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Indexing failed')
      }
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, path])

  const handleReindex = async () => {
    setError(null)
    try {
      await indexWorkspace(workspaceId)
    } catch (e: any) {
      setError(e?.message || 'Indexing failed')
    }
  }

  if (!path) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <Brain className="h-10 w-10 text-primary/40" />
        <p className="text-sm text-muted-foreground">
          Open a folder to automatically index this project.
        </p>
      </div>
    )
  }

  if (isIndexing && !index) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">
          Scanning project structure…
        </p>
      </div>
    )
  }

  if (!index) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <Brain className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">
          {error || 'No project index available yet.'}
        </p>
        <Button variant="outline" size="sm" onClick={handleReindex} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Index now
        </Button>
      </div>
    )
  }

  const totalLangCount = index.languages.reduce((acc, l) => acc + l.count, 0)
  const depEntries = Object.entries(index.dependencies).filter(([, deps]) => Object.keys(deps).length > 0)

  return (
    <div className="h-full overflow-y-auto px-5 py-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Project Intelligence</h3>
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Clock className="h-3 w-3" />
            indexed {formatRelativeTime(index.indexedAt)}
          </Badge>
          {index.durationMs !== undefined && (
            <span className="text-[10px] text-muted-foreground">
              in {(index.durationMs / 1000).toFixed(1)}s
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={handleReindex} disabled={isIndexing} className="gap-1.5">
          <RefreshCw className={cn('h-3.5 w-3.5', isIndexing && 'animate-spin')} />
          Reindex
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={<Files className="h-4 w-4 text-primary" />} label="Files" value={formatNumber(index.fileCount)} />
        <StatCard icon={<Folders className="h-4 w-4 text-blue-400" />} label="Folders" value={formatNumber(index.dirCount)} />
        <StatCard icon={<HardDrive className="h-4 w-4 text-emerald-400" />} label="Source size" value={formatBytes(index.totalSize)} />
        <StatCard icon={<GitBranch className="h-4 w-4 text-purple-400" />} label="Git" value={index.git.isRepo ? (index.git.hasChanges ? 'dirty' : 'clean') : 'not a repo'} />
      </div>

      <div className="mb-5 space-y-4">
        {index.git.isRepo && (
          <Section title="Git">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="gap-1.5">
                <GitBranch className="h-3 w-3" />
                {index.git.branch || 'unknown branch'}
              </Badge>
              <Badge
                variant={index.git.hasChanges ? 'outline' : 'secondary'}
                className={index.git.hasChanges ? 'gap-1.5 border-amber-500/40 text-amber-500' : 'gap-1.5'}
              >
                <GitFork className="h-3 w-3" />
                {index.git.hasChanges ? 'Working tree has changes' : 'Working tree clean'}
              </Badge>
              {index.git.lastCommit && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <GitCommit className="h-3 w-3" />
                  {index.git.lastCommit}
                </span>
              )}
            </div>
          </Section>
        )}

        {index.packageManagers.length > 0 && (
          <Section title="Package managers">
            <div className="flex flex-wrap items-center gap-2">
              <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
              {index.packageManagers.map((pm) => (
                <Badge key={pm} className="bg-primary/10 text-primary">
                  {pm}
                </Badge>
              ))}
            </div>
          </Section>
        )}

        {index.frameworks.length > 0 && (
          <Section title="Frameworks">
            <div className="flex flex-wrap gap-1.5">
              {index.frameworks.map((fw) => (
                <Badge key={fw} variant="outline" className="gap-1.5 border-fx-gold/25 bg-fx-gold/5 text-fx-gold">
                  <Boxes className="h-3 w-3" />
                  {fw}
                </Badge>
              ))}
            </div>
          </Section>
        )}

        {index.configFiles.length > 0 && (
          <Section title="Config files">
            <div className="rounded-lg border border-border/50 bg-muted/30 p-2">
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {index.configFiles.slice(0, 16).map((cf) => (
                  <div key={cf.path} className="flex items-center gap-2 px-1.5 py-0.5 text-xs">
                    <FolderTree className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{cf.name}</span>
                  </div>
                ))}
              </div>
              {index.configFiles.length > 16 && (
                <div className="px-1.5 pb-1 pt-0.5 text-[10px] text-muted-foreground">
                  +{index.configFiles.length - 16} more
                </div>
              )}
            </div>
          </Section>
        )}

        {index.languages.length > 0 && (
          <Section title="Languages" subtitle={totalLangCount > 0 ? `${totalLangCount} source files` : undefined}>
            <div className="space-y-2">
              {index.languages.map((lang) => {
                const pct = totalLangCount > 0 ? Math.round((lang.count / totalLangCount) * 100) : 0
                return (
                  <div key={lang.lang} className="flex items-center gap-2 text-xs">
                    <span className="w-28 shrink-0 truncate">{lang.lang}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                    <span className="w-12 shrink-0 text-right text-muted-foreground">{lang.count}</span>
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {depEntries.length > 0 && (
          <Section title="Dependencies">
            <div className="space-y-3">
              {depEntries.slice(0, 4).map(([manager, deps]) => (
                <div key={manager}>
                  <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    <Package className="h-3 w-3" />
                    {manager}
                    <span className="text-muted-foreground/70">({Object.keys(deps).length})</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(deps).slice(0, 24).map(([name, ver]) => (
                      <Badge key={name} variant="outline" className="font-mono text-[10px]">
                        {name}
                        {ver !== 'latest' && <span className="ml-1 text-muted-foreground">{ver}</span>}
                      </Badge>
                    ))}
                    {Object.keys(deps).length > 24 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{Object.keys(deps).length - 24} more
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {index.readmeSnippet && (
          <Section title="README">
            <div className="relative rounded-lg border border-border/50 bg-muted/30 p-3">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <BookOpen className="h-3.5 w-3.5" />
                {index.readme?.split(/[\\/]/).pop()}
              </div>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground/90">
                {index.readmeSnippet}
                {index.readmeSnippet.length >= 500 && <span>…</span>}
              </p>
            </div>
          </Section>
        )}

        {index.topStructure.length > 0 && (
          <Section title="Structure">
            <div className="grid gap-1.5 rounded-lg border border-border/50 bg-muted/30 p-3 sm:grid-cols-2">
              {index.topStructure.map((entry) => (
                <div key={entry} className="truncate font-mono text-[11px] text-muted-foreground">
                  <FolderTree className="mr-1.5 inline h-3 w-3 text-primary/60" />
                  {entry}
                </div>
              ))}
            </div>
          </Section>
        )}

        {index.recentFiles.length > 0 && (
          <Section title="Recently modified">
            <div className="rounded-lg border border-border/50 bg-muted/30 p-2">
              {index.recentFiles.slice(0, 8).map((f) => (
                <div
                  key={f.path}
                  className="flex items-center gap-2 px-1.5 py-1 text-xs hover:bg-muted"
                >
                  <History className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                  <span className="min-w-0 flex-1 truncate">{f.path}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatRelativeTime(f.modifiedAt)}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="fx-hover-lift flex items-center gap-3 rounded-2xl border border-border/60 bg-card/40 px-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted shadow-sm">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold leading-tight">{value}</div>
        <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      </div>
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Boxes className="h-3.5 w-3.5 text-primary/70" />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground/90">{title}</h4>
        {subtitle && <span className="text-[10px] text-muted-foreground">{subtitle}</span>}
      </div>
      {children}
    </div>
  )
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 10000) return `${Math.round(n / 1000)}k`
  return String(n)
}
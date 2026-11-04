import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  Clock,
  Code2,
  Compass,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react'
import { PageHeader, PageShell } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useDeveloperStore } from '@/stores/developerStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { cn, formatRelativeTime } from '@/lib/utils'
import type { DeveloperInsight } from '@/types/developer'

const INSIGHT_LABEL: Record<DeveloperInsight['kind'], string> = {
  preference: 'Preference',
  habit: 'Habit',
  trend: 'Trend',
  suggestion: 'Suggestion',
}

function SectionHeading({ icon: Icon, title, caption }: { icon: typeof Clock; title: string; caption?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="fx-heading flex items-center gap-2">
        <Icon className="h-4 w-4 text-fx-gold/80" />
        {title}
      </h2>
      {caption ? <span className="fx-meta">{caption}</span> : null}
    </div>
  )
}

function TraitRow({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5 py-2">
      <span className="w-36 shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground/70">{label}</span>
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {values.map((value) => (
          <span key={value} className="fx-chip">
            {value}
          </span>
        ))}
      </div>
    </div>
  )
}

export function ProfileView() {
  const {
    profile,
    insights,
    sessions,
    memories,
    personalization,
    loading,
    loaded,
    loadOverview,
    loadMemories,
    addMemory,
    removeMemory,
    reset,
  } = useDeveloperStore()
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace)

  const [memoryDraft, setMemoryDraft] = useState('')
  const [adding, setAdding] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetIncludeMemory, setResetIncludeMemory] = useState(false)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    if (!loaded) void loadOverview(currentWorkspace?.id ?? null)
    void loadMemories()
  }, [loaded, loadOverview, loadMemories, currentWorkspace?.id])

  const traitValues = useMemo(() => {
    if (!profile) return null
    return {
      languages: profile.languages.slice(0, 5).map((t) => `${t.name} · ${Math.round(t.share * 100)}%`),
      frameworks: profile.frameworks.slice(0, 5).map((t) => t.name),
      providers: profile.providers.slice(0, 3).map((t) => t.name),
      projectTypes: profile.projectTypes.slice(0, 4).map((t) => t.name),
      searchTopics: profile.searchTopics.slice(0, 5).map((t) => t.name),
      themes: profile.aiRequestThemes.slice(0, 4).map((t) => t.name),
    }
  }, [profile])

  const handleAddMemory = async () => {
    if (!memoryDraft.trim() || adding) return
    setAdding(true)
    await addMemory(memoryDraft.trim(), 'user')
    setMemoryDraft('')
    setAdding(false)
  }

  const handleReset = async () => {
    setResetting(true)
    await reset(resetIncludeMemory)
    setResetting(false)
    setResetOpen(false)
    if (resetIncludeMemory) await loadMemories(true)
  }

  const confidence = profile ? Math.round(profile.confidence * 100) : 0

  if (loading && !profile) {
    return (
      <PageShell width="narrow">
        <div className="space-y-5 py-2">
          <Skeleton className="h-9 w-52" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell width="narrow">
      <PageHeader
        eyebrow="You"
        title="Developer profile"
        description="An inferred, local picture of how you build. Fluxora learns quietly — no questionnaires, no telemetry."
        icon={UserRound}
        actions={
          <Button variant="outline" size="sm" onClick={() => loadOverview(currentWorkspace?.id ?? null)}>
            <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </Button>
        }
      />

      <div className="space-y-7">
        <section className="fx-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="fx-eyebrow">Working profile</p>
              <h2 className="fx-heading mt-1">{profile?.headline || 'Still learning how you build'}</h2>
              <p className="fx-prose-lead mt-1.5 max-w-xl">
                {profile?.summary ||
                  'A few chats, searches and accepted recommendations are enough to start adapting. Everything stays on this machine.'}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant="outline" className="border-fx-gold/25 text-[10px] text-fx-gold">
                {confidence}% confidence
              </Badge>
              <span className="fx-meta">Learns automatically</span>
            </div>
          </div>
          {profile ? (
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-border/40 pt-3">
              {[
                ['Sessions', profile.stats.sessions],
                ['Chats', profile.stats.chats],
                ['AI requests', profile.stats.aiRequests],
                ['Searches', profile.stats.searches],
                ['Files opened', profile.stats.filesOpened],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex items-baseline gap-1.5">
                  <span className="font-display text-sm text-foreground">{value}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">{label}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {profile && traitValues ? (
          <section className="space-y-2.5">
            <SectionHeading icon={Code2} title="How you work" caption="Inferred from your workspaces" />
            <div className="fx-panel divide-y divide-border/40 px-4 py-1">
              <TraitRow label="Languages" values={traitValues.languages} />
              <TraitRow label="Frameworks" values={traitValues.frameworks} />
              <TraitRow label="Projects" values={traitValues.projectTypes} />
              <TraitRow label="Providers" values={traitValues.providers} />
              <TraitRow label="Asks about" values={traitValues.themes} />
              <TraitRow label="Searches" values={traitValues.searchTopics} />
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div className="fx-panel-quiet p-4">
                <p className="fx-label">Answers</p>
                <p className="mt-1 text-[13px] leading-relaxed text-foreground/90">
                  {profile.responseStyle.length} length · {profile.responseStyle.explanation} explanations ·{' '}
                  {profile.responseStyle.code} code
                </p>
              </div>
              <div className="fx-panel-quiet p-4">
                <p className="fx-label">Habits</p>
                <p className="mt-1 text-[13px] leading-relaxed text-foreground/90">
                  {profile.documentationHabit} {profile.testingHabit}
                </p>
              </div>
              {profile.architecturePreferences.length ? (
                <div className="fx-panel-quiet p-4 sm:col-span-2">
                  <p className="fx-label">Architecture lean</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {profile.architecturePreferences.map((preference) => (
                      <span key={preference} className="fx-chip">
                        {preference}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {personalization?.systemPrompt ? (
                <div className="fx-panel-quiet p-4 sm:col-span-2">
                  <p className="fx-label">Applied to every AI request</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                    Tone, depth, code style and provider preference are folded into the system prompt automatically.
                  </p>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="space-y-2.5">
          <SectionHeading icon={Sparkles} title="Learned insights" caption="What Fluxora noticed" />
          {insights.length === 0 ? (
            <div className="fx-empty py-10">
              <Sparkles className="h-5 w-5 text-muted-foreground/60" />
              <p className="mt-2 text-sm text-muted-foreground">Insights appear after a little real usage.</p>
            </div>
          ) : (
            <div className="fx-panel divide-y divide-border/40 overflow-hidden">
              {insights.map((insight) => (
                <div key={insight.id} className="flex gap-3 px-4 py-3.5">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-fx-gold/10 text-fx-gold">
                    <Compass className="h-3 w-3" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-medium text-foreground">{insight.title}</p>
                      <Badge variant="outline" className="text-[9px] uppercase tracking-wider text-muted-foreground/70">
                        {INSIGHT_LABEL[insight.kind]}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{insight.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2.5">
          <SectionHeading icon={Clock} title="Recent sessions" caption="Work automatically tracked" />
          {sessions.length === 0 ? (
            <div className="fx-empty py-10">
              <Clock className="h-5 w-5 text-muted-foreground/60" />
              <p className="mt-2 text-sm text-muted-foreground">Your first session summary appears when you step away.</p>
            </div>
          ) : (
            <div className="fx-panel divide-y divide-border/40 overflow-hidden">
              {sessions.slice(0, 6).map((session) => (
                <div key={session.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[13px] text-foreground">{session.summary}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {session.workspaceName ? `${session.workspaceName} · ` : ''}
                      {formatRelativeTime(session.endedAt)}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/60">
                    {Math.max(1, Math.round(session.durationMs / 60000))}m
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2.5">
          <SectionHeading icon={Layers} title="Developer memory" caption="Travels across projects" />
          <div className="flex gap-2">
            <Input
              value={memoryDraft}
              onChange={(event) => setMemoryDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleAddMemory()
              }}
              placeholder="Preferences, conventions, or context Fluxora should always know"
              aria-label="Add developer memory"
            />
            <Button size="sm" onClick={() => void handleAddMemory()} disabled={!memoryDraft.trim() || adding}>
              {adding ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
              Add
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground/70">
            Developer memory is separate from project memory and follows you between workspaces.
          </p>
          {memories.length === 0 ? (
            <div className="fx-empty py-8">
              <p className="text-sm text-muted-foreground">Nothing saved yet — Fluxora will suggest what is worth keeping.</p>
            </div>
          ) : (
            <div className="fx-panel divide-y divide-border/40 overflow-hidden">
              {memories.map((memory) => (
                <div key={memory.id} className="group flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[13px] leading-relaxed text-foreground/90">{memory.content}</p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/50">
                      {memory.type} · {formatRelativeTime(memory.createdAt)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 opacity-0 transition-opacity duration-2 group-hover:opacity-100"
                    onClick={() => void removeMemory(memory.id)}
                    aria-label="Delete memory"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2.5">
          <SectionHeading icon={BookOpen} title="Your data" caption="Local-first" />
          <div className="fx-panel-quiet flex flex-wrap items-start justify-between gap-4 p-4">
            <div className="flex min-w-0 gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-fx-gold/70" />
              <div>
                <p className="text-[13px] text-foreground">Nothing leaves this machine.</p>
                <p className="mt-0.5 max-w-md text-[12px] leading-relaxed text-muted-foreground">
                  Learning events, sessions and developer memory live in your local database. You can erase everything
                  Fluxora has learned at any time.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setResetOpen(true)}>
              Reset learning
            </Button>
          </div>
        </section>
      </div>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset learned profile</DialogTitle>
            <DialogDescription>
              This clears the developer profile, insights, session history and recommendation affinities. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2.5">
            <span className="text-[13px]">Also delete developer memory</span>
            <Switch checked={resetIncludeMemory} onCheckedChange={setResetIncludeMemory} />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleReset()} disabled={resetting}>
              {resetting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}

import { useEffect, useRef } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { useGlobalSearch, groupSearchResults, runGlobalSearchAction, SEARCH_MIN_CHARS } from '@/lib/globalSearch'
import { FluxoraMark } from '@/components/brand/FluxoraMark'

export function SearchView() {
  const search = useGlobalSearch()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const grouped = groupSearchResults(search.results)
  const trimmed = search.query.trim()
  const hasQuery = trimmed.length >= SEARCH_MIN_CHARS

  return (
    <div className="fx-page">
      <div className="fx-fade mx-auto w-full max-w-2xl px-6 pt-16">
        <div className="text-center">
          <span className="fx-eyebrow">Universal search</span>
          <h1 className="fx-display mt-2">Find anything</h1>
          <p className="fx-prose-lead mx-auto mt-2 max-w-md">
            Chats, files, brain, memory, prompts and models — searched locally, instantly.
          </p>
        </div>

        <div className="fx-panel relative mt-8 overflow-hidden">
          {search.loading && (
            <div className="absolute inset-x-0 top-0 h-px overflow-hidden">
              <div className="h-full w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-fx-gold/80 to-transparent bg-[length:200%_100%]" />
            </div>
          )}
          <div className="flex items-center gap-3 px-4">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={search.query}
              onChange={(e) => search.setQuery(e.target.value)}
              placeholder="Search chats, messages, prompts, memory, models, workspaces…"
              className="flex-1 bg-transparent py-3.5 text-[14px] outline-none placeholder:text-muted-foreground/70"
            />
            {search.loading ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <kbd className="fx-kbd shrink-0">esc</kbd>
            )}
          </div>
        </div>

        <div className="mt-2">
          {!hasQuery && (
            <div className="fx-empty mt-8">
              <FluxoraMark size={26} className="opacity-70" />
              <p className="text-[13px] text-foreground">Start typing</p>
              <p className="max-w-xs text-[11px] text-muted-foreground">
                Results appear as you type — at least {SEARCH_MIN_CHARS} characters.
              </p>
            </div>
          )}

          {hasQuery && grouped.length === 0 && !search.loading && (
            <div className="fx-empty mt-8">
              <FluxoraMark size={26} className="opacity-70" />
              <p className="text-[13px] text-foreground">No results for “{trimmed}”</p>
              <p className="max-w-xs text-[11px] text-muted-foreground">
                Try a shorter phrase, a file name, or a project.
              </p>
            </div>
          )}

          {grouped.map((g) => (
            <section key={g.group} className="mt-5">
              <div className="flex items-center gap-2 px-2 pb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                <span className="text-muted-foreground/70">{g.icon}</span>
                {g.label}
                <span className="text-muted-foreground/40">{g.items.length}</span>
              </div>
              <div className="space-y-0.5">
                {g.items.map((r) => (
                  <button
                    key={`${g.group}-${r.id}`}
                    onClick={async () => {
                      await runGlobalSearchAction(r)
                    }}
                    className="fx-press group flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-1 hover:bg-accent/45"
                  >
                    <span className="mt-0.5 shrink-0 text-muted-foreground transition-colors group-hover:text-fx-gold">
                      {g.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-foreground">{r.title}</span>
                      {r.subtitle && (
                        <span className="block truncate text-[11px] text-muted-foreground">{r.subtitle}</span>
                      )}
                      {r.snippet && (
                        <span className="block truncate text-[11px] text-muted-foreground/70">{r.snippet}</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

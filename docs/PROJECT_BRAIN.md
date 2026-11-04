# Project Brain

The Project Brain is a per-workspace knowledge store that captures architecture decisions, conventions, goals, and todos. It persists across sessions and feeds into the Smart Context Engine so AI responses are grounded in project-specific knowledge.

## Entry Model

```typescript
interface ProjectBrainEntry {
  id: string
  workspaceId: string
  title: string
  content: string
  kind: 'note' | 'decision' | 'architecture' | 'convention' | 'todo'
  status: 'open' | 'done'
  tags: string[]
  pinned: boolean
  source: 'manual' | 'auto'
  createdAt: string
  updatedAt: string
}
```

## Entry Kinds

| Kind | Purpose | Example |
|---|---|---|
| note | General information | "API rate limit is 100 req/min on free tier" |
| decision | Architectural choice with rationale | "Chose Zustand over Redux for zero-boilerplate" |
| architecture | Structural description | "Auth flow: JWT with 15min access + refresh rotation" |
| convention | Coding standards | "All API errors use the {code, message, details} envelope" |
| todo | Pending work item | "Add retry logic to the payment webhook" |

## Operations

- **Create** — manual entry via ProjectBrain component
- **Update** — edit title, content, kind, status, tags, pinned
- **Delete** — remove entry
- **Search** — full-text search across title + content + tags
- **List** — filter by kind, status, pinned; sorted by recency

## Smart Context Integration

`buildSmartContext()` in `src/lib/contextBuilder.ts` includes pinned brain entries in the AI context window. Each entry is formatted as:

```
[kind][tags] Title: content
```

Content is capped at 280 characters per entry; up to 4 pinned entries are included. This ensures the AI knows the project's architecture, conventions, and current goals without manual re-explanation.

## Brain 2.0 Roadmap

The next evolution will auto-maintain these sections from workspace activity:
- **Architecture** — derived from workspace index (frameworks, configs)
- **Stack** — languages + dependencies from index
- **Goals** — extracted from todo entries and recent activity
- **Sprint** — current focus derived from recent chats and file changes
- **Completed** — archived todos and merged PRs
- **Upcoming** — prioritized backlog
- **Issues** — error patterns from terminal history and chat debugging
- **Decisions** — AI-surfaced from conversation summaries
- **Activity** — timeline of meaningful changes
- **Files** — key files identified by the indexer
- **Relationships** — module dependencies from the workspace index
- **Learning** — patterns the AI has noticed across sessions

## API (IPC)

```
brain.list(workspaceId)   → ProjectBrainEntry[]
brain.get(id)             → ProjectBrainEntry
brain.create(entry)       → ProjectBrainEntry
brain.update(id, patch)   → ProjectBrainEntry
brain.delete(id)          → void
brain.search(workspaceId, query) → ProjectBrainEntry[]
```

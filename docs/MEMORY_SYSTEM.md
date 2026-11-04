# Memory System

The Memory System stores persistent facts about the user, conversations, and projects. Memories are injected into AI context so responses stay personalized across sessions without re-explaining preferences.

## Memory Model

```typescript
interface MemoryEntry {
  id: string
  workspaceId: string | null
  scope: 'global' | 'workspace'
  type: 'user' | 'conversation' | 'project' | 'custom'
  content: string
  source: 'manual' | 'auto'
  pinned: boolean
  tags: string[]
  createdAt: string
  updatedAt: string
}
```

## Scopes

- **Global** — applies to all workspaces (user preferences, role, expertise)
- **Workspace** — project-specific facts (tech stack decisions, team conventions)

## Types

| Type | Content | Example |
|---|---|---|
| user | User profile facts | "Senior frontend developer, prefers TypeScript" |
| conversation | Facts extracted from chats | "Working on payment integration for Q3 launch" |
| project | Project-level knowledge | "Uses PostgreSQL with Prisma ORM" |
| custom | User-defined | Any manually created entry |

## Search

Full-text search across `content` and `tags`. Supports workspace-scoped and global queries:

```
memory.search(workspaceId, query)  // workspace + global results
memory.search(query)               // global only
```

Search is debounced at 200ms in the UI to avoid IPC flooding.

## Auto-Extraction

When `autoRemember` is enabled (per-workspace setting), the system extracts notable facts from conversations and stores them as `type: 'conversation'`, `source: 'auto'` entries. Extraction rules:
- User-stated preferences ("I prefer…", "always…", "never…")
- Project facts ("we use…", "the database is…")
- Decisions ("let's go with…", "decided to…")

## Smart Context Integration

`buildSmartContext()` includes the 8 most recent non-pinned memories formatted as:
```
- [type] content
```

Pinned memories are always included regardless of recency.

## API (IPC)

```
memory.list(workspaceId)         → MemoryEntry[]
memory.create(entry)             → MemoryEntry
memory.update(id, patch)         → MemoryEntry
memory.delete(id)                → void
memory.search(workspaceId, query) → MemoryEntry[]
memory.toggle(id)                → MemoryEntry (toggle pinned)
memory.getSettings(workspaceId)  → { autoRemember, memoryEnabled }
memory.setAutoRemember(ws, on)   → void
memory.autoExtract(chatId)       → MemoryEntry[]
```

## Settings

- `memoryEnabled` — master toggle for memory injection into context
- `autoRemember` — automatic extraction from conversations

Both are per-workspace via `WorkspaceSettings`.

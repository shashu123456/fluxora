# Changelog

All notable changes to Fluxora will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] — 2026-10-19

### Added

#### AI Chat
- Multi-provider support: OpenAI, Anthropic, Gemini, Ollama
- Streaming responses with real-time display
- Stop/cancel mid-stream
- Auto-routing: AI selects the best provider/model per request
- Custom provider support (any OpenAI-compatible API)
- Per-chat provider and model selection
- Message branching (parentId, branchId)
- Reasoning display toggle
- Token usage tracking per message

#### Workspace Intelligence
- Project indexing: languages, file/dir counts, total size
- Framework detection (React, Vue, Angular, Svelte, Next.js, etc.)
- Config file detection (tsconfig, eslint, vite, etc.)
- Package manager detection (npm, pnpm, yarn, bun, pip, cargo, etc.)
- Dependency extraction from manifests
- Git integration (branch, last commit, uncommitted status)
- README extraction with AI context snippet
- Top-level structure preview with emojis
- Recently modified files

#### Project Brain
- Per-workspace knowledge store
- Entry kinds: note, decision, architecture, convention, todo
- Pin entries for Smart Context inclusion
- Full-text search

#### Memory System
- Global and workspace-scoped memories
- Types: user, conversation, project, custom
- Full-text search with 200ms debounce
- Auto-extraction from conversations
- Pinned memories always included in AI context

#### Prompts
- Template library with categories
- Variable interpolation ({{variable}})
- Pin frequently used prompts
- Global and workspace-scoped templates

#### Search & Navigation
- Global search across all entities (chats, messages, prompts, memories, settings)
- Command palette (Ctrl+K)
- Keyboard shortcuts (Ctrl+1-6 for tabs)
- Sidebar chat search with debounce

#### Usage Analytics
- Token counts (prompt, completion, total)
- Cost tracking per provider/model
- Response time monitoring
- Per-provider breakdown
- Historical usage charts

#### Terminal & Git
- Command execution with approval checkpoints
- Terminal history per workspace
- Git status, commit, diff

#### File Tools
- PDF text extraction
- Image reading
- OCR (text from images)
- JSON parsing
- File type detection

#### UI/UX
- Custom frameless titlebar
- Obsidian + champagne-gold brand identity
- Splash screen with brand animation
- First-run onboarding dialog
- About dialog with version info
- Dark theme (primary)
- Responsive layout with collapsible sidebar
- Skeleton loading states
- Error boundary

#### Architecture
- Electron 33 + React 18 + TypeScript (strict)
- Vite 5 build pipeline
- Zustand (7 stores)
- SQLite (better-sqlite3) with WAL journaling
- Auto-backup scheduler
- 12 IPC channel groups
- contextBridge API surface
- React.lazy code splitting (7/8 views)
- React.memo on hot-path components
- Design system tokens (Tailwind + shadcn/ui)

#### Packaging
- Windows NSIS installer
- Windows portable executable
- Desktop and Start Menu shortcuts
- Multi-size icon (16-256px)

### Security
- contextIsolation, nodeIntegration:false, sandbox:true
- Navigation lockdown
- API key exposure prevention (hasKey boolean in renderer)
- Path traversal prevention on workspace file ops

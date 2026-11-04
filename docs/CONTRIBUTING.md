# Contributing

## Development Setup

```bash
git clone <repo-url>
cd chat
npm install
npm run electron:dev
```

### Prerequisites

- Node.js 18+
- npm 9+
- Windows 10+ (primary platform; macOS/Linux untested for packaging)

## Project Structure

```
electron/     Main process (Node.js, TypeScript)
src/          Renderer (React, TypeScript, Tailwind)
tests/        Vitest suites (main-process and shared logic)
docs/         Documentation
build/        Packaging assets (icons)
scripts/      Build utilities
```

## Development Workflow

1. Create a feature branch: `git checkout -b feat/my-feature`
2. Make changes
3. Run checks: `npm run typecheck:electron && npx tsc -p tsconfig.json --noEmit`
4. Run tests: `npm test`
5. Test manually: `npm run electron:dev`
6. Commit with conventional commit format
7. Push and create a PR

## Code Style

- **TypeScript strict mode** — no `any` unless absolutely necessary
- **Named exports** — no default exports except React components
- **Zustand stores** — one store per domain, actions defined inline
- **shadcn/ui** — extend existing components, don't create new primitives without need
- **Tailwind** — use design tokens from `tailwind.config.js`, no hardcoded hex values

## Naming Conventions

| Element | Convention | Example |
|---|---|---|
| Components | PascalCase | `ChatView`, `WorkspaceIntelligence` |
| Hooks | camelCase, `use` prefix | `useChatStore` |
| Stores | camelCase, `Store` suffix | `chatStore`, `memoryStore` |
| IPC channels | `domain:action` | `chat:list`, `ai:stream` |
| DB tables | snake_case | `project_brain`, `workspace_index` |
| Types | PascalCase | `WorkspaceIndex`, `ProviderConfig` |

## IPC Development

When adding a new IPC channel:

1. Define the handler in `electron/ipc/<domain>.ts`
2. Register in `electron/main.ts` `registerAllIpc()`
3. Add preload method in `electron/preload.ts`
4. Add types to `src/types/index.ts` and `src/types/api.ts`
5. Document in `docs/IPC_ARCHITECTURE.md`

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

Vitest suites live in `tests/electron`; run `npm run test:coverage` for a coverage report.

## Building

```bash
npm run build           # Electron + renderer production build
npm run build:renderer  # Renderer-only production build
npm run electron:build  # Package installers into release/
```

## Commit Format

```
feat: Add framework detection to workspace index
fix: Debounce memory search IPC calls
docs: Update IPC architecture reference
refactor: Extract provider capability detection
test: Add context builder unit tests
chore: Update electron-builder config
```

## Pull Request Checklist

- [ ] `npm run typecheck:electron` passes
- [ ] `npx tsc -p tsconfig.json --noEmit` passes
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] New IPC channels documented
- [ ] No console.log in production code
- [ ] No TODO/FIXME left unresolved

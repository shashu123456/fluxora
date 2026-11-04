# Workspace Intelligence

Workspace Intelligence indexes a project folder to extract structural, technological, and contextual metadata. It powers the Workspace view, Project Brain auto-population, and Smart Context.

## Index Structure

```typescript
interface WorkspaceIndex {
  languages: { lang: string; count: number }[]
  fileCount: number
  dirCount: number
  totalSize: number
  git: {
    isRepo: boolean
    branch?: string
    lastCommit?: string
    hasUncommitted?: boolean
  }
  packageManagers: {
    npm: boolean; pnpm: boolean; yarn: boolean; bun: boolean
    pip: boolean; poetry: boolean; uv: boolean
    cargo: boolean; go: boolean; composer: boolean; bundler: boolean; mix: boolean
  }
  frameworks: string[]
  configFiles: { name: string; path: string }[]
  dependencies: Record<string, string[]>
  readme?: { path: string; snippet: string }
  topStructure: { name: string; type: 'dir' | 'file'; emoji: string }[]
  recentFiles: { path: string; mtime: number; size: number }[]
  indexedAt: string
  durationMs?: number
}
```

## Walk Algorithm

1. Resolve workspace path from DB
2. `walkDir()` — recursive `readdirSync` with `withFileTypes`
3. Skip directories in `SKIP_DIRS`: node_modules, dist, build, out, release, .next, .git, .gitlab, .cache, __pycache__, coverage, target, venv, .venv, .idea, .vscode, .turbo, .parcel-cache, .gradle, Pods
4. Limits: 50,000 files, depth 14
5. Accumulate: language counts (by extension), file/dir counts, total size, recent files (mtime-sorted, capped 400 during walk → 10 final)

## Language Detection

Extension-to-language map covering 30+ languages: TypeScript, JavaScript, Python, Rust, Go, Java, C/C++, C#, Ruby, PHP, Swift, Kotlin, Scala, HTML, CSS, SCSS, JSON, YAML, TOML, Markdown, SQL, Shell, PowerShell, Lua, R, Dart, Elixir, Haskell, Clojure, and more.

## Framework Detection

Two-pass:

1. **Dependency-based** — scans `dependencies`/`devDependencies` for known packages:
   - React, Next.js, Vue, Nuxt, Angular, Svelte, SvelteKit
   - Express, Fastify, NestJS
   - Electron, Tauri
   - Vite, Webpack, Tailwind CSS, Three.js, Astro, Gatsby, Remix, Docusaurus

2. **File-based** — checks for config files at root:
   - `vite.config.*`, `next.config.*`, `nuxt.config.*`, `svelte.config.*`, `astro.config.*`
   - `tailwind.config.*`, `postcss.config.*`, `webpack.config.*`, `babel.config.*`
   - `tsconfig.json`, `eslint.config.*`, `.eslintrc.*`, `.prettierrc*`, `.editorconfig`
   - `jest.config.*`, `vitest.config.*`, `playwright.config.*`, `cypress.config.*`
   - `biome.json`, `graphql.config.*`
   - `Dockerfile`, `docker-compose.yml`
   - `pom.xml` → Maven, `build.gradle` → Gradle
   - Python: `pyproject.toml` with django/flask/fastapi in deps
   - Ruby: Gemfile with `bundler` → Rails; `manage.py` → Django

## Config File Detection

Top-level scan for development-relevant config files. Includes dotfiles (`.env`, `.dockerignore`) and directory-level configs (`prisma/`, `.github/`, `.vscode/`, `.husky/`). Sorted alphabetically.

## Package Manager Detection

Detects lockfiles and manifests:
- npm (`package-lock.json`), pnpm (`pnpm-lock.yaml`), yarn (`yarn.lock`), bun (`bun.lockb`)
- pip (`requirements.txt`), poetry (`poetry.lock`), uv (`uv.lock`)
- cargo (`Cargo.lock`), go (`go.sum`), composer (`composer.lock`), bundler (`Gemfile.lock`), mix (`mix.lock`)

## Dependency Extraction

Parses `package.json` (dependencies + devDependencies), `requirements.txt`, `Cargo.toml`, `go.mod`, `pom.xml`, `Gemfile`, `mix.exs` into `Record<string, string[]>`.

## Git Info

Runs `git branch --show-current` and `git log -1 --oneline` in the workspace path. Non-repo directories return `{ isRepo: false }`.

## README Extraction

Finds `README.md` (case-insensitive) at root. Extracts the first 500 characters as a snippet for AI context.

## Structure Preview

Top-level entries with emoji prefixes:
- Directories: 📁 (or domain-specific: 📦 for packages, 🎨 for assets, ⚙️ for config)
- Files: type-specific (📄 code, 📝 docs, ⚙️ config, etc.)
- Capped at 30 dirs + 40 files

## Caching

The full index JSON is stored in the `workspace_index` table (keyed by workspace_id). Subsequent loads read from cache; re-indexing happens on demand.

## API (IPC)

```
workspaceIndex.index(workspaceId) → WorkspaceIndex
workspaceIndex.getIndex(workspaceId) → WorkspaceIndex | null
```

## Performance

- Full index of a 10,000-file project: ~2-4 seconds
- Limits prevent pathological cases (monorepos, vendored code)
- SKIP_DIRS eliminates the most expensive directories (node_modules alone can be 50k+ files)

import { ipcMain } from 'electron'
import { get, run } from '../database'
import path from 'path'
import fs from 'fs'
import type { WorkspaceIndex, WorkspaceHealth } from '../../src/types'
import { SKIP_DIRS } from './shared'
import { canonicalizePath, isCanonicalPathInsideRoot } from '../security-policy'
import { buildWorkspaceIntelligence, getWorkspaceIntelligence } from '../services/workspaceIntelligence'

const MAX_SCAN_FILES = 50000
const MAX_DEPTH = 14

function readTextInsideRoot(root: string, filePath: string): string {
  const canonicalRoot = canonicalizePath(root)
  const canonicalFile = canonicalizePath(filePath)
  if (!isCanonicalPathInsideRoot(canonicalFile, canonicalRoot)) {
    throw new Error('Blocked: file is outside the workspace folder.')
  }
  return fs.readFileSync(canonicalFile, 'utf-8')
}

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript', cjs: 'JavaScript',
  py: 'Python', rb: 'Ruby', go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin',
  c: 'C', h: 'C/C++', cpp: 'C++', hpp: 'C++', cs: 'C#', swift: 'Swift',
  php: 'PHP', sh: 'Shell', bash: 'Shell', zsh: 'Shell', ps1: 'PowerShell', bat: 'Batch',
  html: 'HTML', htm: 'HTML', css: 'CSS', scss: 'SCSS', less: 'LESS', vue: 'Vue',
  svelte: 'Svelte', json: 'JSON', jsonc: 'JSON', md: 'Markdown', mdx: 'Markdown',
  yml: 'YAML', yaml: 'YAML', toml: 'TOML', xml: 'XML', sql: 'SQL', graphql: 'GraphQL',
  prisma: 'Prisma', dockerfile: 'Dockerfile', tf: 'Terraform',
}

function walkDir(
  dir: string,
  depth: number,
  state: {
    fileCount: number
    dirCount: number
    totalSize: number
    langCounts: Record<string, number>
    recentFiles: { path: string; modifiedAt: number }[]
    done: boolean
  }
): Promise<void> {
  async function walkAsync(dir: string, depth: number): Promise<void> {
    if (state.done || depth > MAX_DEPTH) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (state.done) return
      if (entry.isSymbolicLink()) continue
      if (entry.name.startsWith('.') && entry.isDirectory() && entry.name !== '.github') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        state.dirCount++
        await walkAsync(full, depth + 1)
        if (state.dirCount % 300 === 0) {
          await new Promise<void>((res) => setImmediate(() => res()))
        }
      } else {
        if (SKIP_DIRS.has(entry.name)) continue
        state.fileCount++
        let stat: fs.Stats
        try {
          stat = fs.statSync(full)
        } catch {
          continue
        }
        state.totalSize += stat.size
        const ext = path.extname(entry.name).slice(1).toLowerCase()
        if (ext && LANGUAGE_BY_EXT[ext]) {
          state.langCounts[LANGUAGE_BY_EXT[ext]] = (state.langCounts[LANGUAGE_BY_EXT[ext]] || 0) + 1
        }
        state.recentFiles.push({ path: full, modifiedAt: stat.mtimeMs })
        if (state.fileCount >= MAX_SCAN_FILES || state.recentFiles.length > 400) {
          state.done = true
          return
        }
      }
    }
  }
  return walkAsync(dir, depth)
}

function readJsonSafe(root: string, p: string): any | null {
  try {
    return JSON.parse(readTextInsideRoot(root, p))
  } catch {
    return null
  }
}

export function detectPackageManagers(root: string): {
  managers: string[]
  dependencies: Record<string, Record<string, string>>
} {
  const managers: string[] = []
  const dependencies: Record<string, Record<string, string>> = {}

  const has = (p: string) => fs.existsSync(path.join(root, p))

  if (has('package.json')) {
    const pkg = readJsonSafe(root, path.join(root, 'package.json'))
    if (pkg) {
      const type = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : has('bun.lockb') ? 'bun' : has('package-lock.json') ? 'npm' : 'npm'
      if (!managers.includes(type)) managers.push(type)
      const deps: Record<string, string> = {}
      for (const [name, ver] of Object.entries(pkg.dependencies || {})) deps[name] = String(ver)
      dependencies[type] = deps
      const devDeps: Record<string, string> = {}
      for (const [name, ver] of Object.entries(pkg.devDependencies || {})) devDeps[name] = String(ver)
      dependencies[`${type} (dev)`] = devDeps
    }
  }
  if (has('requirements.txt')) {
    if (!managers.includes('pip')) managers.push('pip')
    const deps: Record<string, string> = {}
    try {
      for (const line of readTextInsideRoot(root, path.join(root, 'requirements.txt')).split('\n')) {
        const t = line.trim()
        if (!t || t.startsWith('#')) continue
        const m = t.match(/^([A-Za-z0-9_.\-]+)\s*(?:[<>=!~]+\s*([^\s;]+))?.*$/)
        if (m) deps[m[1]] = m[2] || 'latest'
      }
    } catch {}
    dependencies.pip = deps
  }
  if (has('pyproject.toml')) {
    if (!managers.includes('poetry') && !managers.includes('pip')) managers.push(has('uv.lock') ? 'uv' : 'pip')
  }
  if (has('Cargo.toml')) {
    if (!managers.includes('cargo')) managers.push('cargo')
    try {
      const toml = readTextInsideRoot(root, path.join(root, 'Cargo.toml'))
      const deps: Record<string, string> = {}
      const lines = toml.split('\n')
      let inSection = false
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith('[dependencies')) { inSection = true; continue }
        if (trimmed.startsWith('[')) { if (inSection) break; continue }
        if (!inSection) continue
        const m = trimmed.match(/^([A-Za-z0-9_.\-]+)\s*(?:=\s*"?([^"\s]+)"?)?/)
        if (m) deps[m[1]] = m[2] || 'latest'
      }
      dependencies.cargo = deps
    } catch {}
  }
  if (has('go.mod')) {
    if (!managers.includes('go')) managers.push('go')
    const deps: Record<string, string> = {}
    try {
      for (const line of readTextInsideRoot(root, path.join(root, 'go.mod')).split('\n')) {
        const m = line.trim().match(/^(?:require\s+)?([A-Za-z0-9_.\-/.]+)\s+(v[0-9][^\s]*)/)
        if (m && m[1] !== 'module' && m[1] !== 'go') deps[m[1]] = m[2]
      }
    } catch {}
    dependencies.go = deps
  }
  if (has('composer.json')) {
    if (!managers.includes('composer')) managers.push('composer')
    const c = readJsonSafe(root, path.join(root, 'composer.json'))
    if (c) {
      const deps: Record<string, string> = {}
      for (const [name, ver] of Object.entries(c.require || {})) deps[name] = String(ver)
      dependencies.composer = deps
    }
  }
  if (has('Gemfile')) {
    if (!managers.includes('bundler')) managers.push('bundler')
  }
  if (has('mix.exs')) {
    if (!managers.includes('mix')) managers.push('mix')
  }
  return { managers, dependencies }
}

const DEP_FRAMEWORK_MAP: Record<string, string> = {
  react: 'React', 'react-dom': 'React', next: 'Next.js', vue: 'Vue', nuxt: 'Nuxt',
  '@angular/core': 'Angular', svelte: 'Svelte', '@sveltejs/kit': 'SvelteKit',
  express: 'Express', fastify: 'Fastify', '@nestjs/core': 'NestJS',
  electron: 'Electron', vite: 'Vite', webpack: 'Webpack', tailwindcss: 'Tailwind CSS',
  'three': 'Three.js', '@tauri-apps/api': 'Tauri', astro: 'Astro',
  gatsby: 'Gatsby', remix: 'Remix', '@docusaurus/core': 'Docusaurus',
}

export function detectFrameworks(root: string, allDeps: Record<string, Record<string, string>>): string[] {
  const detected = new Set<string>()
  // From all dep maps, map dep names to framework names
  for (const deps of Object.values(allDeps)) {
    for (const name of Object.keys(deps)) {
      const fw = DEP_FRAMEWORK_MAP[name]
      if (fw) detected.add(fw)
    }
  }
  // Detect by presence of framework config files
  const fileChecks: [RegExp, string][] = [
    [/^vite\.config\./, 'Vite'], [/^next\.config\./, 'Next.js'], [/^nuxt\.config\./, 'Nuxt'],
    [/^svelte\.config\./, 'SvelteKit'], [/^astro\.config\./, 'Astro'],
    [/^tailwind\.config\./, 'Tailwind CSS'], [/^postcss\.config\./, 'PostCSS'],
    [/^webpack\.config\./, 'Webpack'], [/^babel\.config\./, 'Babel'],
    [/^tsconfig\.json$/, 'TypeScript'], [/^eslint\.config\./, 'ESLint'], [/^\.eslintrc/, 'ESLint'],
    [/^prettier\.config\./, 'Prettier'], [/^\.prettierrc/, 'Prettier'],
    [/^jest\.config\./, 'Jest'], [/^vitest\.config\./, 'Vitest'],
    [/^playwright\.config\./, 'Playwright'], [/^cypress\.config\./, 'Cypress'],
    [/^biome\.json$/, 'Biome'], [/^graphql\.config\./, 'GraphQL'],
    [/^Dockerfile$/, 'Docker'], [/^docker-compose/, 'Docker Compose'],
    [/^pom\.xml$/, 'Maven'], [/^build\.gradle$/, 'Gradle'],
  ]
  try {
    const topEntries = fs.readdirSync(root, { withFileTypes: true })
      .filter((e) => !e.isDirectory())
      .map((e) => e.name)
    for (const name of topEntries) {
      for (const [re, fw] of fileChecks) {
        if (re.test(name)) detected.add(fw)
      }
    }
  } catch {}
  // Python framework detection
  try {
    const pyDeps = allDeps['pip'] || allDeps['poetry'] || {}
    if ('django' in pyDeps || 'Django' in pyDeps) detected.add('Django')
    if ('flask' in pyDeps || 'Flask' in pyDeps) detected.add('Flask')
    if ('fastapi' in pyDeps || 'FastAPI' in pyDeps) detected.add('FastAPI')
  } catch {}
  // Ruby on Rails
  try {
    const bundlerDeps = allDeps['bundler'] || {}
    if ('rails' in bundlerDeps) detected.add('Ruby on Rails')
  } catch {}
  // manage.py = Django
  try { if (fs.existsSync(path.join(root, 'manage.py'))) detected.add('Django') } catch {}
  return Array.from(detected).sort()
}

const CONFIG_FILE_PATTERNS = [
  /^tsconfig\.json$/, /^tsconfig\./,
  /^eslint\.config\./, /^\.eslintrc/,
  /^prettier\.config\./, /^\.prettierrc/,
  /^\.editorconfig$/, /^babel\.config\./,
  /^vite\.config\./, /^next\.config\./, /^nuxt\.config\./,
  /^svelte\.config\./, /^astro\.config\./,
  /^webpack\.config\./, /^tailwind\.config\./, /^postcss\.config\./,
  /^jest\.config\./, /^vitest\.config\./, /^vitest\.workspace\./,
  /^playwright\.config\./, /^cypress\.config\./,
  /^Dockerfile$/, /^docker-compose/, /^\.dockerignore$/,
  /^biome\.json$/, /^graphql\.config\./,
  /^prisma$/, /^schema\.prisma$/,  // prisma/ handled as dir
  /^pyproject\.toml$/, /^requirements\.txt$/, /^setup\.py$/, /^setup\.cfg$/,
  /^Cargo\.toml$/, /^go\.mod$/, /^pom\.xml$/, /^build\.gradle$/,
  /^package\.json$/, /^pnpm-workspace\.yaml$/, /^bun\.lockb$/,
  /^Makefile$/, /^CMakeLists\.txt$/, /^\.env$/,
]

export function detectConfigFiles(root: string): { name: string; path: string }[] {
  const result: { name: string; path: string }[] = []
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (['prisma', '.github', '.vscode', '.husky'].includes(entry.name)) {
          result.push({ name: `${entry.name}/`, path: path.join(root, entry.name) })
        }
        continue
      }
      if (entry.name.startsWith('.') && entry.name !== '.env' && entry.name !== '.dockerignore') continue
      const matches = CONFIG_FILE_PATTERNS.some((re) => re.test(entry.name))
      if (matches) {
        result.push({ name: entry.name, path: path.join(root, entry.name) })
      }
    }
  } catch {}
  return result.sort((a, b) => a.name.localeCompare(b.name))
}

function findReadme(root: string): { path: string; snippet: string } | undefined {
  for (const name of fs.readdirSync(root)) {
    if (/^readme/i.test(name)) {
      const p = path.join(root, name)
      try {
        if (fs.lstatSync(p).isSymbolicLink()) continue
        const content = readTextInsideRoot(root, p).slice(0, 80_000)
        return { path: p, snippet: content.slice(0, 500) }
      } catch { /* fall through */ }
    }
  }
  return undefined
}

function getGitInfo(root: string): WorkspaceIndex['git'] {
  const gitDir = path.join(root, '.git')
  const isRepo = fs.existsSync(gitDir)
  if (!isRepo) return { isRepo: false }

  let branch = 'unknown'
  try {
    const head = readTextInsideRoot(root, path.join(gitDir, 'HEAD')).trim()
    const m = head.match(/ref:\s*refs\/heads\/(.+)/)
    if (m) branch = m[1]
  } catch {}

  let hasChanges = false
  let lastCommit: string | undefined
  try {
    const porcelain = execFileSyncSafe('git', ['status', '--porcelain'], root)
    hasChanges = (porcelain || '').trim().length > 0
    lastCommit = execFileSyncSafe('git', ['log', '-1', '--oneline'], root)?.trim() || undefined
  } catch {}

  return { isRepo, branch, hasChanges, lastCommit }
}

function execFileSyncSafe(cmd: string, args: string[], cwd: string): string | undefined {
  try {
    const { execFileSync } = require('child_process') as typeof import('child_process')
    return execFileSync(cmd, args, { cwd, encoding: 'utf-8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] } as any)
  } catch {
    return undefined
  }
}

function getTopStructure(root: string): string[] {
  const result: string[] = []
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true })
    const dirs = entries.filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')).map((e) => e.name).sort()
    const files = entries.filter((e) => !e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')).map((e) => e.name).sort()
    for (const d of dirs) {
      let count = 0
      try { count = fs.readdirSync(path.join(root, d)).length } catch {}
      result.push(`📁 ${d}/ (${count})`)
      if (result.length >= 30) return result
    }
    for (const f of files) {
      result.push(`📄 ${f}`)
      if (result.length >= 40) break
    }
  } catch {}
  return result
}

const ENTRY_POINT_CANDIDATES = [
  'index.js', 'index.ts', 'index.mjs', 'main.js', 'main.ts', 'app.js', 'app.ts',
  'server.js', 'server.ts', 'src/index.ts', 'src/index.js', 'src/main.ts', 'src/main.js',
  'src/App.tsx', 'src/App.jsx', 'src/App.vue', 'src/routes.ts', 'src/router.ts',
  'src/main.py', 'manage.py', 'app.py', 'main.go', 'src/main.rs', 'src/lib.rs',
  'index.html', 'public/index.html',
]

export function detectEntryPoints(root: string): string[] {
  const found: string[] = []
  for (const candidate of ENTRY_POINT_CANDIDATES) {
    if (fs.existsSync(path.join(root, candidate))) found.push(candidate)
    if (found.length >= 6) break
  }
  // package.json main/bin field
  try {
    const pkg = readJsonSafe(root, path.join(root, 'package.json'))
    if (pkg?.main && typeof pkg.main === 'string' && fs.existsSync(path.join(root, pkg.main))) {
      if (!found.includes(pkg.main)) found.unshift(pkg.main)
    }
  } catch {}
  return found.slice(0, 8)
}

export function detectDocs(root: string): string[] {
  const docs: string[] = []
  try {
    // Top-level markdown files
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      if (e.isFile() && /\.(md|mdx|rst|txt)$/i.test(e.name)) docs.push(e.name)
      if (docs.length >= 10) break
    }
    // docs/ directory
    const docsDir = path.join(root, 'docs')
    if (fs.existsSync(docsDir) && !fs.lstatSync(docsDir).isSymbolicLink()) {
      for (const e of fs.readdirSync(docsDir, { withFileTypes: true })) {
        if (e.isFile() && /\.(md|mdx|rst|txt)$/i.test(e.name)) docs.push(`docs/${e.name}`)
        if (docs.length >= 16) break
      }
    }
  } catch {}
  return docs.sort()
}

export function detectTestDirs(root: string): string[] {
  const testDirs: string[] = []
  try {
    const topCandidates = ['tests', 'test', '__tests__', 'spec', 'e2e', 'cypress', 'playwright']
    for (const d of topCandidates) {
      if (fs.existsSync(path.join(root, d)) && fs.statSync(path.join(root, d)).isDirectory()) testDirs.push(d)
    }
    // Common nested test dirs
    for (const d of ['src/tests', 'src/__tests__', 'app/tests', 'test/unit', 'test/integration']) {
      if (fs.existsSync(path.join(root, d))) testDirs.push(d)
    }
    // Test config presence implies testing even without obvious dirs
  } catch {}
  return testDirs
}

export function computeHealth(root: string, index: Omit<WorkspaceIndex, 'health'>): WorkspaceHealth {
  const has = (p: string) => fs.existsSync(path.join(root, p))
  const hasTestConfig = ['jest.config.js', 'jest.config.ts', 'jest.config.mjs', 'vitest.config.ts', 'vitest.config.js', 'playwright.config.ts', 'cypress.config.ts', 'cypress.config.js'].some(has)
  const signals: WorkspaceHealth['signals'] = [
    { key: 'readme', label: 'README', ok: !!index.readme, weight: 2 },
    { key: 'tests', label: 'Tests', ok: (index.testDirs?.length || 0) > 0 || hasTestConfig, weight: 3 },
    { key: 'ci', label: 'CI/CD', ok: has('.github/workflows') || has('.gitlab-ci.yml') || has('Jenkinsfile'), weight: 2 },
    { key: 'linting', label: 'Linting', ok: index.configFiles.some((c) => /eslint|biome|prettier/i.test(c.name)), weight: 1 },
    { key: 'types', label: 'TypeScript', ok: index.configFiles.some((c) => /tsconfig/i.test(c.name)) || index.languages.some((l) => l.lang === 'TypeScript'), weight: 2 },
    { key: 'env', label: 'Env template', ok: has('.env.example') || has('.env.sample') || has('.env.template'), weight: 1 },
    { key: 'git', label: 'Git', ok: index.git.isRepo, weight: 2 },
    { key: 'docker', label: 'Docker', ok: has('Dockerfile') || has('docker-compose.yml') || has('docker-compose.yaml'), weight: 1 },
    { key: 'docs', label: 'Docs', ok: (index.docs?.length || 0) > 1, weight: 1 },
  ]
  const total = signals.reduce((a, s) => a + s.weight, 0)
  const earned = signals.reduce((a, s) => a + (s.ok ? s.weight : 0), 0)
  return { score: total > 0 ? Math.round((earned / total) * 100) : 0, signals }
}

export async function indexWorkspace(workspaceId: string): Promise<WorkspaceIndex | null> {
  const ws = await get<any>('SELECT path FROM workspaces WHERE id = ?', [workspaceId])
  if (!ws || !ws.path) return null

  let root: string
  try {
    root = canonicalizePath(ws.path)
    if (!fs.statSync(root).isDirectory()) return null
  } catch {
    return null
  }

  const started = Date.now()
  const state = { fileCount: 0, dirCount: 0, totalSize: 0, langCounts: {} as Record<string, number>, recentFiles: [] as { path: string; modifiedAt: number }[], done: false }
  await walkDir(root, 0, state)

  const languages = Object.entries(state.langCounts)
    .filter(([, c]) => c > 0)
    .map(([lang, count]) => ({ lang, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)

  const recentFiles = state.recentFiles
    .sort((a, b) => b.modifiedAt - a.modifiedAt)
    .slice(0, 10)
    .map((f) => ({ path: f.path, modifiedAt: f.modifiedAt }))

  const { managers, dependencies } = detectPackageManagers(root)
  const frameworks = detectFrameworks(root, dependencies)
  const configFiles = detectConfigFiles(root)
  const readme = findReadme(root)
  const git = getGitInfo(root)
  const topStructure = getTopStructure(root)
  const entryPoints = detectEntryPoints(root)
  const docs = detectDocs(root)
  const testDirs = detectTestDirs(root)

  const base: Omit<WorkspaceIndex, 'health'> = {
    languages,
    fileCount: state.fileCount,
    dirCount: state.dirCount,
    totalSize: state.totalSize,
    git,
    packageManagers: managers,
    frameworks,
    configFiles,
    dependencies,
    readme: readme?.path,
    readmeSnippet: readme?.snippet,
    topStructure,
    recentFiles,
    entryPoints,
    docs,
    testDirs,
    indexedAt: Date.now(),
    durationMs: Date.now() - started,
  }
  const health = computeHealth(root, base)
  const index: WorkspaceIndex = { ...base, health }

  await run(
    `INSERT INTO workspace_index (workspace_id, data, indexed_at) VALUES (?, ?, ?)
     ON CONFLICT(workspace_id) DO UPDATE SET data = excluded.data, indexed_at = excluded.indexed_at`,
    [workspaceId, JSON.stringify(index), index.indexedAt]
  )

  return index
}

export async function getWorkspaceIndex(workspaceId: string): Promise<WorkspaceIndex | null> {
  const row = await get<any>('SELECT data FROM workspace_index WHERE workspace_id = ?', [workspaceId])
  if (!row?.data) return null
  try {
    return JSON.parse(row.data)
  } catch {
    return null
  }
}

export function registerWorkspaceIndexIpc() {
  ipcMain.handle('workspace:index', async (_e, workspaceId: string) => {
    const idx = await indexWorkspace(workspaceId)
    if (idx) {
      try { await buildWorkspaceIntelligence(workspaceId) } catch {}
    }
    return idx
  })
  ipcMain.handle('workspace:get-index', async (_e, workspaceId: string) => getWorkspaceIndex(workspaceId))
  ipcMain.handle('workspace:intelligence', async (_e, workspaceId: string) => getWorkspaceIntelligence(workspaceId))
  ipcMain.handle('workspace:build-intelligence', async (_e, workspaceId: string) => buildWorkspaceIntelligence(workspaceId))
}
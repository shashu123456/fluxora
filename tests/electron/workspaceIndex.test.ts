import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

// Mock electron + database so the module-level imports don't crash
vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir(), isPackaged: false },
  ipcMain: { handle: vi.fn() },
}))
vi.mock('../../electron/database', () => ({
  get: vi.fn().mockResolvedValue(null),
  run: vi.fn().mockResolvedValue(undefined),
}))

const { detectFrameworks, detectConfigFiles, detectPackageManagers, detectEntryPoints, detectDocs, detectTestDirs, computeHealth } = await import('../../electron/ipc/workspaceIndex')

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fluxora-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function writeFile(name: string, content: string) {
  const p = path.join(tmpDir, name)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}

describe('detectFrameworks', () => {
  it('detects React from dependencies', () => {
    writeFile('package.json', JSON.stringify({
      dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
    }))
    const frameworks = detectFrameworks(tmpDir, { npm: { react: '^18.2.0', 'react-dom': '^18.2.0' } })
    expect(frameworks).toContain('React')
  })

  it('detects Next.js from config file', () => {
    writeFile('next.config.js', 'module.exports = {}')
    const frameworks = detectFrameworks(tmpDir, {})
    expect(frameworks).toContain('Next.js')
  })

  it('detects Vite from config file', () => {
    writeFile('vite.config.ts', 'export default {}')
    const frameworks = detectFrameworks(tmpDir, {})
    expect(frameworks).toContain('Vite')
  })

  it('detects TypeScript from tsconfig', () => {
    writeFile('tsconfig.json', '{}')
    const frameworks = detectFrameworks(tmpDir, {})
    expect(frameworks).toContain('TypeScript')
  })

  it('detects Tailwind CSS from config', () => {
    writeFile('tailwind.config.js', 'module.exports = {}')
    const frameworks = detectFrameworks(tmpDir, {})
    expect(frameworks).toContain('Tailwind CSS')
  })

  it('detects Docker from Dockerfile', () => {
    writeFile('Dockerfile', 'FROM node:18')
    const frameworks = detectFrameworks(tmpDir, {})
    expect(frameworks).toContain('Docker')
  })

  it('detects ESLint', () => {
    writeFile('eslint.config.js', 'export default []')
    const frameworks = detectFrameworks(tmpDir, {})
    expect(frameworks).toContain('ESLint')
  })

  it('detects Electron from deps', () => {
    const frameworks = detectFrameworks(tmpDir, { npm: { electron: '^28.0.0' } })
    expect(frameworks).toContain('Electron')
  })

  it('detects Django from manage.py', () => {
    writeFile('manage.py', '#!/usr/bin/env python')
    const frameworks = detectFrameworks(tmpDir, {})
    expect(frameworks).toContain('Django')
  })

  it('detects Flask from pip deps', () => {
    const frameworks = detectFrameworks(tmpDir, { pip: { flask: '3.0' } })
    expect(frameworks).toContain('Flask')
  })

  it('detects multiple frameworks simultaneously', () => {
    writeFile('package.json', JSON.stringify({ dependencies: { react: '^18' } }))
    writeFile('vite.config.ts', '')
    writeFile('tailwind.config.js', '')
    writeFile('tsconfig.json', '{}')
    const frameworks = detectFrameworks(tmpDir, { npm: { react: '^18' } })
    expect(frameworks).toContain('React')
    expect(frameworks).toContain('Vite')
    expect(frameworks).toContain('Tailwind CSS')
    expect(frameworks).toContain('TypeScript')
  })

  it('returns empty array for empty directory', () => {
    const frameworks = detectFrameworks(tmpDir, {})
    expect(frameworks).toEqual([])
  })

  it('returns sorted results', () => {
    writeFile('vite.config.ts', '')
    writeFile('tsconfig.json', '{}')
    writeFile('Dockerfile', '')
    const frameworks = detectFrameworks(tmpDir, {})
    const sorted = [...frameworks].sort()
    expect(frameworks).toEqual(sorted)
  })
})

describe('detectConfigFiles', () => {
  it('finds tsconfig.json', () => {
    writeFile('tsconfig.json', '{}')
    const configs = detectConfigFiles(tmpDir)
    expect(configs.some((c) => c.name === 'tsconfig.json')).toBe(true)
  })

  it('finds package.json', () => {
    writeFile('package.json', '{}')
    const configs = detectConfigFiles(tmpDir)
    expect(configs.some((c) => c.name === 'package.json')).toBe(true)
  })

  it('finds vite.config.ts', () => {
    writeFile('vite.config.ts', '')
    const configs = detectConfigFiles(tmpDir)
    expect(configs.some((c) => c.name === 'vite.config.ts')).toBe(true)
  })

  it('finds Dockerfile', () => {
    writeFile('Dockerfile', '')
    const configs = detectConfigFiles(tmpDir)
    expect(configs.some((c) => c.name === 'Dockerfile')).toBe(true)
  })

  it('finds .env (dotfile exception)', () => {
    writeFile('.env', 'KEY=value')
    const configs = detectConfigFiles(tmpDir)
    expect(configs.some((c) => c.name === '.env')).toBe(true)
  })

  it('finds .dockerignore (dotfile exception)', () => {
    writeFile('.dockerignore', 'node_modules')
    const configs = detectConfigFiles(tmpDir)
    expect(configs.some((c) => c.name === '.dockerignore')).toBe(true)
  })

  it('ignores other dotfiles', () => {
    writeFile('.secret', 'hidden')
    writeFile('.gitignore', 'node_modules')
    const configs = detectConfigFiles(tmpDir)
    expect(configs.some((c) => c.name === '.secret')).toBe(false)
    expect(configs.some((c) => c.name === '.gitignore')).toBe(false)
  })

  it('finds prisma/ directory', () => {
    fs.mkdirSync(path.join(tmpDir, 'prisma'))
    const configs = detectConfigFiles(tmpDir)
    expect(configs.some((c) => c.name === 'prisma/')).toBe(true)
  })

  it('finds .github/ directory', () => {
    fs.mkdirSync(path.join(tmpDir, '.github'))
    const configs = detectConfigFiles(tmpDir)
    expect(configs.some((c) => c.name === '.github/')).toBe(true)
  })

  it('skips non-config directories', () => {
    fs.mkdirSync(path.join(tmpDir, 'src'))
    const configs = detectConfigFiles(tmpDir)
    expect(configs.some((c) => c.name.startsWith('src'))).toBe(false)
  })

  it('returns sorted results', () => {
    writeFile('package.json', '{}')
    writeFile('Dockerfile', '')
    writeFile('tsconfig.json', '{}')
    const configs = detectConfigFiles(tmpDir)
    const names = configs.map((c) => c.name)
    expect(names).toEqual([...names].sort())
  })

  it('finds requirements.txt', () => {
    writeFile('requirements.txt', 'flask>=3.0')
    const configs = detectConfigFiles(tmpDir)
    expect(configs.some((c) => c.name === 'requirements.txt')).toBe(true)
  })

  it('finds Cargo.toml', () => {
    writeFile('Cargo.toml', '[package]')
    const configs = detectConfigFiles(tmpDir)
    expect(configs.some((c) => c.name === 'Cargo.toml')).toBe(true)
  })
})

describe('detectPackageManagers', () => {
  it('detects npm from package-lock.json', () => {
    writeFile('package.json', JSON.stringify({ dependencies: { react: '^18' } }))
    writeFile('package-lock.json', '{}')
    const { managers, dependencies } = detectPackageManagers(tmpDir)
    expect(managers).toContain('npm')
    expect(dependencies.npm).toHaveProperty('react')
  })

  it('detects pnpm from pnpm-lock.yaml', () => {
    writeFile('package.json', '{}')
    writeFile('pnpm-lock.yaml', '')
    const { managers } = detectPackageManagers(tmpDir)
    expect(managers).toContain('pnpm')
  })

  it('detects yarn from yarn.lock', () => {
    writeFile('package.json', '{}')
    writeFile('yarn.lock', '')
    const { managers } = detectPackageManagers(tmpDir)
    expect(managers).toContain('yarn')
  })

  it('detects pip from requirements.txt', () => {
    writeFile('requirements.txt', 'flask>=3.0\n# comment\nrequests\n')
    const { managers, dependencies } = detectPackageManagers(tmpDir)
    expect(managers).toContain('pip')
    expect(dependencies.pip).toHaveProperty('flask')
    expect(dependencies.pip).toHaveProperty('requests')
  })

  it('skips comments and empty lines in requirements.txt', () => {
    writeFile('requirements.txt', '# comment\n\nflask>=3.0\n\n# another comment\n')
    const { dependencies } = detectPackageManagers(tmpDir)
    expect(Object.keys(dependencies.pip)).toEqual(['flask'])
  })

  it('detects cargo from Cargo.toml', () => {
    writeFile('Cargo.toml', '[package]\nname = "test"\n\n[dependencies]\nserde = "1.0"\n')
    const { managers, dependencies } = detectPackageManagers(tmpDir)
    expect(managers).toContain('cargo')
    expect(dependencies.cargo).toHaveProperty('serde')
  })

  it('detects go from go.mod', () => {
    writeFile('go.mod', 'module example.com/myapp\n\ngo 1.21\n\nrequire github.com/gin-gonic/gin v1.9.1\n')
    const { managers, dependencies } = detectPackageManagers(tmpDir)
    expect(managers).toContain('go')
    expect(dependencies.go).toHaveProperty('github.com/gin-gonic/gin')
  })

  it('extracts devDependencies separately', () => {
    writeFile('package.json', JSON.stringify({
      dependencies: { react: '^18' },
      devDependencies: { typescript: '^5.3' },
    }))
    writeFile('package-lock.json', '{}')
    const { dependencies } = detectPackageManagers(tmpDir)
    expect(dependencies.npm).toHaveProperty('react')
    expect(dependencies['npm (dev)']).toHaveProperty('typescript')
  })

  it('returns empty for empty directory', () => {
    const { managers, dependencies } = detectPackageManagers(tmpDir)
    expect(managers).toEqual([])
    expect(dependencies).toEqual({})
  })
})

function mkdirp(name: string) {
  fs.mkdirSync(path.join(tmpDir, name), { recursive: true })
}

describe('detectEntryPoints', () => {
  it('returns empty for empty directory', () => {
    expect(detectEntryPoints(tmpDir)).toEqual([])
  })

  it('finds common entry files', () => {
    writeFile('index.ts', 'export {}')
    writeFile('main.js', '// main')
    const eps = detectEntryPoints(tmpDir)
    expect(eps).toContain('index.ts')
    expect(eps).toContain('main.js')
  })

  it('prefers package.json main field', () => {
    writeFile('src/App.tsx', '// app')
    writeFile('package.json', JSON.stringify({ main: 'src/App.tsx' }))
    const eps = detectEntryPoints(tmpDir)
    expect(eps[0]).toBe('src/App.tsx')
  })

  it('caps at 8 entries', () => {
    for (const f of ['index.ts', 'index.js', 'main.ts', 'main.js', 'app.ts', 'app.js', 'server.ts', 'server.js', 'src/index.ts', 'src/main.ts']) {
      writeFile(f, '// x')
    }
    expect(detectEntryPoints(tmpDir).length).toBeLessThanOrEqual(8)
  })
})

describe('detectDocs', () => {
  it('returns empty when no docs', () => {
    expect(detectDocs(tmpDir)).toEqual([])
  })

  it('finds top-level markdown files', () => {
    writeFile('README.md', '# hi')
    writeFile('CONTRIBUTING.md', '# contribute')
    const docs = detectDocs(tmpDir)
    expect(docs).toContain('README.md')
    expect(docs).toContain('CONTRIBUTING.md')
  })

  it('finds docs/ directory contents', () => {
    mkdirp('docs')
    writeFile('docs/API.md', '# api')
    writeFile('docs/GUIDE.md', '# guide')
    const docs = detectDocs(tmpDir)
    expect(docs).toContain('docs/API.md')
    expect(docs).toContain('docs/GUIDE.md')
  })
})

describe('detectTestDirs', () => {
  it('returns empty for empty directory', () => {
    expect(detectTestDirs(tmpDir)).toEqual([])
  })

  it('finds top-level test directories', () => {
    mkdirp('tests')
    mkdirp('e2e')
    const dirs = detectTestDirs(tmpDir)
    expect(dirs).toContain('tests')
    expect(dirs).toContain('e2e')
  })

  it('finds nested test directories', () => {
    mkdirp('src/__tests__')
    const dirs = detectTestDirs(tmpDir)
    expect(dirs).toContain('src/__tests__')
  })
})

describe('computeHealth', () => {
  const baseIndex = {
    languages: [{ lang: 'TypeScript', count: 10 }],
    fileCount: 50,
    dirCount: 10,
    totalSize: 100000,
    git: { isRepo: true },
    packageManagers: ['npm'],
    frameworks: ['React'],
    configFiles: [] as { name: string; path: string }[],
    dependencies: {},
    topStructure: [] as string[],
    recentFiles: [] as { path: string; modifiedAt: number }[],
    indexedAt: Date.now(),
  }

  it('scores higher with README + tests + CI', () => {
    writeFile('README.md', '# project')
    mkdirp('tests')
    mkdirp('.github/workflows')
    writeFile('tsconfig.json', '{}')
    writeFile('.env.example', 'KEY=')
    const health = computeHealth(tmpDir, {
      ...baseIndex,
      readme: path.join(tmpDir, 'README.md'),
      configFiles: [{ name: 'tsconfig.json', path: path.join(tmpDir, 'tsconfig.json') }],
      testDirs: ['tests'],
      docs: ['README.md'],
    })
    expect(health.score).toBeGreaterThanOrEqual(75)
    expect(health.signals.find((s) => s.key === 'readme')?.ok).toBe(true)
    expect(health.signals.find((s) => s.key === 'tests')?.ok).toBe(true)
    expect(health.signals.find((s) => s.key === 'ci')?.ok).toBe(true)
  })

  it('scores low on bare directory', () => {
    const health = computeHealth(tmpDir, {
      ...baseIndex,
      git: { isRepo: false },
      readme: undefined,
      testDirs: [],
      docs: [],
      languages: [],
      configFiles: [],
    })
    expect(health.score).toBeLessThanOrEqual(30)
    expect(health.signals.every((s) => typeof s.ok === 'boolean')).toBe(true)
  })

  it('has signals summing to expected total weight', () => {
    const health = computeHealth(tmpDir, { ...baseIndex, git: { isRepo: false } })
    const totalWeight = health.signals.reduce((a, s) => a + s.weight, 0)
    expect(totalWeight).toBe(15)
    expect(health.score).toBeGreaterThanOrEqual(0)
    expect(health.score).toBeLessThanOrEqual(100)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncBrain2 } from '../../electron/services/brain2'

const mockGet = vi.fn()
const mockAll = vi.fn()
const mockRun = vi.fn()

vi.mock('../../electron/database', () => ({
  get: (...args: any[]) => mockGet(...args),
  all: (...args: any[]) => mockAll(...args),
  run: (...args: any[]) => mockRun(...args),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockGet.mockResolvedValue(null)
  mockAll.mockResolvedValue([])
  mockRun.mockResolvedValue(undefined)
})

describe('syncBrain2', () => {
  it('creates no sections when no data exists', async () => {
    const result = await syncBrain2('ws1')
    expect(result.sections).toBe(0)
    expect(mockRun).not.toHaveBeenCalled()
  })

  it('creates architecture/stack/deps/files/relationships from workspace index', async () => {
    mockGet.mockImplementation(async (_sql: string, ...params: any[]) => {
      if (_sql.includes('workspace_index')) {
        return {
          data: JSON.stringify({
            frameworks: ['React', 'Electron', 'Vite', 'Tailwind CSS'],
            configFiles: [{ name: 'tsconfig.json', path: 'tsconfig.json' }, { name: 'vite.config.ts', path: 'vite.config.ts' }],
            fileCount: 100,
            dirCount: 20,
            totalSize: 1024 * 1024,
            packageManagers: [{ name: 'npm' }],
            languages: { TypeScript: 80, JavaScript: 20 },
            dependencies: { npm: ['react', 'electron'] },
            recentFiles: [{ path: 'src/App.tsx', mtime: Date.now() }],
            git: { branch: 'main' },
          }),
        }
      }
      if (_sql.includes('project_brain') && _sql.includes('COUNT')) return { c: 5 }
      return null
    })

    const result = await syncBrain2('ws1')
    expect(result.sections).toBeGreaterThanOrEqual(3)
    const insertCalls = mockRun.mock.calls.filter((c) => c[0].toString().includes('INSERT'))
    expect(insertCalls.length).toBeGreaterThanOrEqual(3)
    const ids = insertCalls.map((c) => c[1][0])
    expect(ids.some((id: string) => id.includes('architecture'))).toBe(true)
  })

  it('upserts existing auto entries via UPDATE not INSERT', async () => {
    mockGet.mockImplementation(async (sql: string) => {
      if (sql.includes('workspace_index')) {
        return {
          data: JSON.stringify({
            frameworks: ['React'],
            configFiles: [],
            fileCount: 5,
            dirCount: 1,
            totalSize: 100,
            packageManagers: [],
            languages: { TypeScript: 5 },
            dependencies: {},
            recentFiles: [],
            git: null,
          }),
        }
      }
      if (sql.includes('SELECT id FROM project_brain')) return { id: 'auto:ws1:architecture' }
      return null
    })

    const result = await syncBrain2('ws1')
    expect(result.sections).toBeGreaterThanOrEqual(1)
    const updateCalls = mockRun.mock.calls.filter((c) => c[0].toString().includes('UPDATE project_brain'))
    expect(updateCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('creates activity section from chats and usage', async () => {
    mockGet.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*) as c FROM chats')) return { c: 3 }
      if (sql.includes('FROM usage')) return { calls: 10, tokens: 5000, cost: 1.25 }
      if (sql.includes('project_brain') && sql.includes('COUNT')) return { c: 1 }
      return null
    })
    mockAll.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM chats')) return [{ title: 'Test chat', updated_at: Date.now() }]
      return []
    })

    const result = await syncBrain2('ws1')
    expect(result.sections).toBeGreaterThanOrEqual(1)
    const activityInsert = mockRun.mock.calls.find(
      (c) => c[0].toString().includes('INSERT') && c[1]?.[2]?.toString().includes('Project activity')
    )
    expect(activityInsert).toBeTruthy()
  })

  it('creates goals and completed sections from todos', async () => {
    mockAll.mockImplementation(async (sql: string) => {
      if (sql.includes("kind = 'todo'")) {
        return [
          { title: 'Finish feature', status: 'in-progress', updated_at: Date.now() },
          { title: 'Old task', status: 'done', updated_at: Date.now() - 100000 },
        ]
      }
      return []
    })
    mockGet.mockImplementation(async (sql: string) => {
      if (sql.includes('project_brain') && sql.includes('COUNT')) return { c: 2 }
      return null
    })

    const result = await syncBrain2('ws1')
    expect(result.sections).toBe(2)
    const titles = mockRun.mock.calls.filter((c) => c[0].toString().includes('INSERT')).map((c) => c[1][2])
    expect(titles).toContain('Active goals / sprint')
    expect(titles).toContain('Completed work')
  })

  it('handles database errors gracefully', async () => {
    mockGet.mockRejectedValue(new Error('db locked'))
    mockAll.mockRejectedValue(new Error('db locked'))
    const result = await syncBrain2('ws-broken')
    expect(result.sections).toBe(0)
  })
})

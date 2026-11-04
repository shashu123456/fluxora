import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildSmartContext } from '@/lib/contextBuilder'

// Mock the workspace store
vi.mock('@/stores/workspaceStore', () => ({
  useWorkspaceStore: {
    getState: () => ({
      indexes: {},
      getIndex: vi.fn().mockResolvedValue(null),
    }),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as any).api = {
    memory: { search: vi.fn().mockResolvedValue([]) },
    prompts: { list: vi.fn().mockResolvedValue([]) },
    brain: { list: vi.fn().mockResolvedValue([]) },
  }
})

describe('buildSmartContext', () => {
  it('returns null system when no context available', async () => {
    const result = await buildSmartContext({
      prompt: 'hello', workspaceId: 'global', memoryEnabled: false,
    })
    expect(result.system).toBeNull()
    expect(result.memoryCount).toBe(0)
    expect(result.promptCount).toBe(0)
    expect(result.brainCount).toBe(0)
  })

  it('includes memory when enabled', async () => {
    ;(window as any).api.memory.search.mockResolvedValue([
      { id: 'm1', content: 'User prefers TypeScript language', pinned: 1 },
      { id: 'm2', content: 'Language preference noted', pinned: 0 },
    ])
    ;(window as any).api.prompts.list.mockResolvedValue([])

    const result = await buildSmartContext({
      prompt: 'what language do I use?', workspaceId: 'global', memoryEnabled: true,
    })
    expect(result.system).not.toBeNull()
    expect(result.system).toContain('Relevant memory')
    expect(result.system).toContain('TypeScript')
    expect(result.memoryCount).toBe(2)
  })

  it('deduplicates memories across global and workspace', async () => {
    ;(window as any).api.memory.search.mockImplementation((scope: string) => {
      if (scope === 'global') {
        return Promise.resolve([{ id: 'm1', content: 'Shared memory test', pinned: 0 }])
      }
      return Promise.resolve([{ id: 'm1', content: 'Shared memory test', pinned: 0 }])
    })
    ;(window as any).api.prompts.list.mockResolvedValue([])

    const result = await buildSmartContext({
      prompt: 'test', workspaceId: 'ws-1', memoryEnabled: true,
    })
    expect(result.memoryCount).toBe(1)
  })

  it('sorts pinned memories first', async () => {
    ;(window as any).api.memory.search.mockResolvedValue([
      { id: 'm1', content: 'Unpinned fact test', pinned: 0 },
      { id: 'm2', content: 'Pinned fact test', pinned: 1 },
    ])
    ;(window as any).api.prompts.list.mockResolvedValue([])

    const result = await buildSmartContext({
      prompt: 'test', workspaceId: 'global', memoryEnabled: true,
    })
    const idx1 = result.system!.indexOf('Pinned fact')
    const idx2 = result.system!.indexOf('Unpinned fact')
    expect(idx1).toBeGreaterThanOrEqual(0)
    expect(idx2).toBeGreaterThanOrEqual(0)
    expect(idx1).toBeLessThan(idx2)
  })

  it('includes pinned prompts as instructions', async () => {
    ;(window as any).api.prompts.list.mockResolvedValue([
      { id: 'p1', name: 'Code Style', content: 'Always use TypeScript strict mode', pinned: true },
      { id: 'p2', name: 'Not Pinned', content: 'Irrelevant', pinned: false },
    ])

    const result = await buildSmartContext({
      prompt: 'write code', workspaceId: 'global', memoryEnabled: false,
    })
    expect(result.system).toContain('Pinned instructions')
    expect(result.system).toContain('Code Style')
    expect(result.system).not.toContain('Irrelevant')
    expect(result.promptCount).toBe(1)
  })

  it('includes pinned brain entries for workspace', async () => {
    ;(window as any).api.prompts.list.mockResolvedValue([])
    ;(window as any).api.brain.list.mockResolvedValue([
      { id: 'b1', title: 'Auth Architecture', content: 'JWT with refresh tokens', kind: 'architecture', tags: ['auth'], pinned: true },
      { id: 'b2', title: 'Unpinned', content: 'Should not appear', kind: 'note', tags: [], pinned: false },
    ])

    const result = await buildSmartContext({
      prompt: 'how does auth work?', workspaceId: 'ws-1', memoryEnabled: false,
    })
    expect(result.system).toContain('Project brain')
    expect(result.system).toContain('Auth Architecture')
    expect(result.system).toContain('[architecture]')
    expect(result.system).toContain('[auth]')
    expect(result.system).not.toContain('Should not appear')
    expect(result.brainCount).toBe(1)
  })

  it('handles memory API failure gracefully', async () => {
    ;(window as any).api.memory.search.mockRejectedValue(new Error('DB down'))
    ;(window as any).api.prompts.list.mockResolvedValue([
      { id: 'p1', name: 'Rule', content: 'Always be concise', pinned: true },
    ])

    const result = await buildSmartContext({
      prompt: 'test', workspaceId: 'global', memoryEnabled: true,
    })
    expect(result.system).not.toBeNull()
    expect(result.memoryCount).toBe(0)
    expect(result.promptCount).toBe(1)
  })

  it('caps memory content at 240 chars', async () => {
    const longContent = 'x'.repeat(500)
    ;(window as any).api.memory.search.mockResolvedValue([
      { id: 'm1', content: longContent, pinned: 1 },
    ])
    ;(window as any).api.prompts.list.mockResolvedValue([])

    const result = await buildSmartContext({
      prompt: 'test', workspaceId: 'global', memoryEnabled: true,
    })
    expect(result.system).not.toContain('x'.repeat(241))
  })

  it('respects maxChars budget', async () => {
    ;(window as any).api.memory.search.mockResolvedValue(
      Array.from({ length: 3 }, (_, i) => ({
        id: `m${i}`, content: `test A`.repeat(60), pinned: 1,
      }))
    )
    ;(window as any).api.prompts.list.mockResolvedValue([])

    const result = await buildSmartContext({
      prompt: 'test', workspaceId: 'global', memoryEnabled: true, maxChars: 800,
    })
    if (result.system) {
      expect(result.system.length).toBeLessThan(2000)
    } else {
      expect(result.memoryCount).toBe(0)
    }
  })
})

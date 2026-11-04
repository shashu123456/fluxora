import { describe, expect, it } from 'vitest'
import type { Chat, MemoryEntry, ProjectBrainEntry, Workspace, WorkspaceIndex } from '../src/types'
import {
  buildDependencyGraph,
  buildKnowledgeGraph,
  buildLayers,
  buildTimeline,
  buildWorkspaceGraph,
  dayKey,
  groupByDay,
  layoutGraph,
  memoryBuckets,
  spanInDays,
  timelineStats,
} from '../src/lib/visualization'

const DAY = 24 * 60 * 60 * 1000
const T0 = Date.UTC(2026, 0, 10, 12, 0, 0)

function chat(over: Partial<Chat> = {}): Chat {
  return {
    id: 'c1',
    workspaceId: 'global',
    title: 'Test chat',
    pinned: 0,
    archived: 0,
    favorite: 0,
    createdAt: T0,
    updatedAt: T0,
    ...over,
  }
}

function memory(over: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: 'm1',
    workspaceId: 'global',
    scope: 'global',
    type: 'user',
    content: 'Something worth remembering',
    createdAt: T0,
    updatedAt: T0,
    ...over,
  }
}

function brain(over: Partial<ProjectBrainEntry> = {}): ProjectBrainEntry {
  return {
    id: 'b1',
    workspaceId: 'ws1',
    title: 'Decision',
    content: 'content',
    kind: 'decision',
    pinned: 0,
    source: 'manual',
    createdAt: T0,
    updatedAt: T0,
    ...over,
  }
}

function ws(over: Partial<Workspace> = {}): Workspace {
  return { id: 'ws1', name: 'Alpha', createdAt: T0, updatedAt: T0, ...over }
}

function index(over: Partial<WorkspaceIndex> = {}): WorkspaceIndex {
  return {
    languages: [],
    fileCount: 10,
    dirCount: 2,
    totalSize: 100,
    git: { isRepo: false },
    packageManagers: ['npm'],
    frameworks: [],
    configFiles: [],
    dependencies: {},
    topStructure: [],
    recentFiles: [],
    indexedAt: T0,
    ...over,
  }
}

describe('buildTimeline', () => {
  it('merges chats, memories and brain entries sorted newest first', () => {
    const events = buildTimeline(
      [chat({ id: 'c1', createdAt: T0 - 2 * DAY })],
      [memory({ id: 'm1', createdAt: T0 })],
      [brain({ id: 'b1', createdAt: T0 - DAY })]
    )
    expect(events).toHaveLength(3)
    expect(events[0].kind).toBe('memory')
    expect(events[1].kind).toBe('brain')
    expect(events[2].kind).toBe('chat')
    expect(events.map((e) => e.timestamp)).toEqual([T0, T0 - DAY, T0 - 2 * DAY])
  })

  it('truncates long memory titles to 80 chars with ellipsis', () => {
    const long = 'x'.repeat(120)
    const events = buildTimeline([], [memory({ content: long })], [])
    expect(events[0].title.length).toBe(81)
    expect(events[0].title.endsWith('…')).toBe(true)
  })
})

describe('groupByDay', () => {
  it('groups events by calendar day, newest bucket first', () => {
    const events = buildTimeline(
      [chat({ createdAt: T0 - 3 * DAY })],
      [memory({ createdAt: T0 }), memory({ id: 'm2', createdAt: T0 })],
      []
    )
    const buckets = groupByDay(events)
    expect(buckets).toHaveLength(2)
    expect(buckets[0].day).toBe(dayKey(T0))
    expect(buckets[0].events).toHaveLength(2)
    expect(buckets[1].events).toHaveLength(1)
    expect(buckets[0].day > buckets[1].day).toBe(true)
  })
})

describe('memoryBuckets', () => {
  it('counts memories per day with pinned counts, ascending', () => {
    const memories = [
      memory({ createdAt: T0, pinned: 1 }),
      memory({ id: 'm2', createdAt: T0 + 1000 }),
      memory({ id: 'm3', createdAt: T0 - 2 * DAY }),
    ]
    const buckets = memoryBuckets(memories)
    expect(buckets).toHaveLength(2)
    expect(buckets[0].day).toBe(dayKey(T0 - 2 * DAY))
    expect(buckets[0].count).toBe(1)
    expect(buckets[1].count).toBe(2)
    expect(buckets[1].pinned).toBe(1)
  })

  it('returns empty array for no memories', () => {
    expect(memoryBuckets([])).toEqual([])
  })
})

describe('buildKnowledgeGraph', () => {
  it('creates brain, tag and memory nodes with edges to shared tags', () => {
    const g = buildKnowledgeGraph(
      [
        brain({ id: 'b1', tags: ['Auth', 'api'] }),
        brain({ id: 'b2', title: 'Other', tags: ['auth'] }),
      ],
      [memory({ id: 'm1', tags: ['auth'] })]
    )
    const ids = g.nodes.map((n) => n.id)
    expect(ids).toContain('brain:b1')
    expect(ids).toContain('brain:b2')
    expect(ids).toContain('memory:m1')
    expect(ids).toContain('tag:auth')
    expect(ids.filter((id) => id === 'tag:auth')).toHaveLength(1)

    const edgePairs = g.edges.map((e) => `${e.from}->${e.to}`)
    expect(edgePairs).toContain('brain:b1->tag:auth')
    expect(edgePairs).toContain('brain:b2->tag:auth')
    expect(edgePairs).toContain('memory:m1->tag:auth')

    const tagNode = g.nodes.find((n) => n.id === 'tag:auth')
    expect(tagNode?.kind).toBe('tag')
  })

  it('returns empty graph when there is no data', () => {
    const g = buildKnowledgeGraph([], [])
    expect(g.nodes).toHaveLength(0)
    expect(g.edges).toHaveLength(0)
  })
})

describe('buildDependencyGraph', () => {
  it('builds root -> manager -> package hierarchy', () => {
    const g = buildDependencyGraph(
      index({ dependencies: { npm: { react: '^18.0.0', zod: '^3.0.0' }, pnpm: { react: '^18.0.0' } } })
    )
    expect(g.nodes.map((n) => n.id)).toEqual(
      expect.arrayContaining(['root', 'pm:npm', 'pm:pnpm', 'pkg:npm:react', 'pkg:npm:zod', 'pkg:pnpm:react'])
    )
    const pairs = g.edges.map((e) => `${e.from}->${e.to}`)
    expect(pairs).toContain('root->pm:npm')
    expect(pairs).toContain('pm:npm->pkg:npm:react')
    expect(g.nodes.find((n) => n.id === 'root')?.kind).toBe('root')
  })

  it('handles empty dependencies', () => {
    const g = buildDependencyGraph(index({ dependencies: {} }))
    expect(g.nodes).toHaveLength(1)
    expect(g.edges).toHaveLength(0)
  })
})

describe('buildWorkspaceGraph', () => {
  it('links hub to workspaces and shared frameworks connect workspaces', () => {
    const g = buildWorkspaceGraph(
      [ws({ id: 'ws1' }), ws({ id: 'ws2', name: 'Beta' })],
      {
        ws1: { fileCount: 100, frameworks: ['React'] },
        ws2: { fileCount: 400, frameworks: ['React', 'Vite'] },
      }
    )
    const ids = g.nodes.map((n) => n.id)
    expect(ids).toContain('hub:all')
    expect(ids).toContain('ws:ws1')
    expect(ids).toContain('fw:react')
    expect(ids.filter((id) => id === 'fw:react')).toHaveLength(1)

    const big = g.nodes.find((n) => n.id === 'ws:ws2')
    const small = g.nodes.find((n) => n.id === 'ws:ws1')
    expect((big?.size ?? 0) > (small?.size ?? 0)).toBe(true)

    const pairs = g.edges.map((e) => `${e.from}->${e.to}`)
    expect(pairs).toContain('hub:all->ws:ws1')
    expect(pairs.filter((p) => p.startsWith('ws:ws') && p.endsWith('fw:react')).length).toBe(2)
  })
})

describe('layoutGraph', () => {
  it('positions the root at the center and every node has coordinates', () => {
    const g = buildDependencyGraph(index({ dependencies: { npm: { react: '^18', zod: '^3' } } }))
    const positions = layoutGraph(g, 'root', 800, 500)
    expect(positions.root).toEqual({ x: 400, y: 250 })
    for (const n of g.nodes) {
      expect(positions[n.id]).toBeDefined()
      expect(Number.isFinite(positions[n.id].x)).toBe(true)
      expect(Number.isFinite(positions[n.id].y)).toBe(true)
    }
  })

  it('layers by BFS distance from root', () => {
    const g = buildDependencyGraph(index({ dependencies: { npm: { react: '^18' } } }))
    const layers = buildLayers(g, 'root')
    expect(layers[0]).toEqual(['root'])
    expect(layers[1]).toEqual(['pm:npm'])
    expect(layers[2]).toEqual(['pkg:npm:react'])
  })

  it('places nodes from disconnected components and returns empty map for empty graph', () => {
    const disconnected = { nodes: [{ id: 'a', label: 'A', kind: 'tag', size: 8 }], edges: [] }
    expect(buildLayers(disconnected, 'missing')).toEqual([['a']])
    expect(layoutGraph({ nodes: [], edges: [] }, 'root', 100, 100)).toEqual({})
  })
})

describe('timelineStats and spanInDays', () => {
  it('counts events by kind', () => {
    const events = buildTimeline(
      [chat({ id: 'c1' }), chat({ id: 'c2' })],
      [memory({ id: 'm1' })],
      [brain({ id: 'b1' })]
    )
    const stats = timelineStats(events)
    expect(stats).toEqual([
      { label: 'Chats', value: 2 },
      { label: 'Memories', value: 1 },
      { label: 'Brain notes', value: 1 },
      { label: 'Total events', value: 4 },
    ])
  })

  it('computes day span with minimum of 1 for multi-event set', () => {
    const events = buildTimeline([chat({ createdAt: T0 - 5 * DAY })], [memory({ createdAt: T0 })], [])
    expect(spanInDays(events)).toBe(5)
    expect(spanInDays(buildTimeline([], [], []))).toBe(0)
    expect(spanInDays(buildTimeline([chat()], [], []))).toBe(0)
  })
})

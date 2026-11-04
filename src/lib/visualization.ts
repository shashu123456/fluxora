import type { Chat, MemoryEntry, ProjectBrainEntry, Workspace, WorkspaceIndex } from '@/types'

export type TimelineKind = 'chat' | 'memory' | 'brain'

export interface TimelineEvent {
  id: string
  kind: TimelineKind
  title: string
  timestamp: number
}

export interface DayBucket {
  day: string
  events: TimelineEvent[]
}

export interface GraphNode {
  id: string
  label: string
  kind: string
  size: number
}

export interface GraphEdge {
  from: string
  to: string
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface Point {
  x: number
  y: number
}

const DAY_MS = 24 * 60 * 60 * 1000

export function dayKey(ts: number): string {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function buildTimeline(
  chats: Chat[],
  memories: MemoryEntry[],
  brain: ProjectBrainEntry[]
): TimelineEvent[] {
  const events: TimelineEvent[] = []
  for (const c of chats) {
    events.push({ id: `chat:${c.id}`, kind: 'chat', title: c.title || 'Untitled chat', timestamp: c.createdAt })
  }
  for (const m of memories) {
    const text = m.content.trim().replace(/\s+/g, ' ')
    events.push({ id: `memory:${m.id}`, kind: 'memory', title: text.length > 80 ? `${text.slice(0, 80)}…` : text, timestamp: m.createdAt })
  }
  for (const b of brain) {
    events.push({ id: `brain:${b.id}`, kind: 'brain', title: b.title, timestamp: b.createdAt })
  }
  events.sort((a, b) => b.timestamp - a.timestamp)
  return events
}

export function groupByDay(events: TimelineEvent[]): DayBucket[] {
  const buckets = new Map<string, TimelineEvent[]>()
  for (const e of events) {
    const key = dayKey(e.timestamp)
    const list = buckets.get(key)
    if (list) list.push(e)
    else buckets.set(key, [e])
  }
  return Array.from(buckets.entries())
    .map(([day, list]) => ({ day, events: list }))
    .sort((a, b) => (a.day < b.day ? 1 : -1))
}

export interface MemoryDayBucket {
  day: string
  count: number
  pinned: number
}

export function memoryBuckets(memories: MemoryEntry[]): MemoryDayBucket[] {
  const buckets = new Map<string, MemoryDayBucket>()
  for (const m of memories) {
    const key = dayKey(m.createdAt)
    const existing = buckets.get(key)
    if (existing) {
      existing.count += 1
      if (m.pinned) existing.pinned += 1
    } else {
      buckets.set(key, { day: key, count: 1, pinned: m.pinned ? 1 : 0 })
    }
  }
  return Array.from(buckets.values()).sort((a, b) => (a.day < b.day ? -1 : 1))
}

function tagKey(tag: string): string {
  return tag.trim().toLowerCase()
}

export function buildKnowledgeGraph(
  brain: ProjectBrainEntry[],
  memories: MemoryEntry[]
): Graph {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const seen = new Set<string>()

  const addNode = (n: GraphNode) => {
    if (seen.has(n.id)) return
    seen.add(n.id)
    nodes.push(n)
  }

  const tagOwners = new Map<string, string[]>()

  for (const b of brain) {
    addNode({ id: `brain:${b.id}`, label: b.title, kind: b.kind, size: 14 })
    for (const raw of b.tags ?? []) {
      const tag = tagKey(raw)
      if (!tag) continue
      const tagId = `tag:${tag}`
      addNode({ id: tagId, label: raw.trim(), kind: 'tag', size: 9 })
      edges.push({ from: `brain:${b.id}`, to: tagId })
      const owners = tagOwners.get(tag)
      if (owners) owners.push(`brain:${b.id}`)
      else tagOwners.set(tag, [`brain:${b.id}`])
    }
  }

  for (const m of memories) {
    addNode({ id: `memory:${m.id}`, label: m.content.slice(0, 40), kind: 'memory', size: 11 })
    for (const raw of m.tags ?? []) {
      const tag = tagKey(raw)
      if (!tag) continue
      const tagId = `tag:${tag}`
      addNode({ id: tagId, label: raw.trim(), kind: 'tag', size: 9 })
      edges.push({ from: `memory:${m.id}`, to: tagId })
      const owners = tagOwners.get(tag)
      if (owners) owners.push(`memory:${m.id}`)
      else tagOwners.set(tag, [`memory:${m.id}`])
    }
  }

  for (const owners of tagOwners.values()) {
    for (let i = 1; i < owners.length; i++) {
      edges.push({ from: owners[0], to: owners[i] })
    }
  }

  return { nodes, edges }
}

export function buildDependencyGraph(index: WorkspaceIndex): Graph {
  const nodes: GraphNode[] = [{ id: 'root', label: 'project', kind: 'root', size: 18 }]
  const edges: GraphEdge[] = []
  const managers = Object.keys(index.dependencies)
  for (const manager of managers) {
    const managerId = `pm:${manager}`
    nodes.push({ id: managerId, label: manager, kind: 'manager', size: 13 })
    edges.push({ from: 'root', to: managerId })
    const pkgs = Object.keys(index.dependencies[manager])
    for (const pkg of pkgs) {
      const pkgId = `pkg:${manager}:${pkg}`
      nodes.push({ id: pkgId, label: pkg, kind: 'dependency', size: 8 })
      edges.push({ from: managerId, to: pkgId })
    }
  }
  return { nodes, edges }
}

export interface WorkspaceActivity {
  fileCount?: number
  frameworks?: string[]
}

export function buildWorkspaceGraph(
  workspaces: Workspace[],
  activity: Record<string, WorkspaceActivity>
): Graph {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const frameworkOwners = new Map<string, string[]>()

  for (const w of workspaces) {
    const files = activity[w.id]?.fileCount ?? 0
    const size = 14 + Math.min(18, Math.round(Math.sqrt(files) / 2))
    nodes.push({ id: `ws:${w.id}`, label: w.name, kind: 'workspace', size })
    edges.push({ from: 'hub:all', to: `ws:${w.id}` })
    for (const fw of activity[w.id]?.frameworks ?? []) {
      const fwId = `fw:${fw.toLowerCase()}`
      if (!nodes.some((n) => n.id === fwId)) {
        nodes.push({ id: fwId, label: fw, kind: 'framework', size: 10 })
      }
      edges.push({ from: `ws:${w.id}`, to: fwId })
      const owners = frameworkOwners.get(fwId)
      if (owners) owners.push(`ws:${w.id}`)
      else frameworkOwners.set(fwId, [`ws:${w.id}`])
    }
  }

  nodes.unshift({ id: 'hub:all', label: 'Workspaces', kind: 'hub', size: 20 })
  for (const owners of frameworkOwners.values()) {
    for (let i = 1; i < owners.length; i++) {
      edges.push({ from: owners[0], to: owners[i] })
    }
  }
  return { nodes, edges }
}

export function buildLayers(graph: Graph, rootId: string): string[][] {
  const adjacency = new Map<string, string[]>()
  for (const n of graph.nodes) adjacency.set(n.id, [])
  for (const e of graph.edges) {
    adjacency.get(e.from)?.push(e.to)
    adjacency.get(e.to)?.push(e.from)
  }
  const hasRoot = adjacency.has(rootId)
  const visited = new Set<string>(hasRoot ? [rootId] : [])
  const layers: string[][] = []
  let frontier = hasRoot ? [rootId] : []
  while (frontier.length > 0 && layers.length < 12) {
    layers.push([...frontier])
    const next: string[] = []
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? []) {
        if (visited.has(neighbor)) continue
        visited.add(neighbor)
        next.push(neighbor)
      }
    }
    frontier = next
  }
  for (const n of graph.nodes) {
    if (!visited.has(n.id)) {
      if (layers.length === 0) layers.push([])
      layers[layers.length - 1].push(n.id)
      visited.add(n.id)
    }
  }
  return layers
}

export function layoutGraph(
  graph: Graph,
  rootId: string,
  width: number,
  height: number
): Record<string, Point> {
  const layers = buildLayers(graph, rootId)
  const positions: Record<string, Point> = {}
  if (layers.length === 0) return positions

  const cx = width / 2
  const cy = height / 2
  const maxLayer = Math.max(layers.length - 1, 1)

  layers.forEach((layer, li) => {
    if (layer.length === 0) return
    if (li === 0 && layer.length === 1) {
      positions[layer[0]] = { x: cx, y: cy }
      return
    }
    const radius = (Math.min(width, height) / 2) * (0.28 + (0.62 * li) / maxLayer)
    layer.forEach((id, i) => {
      const angle = (2 * Math.PI * i) / layer.length - Math.PI / 2
      positions[id] = {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      }
    })
  })

  return positions
}

export interface ActivityStat {
  label: string
  value: number
}

export function timelineStats(events: TimelineEvent[]): ActivityStat[] {
  const counts: Record<TimelineKind, number> = { chat: 0, memory: 0, brain: 0 }
  for (const e of events) counts[e.kind] += 1
  return [
    { label: 'Chats', value: counts.chat },
    { label: 'Memories', value: counts.memory },
    { label: 'Brain notes', value: counts.brain },
    { label: 'Total events', value: events.length },
  ]
}

export function spanInDays(events: TimelineEvent[]): number {
  if (events.length < 2) return 0
  const newest = events[0].timestamp
  const oldest = events[events.length - 1].timestamp
  return Math.max(1, Math.ceil((newest - oldest) / DAY_MS))
}

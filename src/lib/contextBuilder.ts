import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { WorkspaceIndex } from '@/types'

export interface SmartContextOptions {
  prompt: string
  workspaceId: string
  memoryEnabled: boolean
  maxChars?: number
}

export interface SmartContext {
  system: string | null
  memoryCount: number
  promptCount: number
  brainCount: number
}

const CONTENT_CAP = 12000
const MEMORY_ITEM_CAP = 240
const PROMPT_ITEM_CAP = 220
const BRAIN_ITEM_CAP = 280
const README_CAP = 320

function relTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function shortPath(p: string): string {
  const idx = p.lastIndexOf('\\')
  return idx >= 0 ? p.slice(idx + 1) : p
}

export async function buildSmartContext(opts: SmartContextOptions): Promise<SmartContext> {
  const maxChars = opts.maxChars || CONTENT_CAP
  const sections: string[] = []
  let memoryCount = 0
  let promptCount = 0
  let brainCount = 0
  let budget = maxChars

  const pushSection = (label: string, body: string) => {
    const section = `[${label}]\n${body}`
    if (section.length > budget) return
    sections.push(section)
    budget -= section.length + 2
  }

  // 1. Relevant memory (global + workspace), pinned first
  if (opts.memoryEnabled) {
    try {
      const globalHits: any[] = await window.api.memory.search('global', opts.prompt)
      const wsHits: any[] =
        opts.workspaceId && opts.workspaceId !== 'global'
          ? await window.api.memory.search(opts.workspaceId, opts.prompt)
          : []
      const seen = new Set<string>()
      const merged: any[] = []
      for (const m of [...globalHits, ...wsHits]) {
        if (!m || !m.content || seen.has(m.id)) continue
        seen.add(m.id)
        merged.push(m)
      }
      merged.sort((a, b) => (b.pinned || 0) - (a.pinned || 0))
      const top = merged.slice(0, 6)
      if (top.length > 0) {
        memoryCount = top.length
        pushSection(
          'Relevant memory',
          top.map((m) => (m.content || '').slice(0, MEMORY_ITEM_CAP)).join('\n- ')
        )
      }
    } catch { /* memory unavailable */ }
  }

  // 2. Workspace / project intelligence
  if (opts.workspaceId && opts.workspaceId !== 'global') {
    const wsStore = useWorkspaceStore.getState()
    try {
      let index: WorkspaceIndex | null | undefined = wsStore.indexes[opts.workspaceId]
      if (!index) index = await wsStore.getIndex(opts.workspaceId)
      if (index) {
        const lines: string[] = []
        if (index.languages?.length) {
          const langs = index.languages.slice(0, 6).map((l) => `${l.lang} (${l.count})`).join(', ')
          lines.push(`Languages: ${langs}`)
        }
        if (index.packageManagers?.length) {
          const depCount = Object.entries(index.dependencies || {}).reduce((n, [k, v]) => n + Object.keys(v).length, 0)
          lines.push(`Package managers: ${index.packageManagers.join(', ')}${depCount ? ` · ${depCount} dependencies` : ''}`)
        }
        if (index.git?.isRepo) {
          const gitBits: string[] = []
          if (index.git.branch) gitBits.push(index.git.branch)
          gitBits.push(index.git.hasChanges ? 'uncommitted changes present' : 'clean working tree')
          if (index.git.lastCommit) gitBits.push(`last: ${index.git.lastCommit}`)
          lines.push(`Git: ${gitBits.join(' · ')}`)
        }
        if (index.topStructure?.length) {
          lines.push(`Top-level structure: ${index.topStructure.slice(0, 8).join(' · ')}`)
        }
        pushSection('Project context', lines.join('\n'))

        if (index.readmeSnippet) {
          pushSection('README', index.readmeSnippet.slice(0, README_CAP))
        }

        if (index.recentFiles?.length) {
          const recent = index.recentFiles.slice(0, 5).map((f) => `- ${shortPath(f.path)} (${relTime(f.modifiedAt)})`).join('\n')
          pushSection('Recent changes', recent)
        }
      }
    } catch { /* project context unavailable */ }
  }

  // 3. Pinned prompts as recurring instructions
  try {
    const workspaceId = opts.workspaceId === 'global' ? 'global' : opts.workspaceId
    const prompts: any[] = await window.api.prompts.list(workspaceId)
    const pinned = (prompts || []).filter((p) => p?.pinned).slice(0, 3)
    if (pinned.length > 0) {
      promptCount = pinned.length
      pushSection(
        'Pinned instructions',
        pinned.map((p) => `${p.name}: ${(p.content || '').slice(0, PROMPT_ITEM_CAP)}`).join('\n')
      )
    }
  } catch { /* prompts unavailable */ }

  // 4. Pinned project brain entries (decisions, architecture, conventions)
  if (opts.workspaceId && opts.workspaceId !== 'global') {
    try {
      const entries: any[] = await window.api.brain.list(opts.workspaceId)
      const pinned = (entries || []).filter((e) => e?.pinned && e?.content).slice(0, 4)
      if (pinned.length > 0) {
        brainCount = pinned.length
        pushSection(
          'Project brain',
          pinned
            .map((e) => {
              const kind = e.kind || 'note'
              const tags = e.tags?.length ? ` [${e.tags.join(', ')}]` : ''
              return `[${kind}]${tags} ${e.title}: ${(e.content || '').slice(0, BRAIN_ITEM_CAP)}`
            })
            .join('\n')
        )
      }
    } catch { /* brain unavailable */ }
  }

  if (sections.length === 0) {
    return { system: null, memoryCount: 0, promptCount: 0, brainCount: 0 }
  }

  const system = `Below is context about the user and their project. Use it to answer accurately when relevant, but do not mention it explicitly.\n\n${sections.join('\n\n')}`
  return { system, memoryCount, promptCount, brainCount }
}
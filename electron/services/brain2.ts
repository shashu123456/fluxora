import { all, get, run } from '../database'
import type { ProjectBrainKind, WorkspaceIndex } from '../../src/types'

export interface BrainSection {
  key: string
  title: string
  content: string
  kind: ProjectBrainKind
  tags: string[]
  status?: string | null
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function ago(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function mdList(items: string[]): string {
  return items.map((i) => `- ${i}`).join('\n')
}

/**
 * Renders the dependency map (`{ manager: { package: version } }`) as a
 * compact, deterministic list.
 */
function renderDependencies(dependencies: Record<string, Record<string, string>>): string[] {
  const lines: string[] = []
  for (const manager of Object.keys(dependencies).sort()) {
    const packages = dependencies[manager] || {}
    const names = Object.keys(packages).sort()
    if (names.length === 0) continue
    const shown = names.slice(0, 15).map((name) => {
      const version = packages[name]
      return version ? `${name}@${version}` : name
    })
    lines.push(`${manager}: ${shown.join(', ')}${names.length > 15 ? ` (+${names.length - 15} more)` : ''}`)
  }
  return lines
}

export async function syncBrain2(workspaceId: string): Promise<{ sections: number; entries: number }> {
  let index: WorkspaceIndex | null = null
  try {
    const row = await get<{ data: string }>('SELECT data FROM workspace_index WHERE workspace_id = ?', [workspaceId])
    index = row ? (JSON.parse(row.data) as WorkspaceIndex) : null
  } catch { index = null }

  let chatCount = 0
  let recentChats: any[] = []
  try {
    const cnt = await get<{ c: number }>('SELECT COUNT(*) as c FROM chats WHERE workspace_id = ?', [workspaceId])
    chatCount = cnt?.c || 0
    recentChats = await all<any>(
      'SELECT title, updated_at FROM chats WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 10',
      [workspaceId]
    )
  } catch { /* no chats */ }

  let memByType: Record<string, number> = {}
  try {
    const rows = await all<{ type: string; c: number }>(
      'SELECT type, COUNT(*) as c FROM memories WHERE workspace_id = ? GROUP BY type',
      [workspaceId]
    )
    for (const r of rows) memByType[r.type] = r.c
  } catch { /* no memories */ }

  let todosDone: any[] = []
  let todosActive: any[] = []
  try {
    const rows = await all<any>(
      "SELECT title, status, updated_at FROM project_brain WHERE workspace_id = ? AND kind = 'todo' ORDER BY updated_at DESC",
      [workspaceId]
    )
    for (const t of rows) {
      if ((t.status || '').toLowerCase() === 'done') todosDone.push(t)
      else todosActive.push(t)
    }
  } catch { /* no todos */ }

  let issues: any[] = []
  try {
    issues = await all<any>(
      'SELECT command, exit_code, created_at FROM terminal_history WHERE workspace_id = ? AND exit_code != 0 ORDER BY created_at DESC LIMIT 5',
      [workspaceId]
    )
  } catch { /* no terminal */ }

  let usageSummary: any = null
  try {
    usageSummary = await get<any>(
      'SELECT COUNT(*) as calls, COALESCE(SUM(total_tokens),0) as tokens, COALESCE(SUM(cost),0) as cost FROM usage WHERE workspace_id = ?',
      [workspaceId]
    )
  } catch { /* no usage */ }

  let decisions: any[] = []
  try {
    decisions = await all<any>(
      "SELECT title, updated_at FROM project_brain WHERE workspace_id = ? AND kind = 'decision' AND source != 'auto' ORDER BY updated_at DESC LIMIT 8",
      [workspaceId]
    )
  } catch { /* none */ }

  let conventions: any[] = []
  try {
    conventions = await all<any>(
      "SELECT title, updated_at FROM project_brain WHERE workspace_id = ? AND kind = 'convention' AND source != 'auto' ORDER BY updated_at DESC LIMIT 8",
      [workspaceId]
    )
  } catch { /* none */ }

  const sections: BrainSection[] = []

  if (index) {
    const frameworks = index.frameworks || []
    const configs = (index.configFiles || []).map((c) => c.name)
    const languages = index.languages || []

    // 1. Architecture
    const archLines: string[] = []
    if (frameworks.length) archLines.push(`Frameworks: ${frameworks.join(', ')}`)
    if (configs.length) archLines.push(`Config surface: ${configs.slice(0, 12).join(', ')}`)
    if (index.fileCount) {
      archLines.push(
        `Scale: ${index.fileCount} files across ${index.dirCount} directories (${fmtBytes(index.totalSize || 0)})`
      )
    }
    if (index.topStructure?.length) {
      archLines.push(`Top-level structure: ${index.topStructure.slice(0, 10).join(', ')}`)
    }
    if (archLines.length) {
      sections.push({
        key: 'architecture',
        title: 'Architecture overview',
        content: mdList(archLines),
        kind: 'architecture',
        tags: ['auto', 'architecture'],
      })
    }

    // 2. Stack
    const stackLines: string[] = []
    if (index.packageManagers?.length) {
      stackLines.push(`Package managers: ${index.packageManagers.join(', ')}`)
    }
    if (languages.length) {
      const top = [...languages].sort((a, b) => b.count - a.count).slice(0, 6)
      stackLines.push(`Languages: ${top.map((l) => `${l.lang} (${l.count})`).join(', ')}`)
    }
    if (index.entryPoints?.length) {
      stackLines.push(`Entry points: ${index.entryPoints.slice(0, 6).join(', ')}`)
    }
    if (index.testDirs?.length) {
      stackLines.push(`Test locations: ${index.testDirs.join(', ')}`)
    }
    if (stackLines.length) {
      sections.push({
        key: 'stack',
        title: 'Tech stack',
        content: mdList(stackLines),
        kind: 'architecture',
        tags: ['auto', 'stack'],
      })
    }

    // 3. Dependencies
    const depLines = renderDependencies(index.dependencies || {})
    if (depLines.length) {
      sections.push({
        key: 'dependencies',
        title: 'Key dependencies',
        content: mdList(depLines),
        kind: 'architecture',
        tags: ['auto', 'dependencies'],
      })
    }

    // 4. Important files
    const files = index.recentFiles || []
    if (files.length) {
      sections.push({
        key: 'files',
        title: 'Recently modified files',
        content: mdList(
          files.slice(0, 12).map((f) => `${f.path} — ${ago(f.modifiedAt || Date.now())}`)
        ),
        kind: 'note',
        tags: ['auto', 'files'],
      })
    }

    // 5. Relationships
    const pm = index.packageManagers || []
    const relLines: string[] = []
    if (frameworks.includes('React') && frameworks.includes('Electron')) {
      relLines.push('React renders inside the Electron renderer process')
    }
    if (frameworks.includes('Vite')) relLines.push('Vite drives both renderer HMR and production bundling')
    if (frameworks.includes('Tailwind CSS')) {
      relLines.push('Tailwind styles the React layer; shadcn/ui components sit on top')
    }
    if (pm.includes('npm') || pm.includes('pnpm') || pm.includes('yarn')) {
      relLines.push('The Node package manager feeds both the frontend and the Electron main process')
    }
    if (index.git?.isRepo) relLines.push('Git tracks the workspace; recent commit history is captured below')
    if (relLines.length) {
      sections.push({
        key: 'relationships',
        title: 'Component relationships',
        content: mdList(relLines),
        kind: 'architecture',
        tags: ['auto', 'relationships'],
      })
    }

    // 6. Project health
    if (index.health) {
      const healthLines = [
        `Health score: ${index.health.score}%`,
        ...index.health.signals.map((s) => `${s.ok ? '✓' : '✗'} ${s.label}`),
      ]
      sections.push({
        key: 'health',
        title: 'Project health',
        content: mdList(healthLines),
        kind: 'note',
        tags: ['auto', 'health'],
      })
    }

    // 7. Documentation surface
    if (index.docs?.length || index.readmeSnippet) {
      const docLines: string[] = []
      if (index.docs?.length) docLines.push(`Documentation files: ${index.docs.slice(0, 12).join(', ')}`)
      if (index.readmeSnippet) {
        docLines.push(`README excerpt: ${index.readmeSnippet.slice(0, 400).replace(/\n+/g, ' ')}`)
      }
      sections.push({
        key: 'documentation',
        title: 'Documentation surface',
        content: mdList(docLines),
        kind: 'note',
        tags: ['auto', 'documentation'],
      })
    }
  }

  // 8. Goals / sprint (active todos)
  if (todosActive.length) {
    sections.push({
      key: 'goals',
      title: 'Active goals / sprint',
      content: mdList(todosActive.slice(0, 12).map((t) => `${t.title}${t.status ? ` [${t.status}]` : ''}`)),
      kind: 'todo',
      tags: ['auto', 'goals'],
      status: 'in-progress',
    })
  }

  // 9. Completed work
  if (todosDone.length) {
    sections.push({
      key: 'completed',
      title: 'Completed work',
      content: mdList(todosDone.slice(0, 15).map((t) => `${t.title} — done ${ago(t.updated_at)}`)),
      kind: 'todo',
      tags: ['auto', 'completed'],
      status: 'done',
    })
  }

  // 10. Upcoming
  if (todosActive.length > 3) {
    sections.push({
      key: 'upcoming',
      title: 'Upcoming work',
      content: 'Derived from active todos. Complete or re-scope entries to update this section.',
      kind: 'todo',
      tags: ['auto', 'upcoming'],
      status: 'planned',
    })
  }

  // 11. Issues
  if (issues.length) {
    sections.push({
      key: 'issues',
      title: 'Recent issues',
      content: mdList(issues.map((i) => `\`${i.command}\` exited ${i.exit_code} — ${ago(i.created_at)}`)),
      kind: 'note',
      tags: ['auto', 'issues'],
    })
  }

  // 12. Activity
  const activityLines: string[] = []
  if (chatCount) activityLines.push(`${chatCount} chats in this workspace`)
  for (const c of recentChats.slice(0, 5)) {
    activityLines.push(`Chat: ${c.title || 'Untitled'} — ${ago(c.updated_at)}`)
  }
  const memTotal = Object.values(memByType).reduce((a, b) => a + b, 0)
  if (memTotal) {
    activityLines.push(
      `${memTotal} memories (${Object.entries(memByType).map(([t, c]) => `${c} ${t}`).join(', ')})`
    )
  }
  if (usageSummary?.calls) {
    activityLines.push(
      `${usageSummary.calls} AI calls · ${usageSummary.tokens} tokens · $${(usageSummary.cost || 0).toFixed(2)} spent`
    )
  }
  if (activityLines.length) {
    sections.push({
      key: 'activity',
      title: 'Project activity',
      content: mdList(activityLines),
      kind: 'note',
      tags: ['auto', 'activity'],
    })
  }

  // 13. Decisions
  if (decisions.length) {
    sections.push({
      key: 'decisions',
      title: 'Recent decisions',
      content: mdList(decisions.map((d) => `${d.title} — ${ago(d.updated_at)}`)),
      kind: 'decision',
      tags: ['auto', 'decisions'],
    })
  }

  // 14. Conventions
  if (conventions.length) {
    sections.push({
      key: 'conventions',
      title: 'Team conventions',
      content: mdList(conventions.map((c) => `${c.title} — ${ago(c.updated_at)}`)),
      kind: 'convention',
      tags: ['auto', 'conventions'],
    })
  }

  // 15. Learning (memory footprint)
  if (memTotal) {
    sections.push({
      key: 'learning',
      title: 'What the AI has learned',
      content: mdList(Object.entries(memByType).map(([t, c]) => `${c} ${t} memories captured`)),
      kind: 'note',
      tags: ['auto', 'learning'],
    })
  }

  const now = Date.now()
  const writtenKeys = new Set<string>()
  for (const s of sections) {
    const id = `auto:${workspaceId}:${s.key}`
    writtenKeys.add(s.key)
    const existing = await get<{ id: string }>('SELECT id FROM project_brain WHERE id = ?', [id])
    if (existing) {
      await run(
        'UPDATE project_brain SET title = ?, content = ?, kind = ?, tags = ?, status = ?, updated_at = ? WHERE id = ?',
        [s.title, s.content, s.kind, JSON.stringify(s.tags), s.status || null, now, id]
      )
    } else {
      await run(
        'INSERT INTO project_brain (id, workspace_id, title, content, kind, status, tags, pinned, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)',
        [id, workspaceId, s.title, s.content, s.kind, s.status || null, JSON.stringify(s.tags), 'auto', now, now]
      )
    }
  }

  // Drop auto sections that no longer apply so the brain never keeps stale
  // snapshots of a workspace that has since changed.
  try {
    const stale = await all<{ id: string }>(
      "SELECT id FROM project_brain WHERE workspace_id = ? AND source = 'auto' AND id LIKE ?",
      [workspaceId, `auto:${workspaceId}:%`]
    )
    for (const row of stale) {
      const key = row.id.slice(`auto:${workspaceId}:`.length)
      if (!writtenKeys.has(key)) {
        await run('DELETE FROM project_brain WHERE id = ?', [row.id])
      }
    }
  } catch { /* stale cleanup is best-effort */ }

  let total = writtenKeys.size
  try {
    const row = await get<{ c: number }>('SELECT COUNT(*) as c FROM project_brain WHERE workspace_id = ?', [workspaceId])
    total = row?.c || writtenKeys.size
  } catch { /* count unavailable */ }
  return { sections: writtenKeys.size, entries: total }
}

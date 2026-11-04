import { ipcMain } from 'electron'
import { all } from '../database'
import type { WorkspaceIntelligence } from '../../src/types/workspaceIntelligence'
import { intelligenceBoost } from '../../src/lib/intelligence/ranking'

function wordBoundaryMatch(hay: string, needle: string): boolean {
  let index = hay.indexOf(needle)
  while (index !== -1) {
    const before = index === 0 ? '' : hay[index - 1]
    if (!before || /[\s\-_./\\]/.test(before)) return true
    index = hay.indexOf(needle, index + 1)
  }
  return false
}

function subsequenceMatch(hay: string, needle: string): boolean {
  if (needle.length < 3 || hay.length > 120) return false
  let i = 0
  for (let j = 0; j < hay.length && i < needle.length; j++) {
    if (hay[j] === needle[i]) i++
  }
  return i === needle.length
}

function scoreMatch(hay: string, needle: string): number {
  if (!hay || !needle) return 0
  const lcHay = hay.toLowerCase()
  const lcNeedle = needle.toLowerCase()
  if (lcHay === lcNeedle) return 1
  if (lcHay.startsWith(lcNeedle)) return 0.92
  if (wordBoundaryMatch(lcHay, lcNeedle)) return 0.84
  if (lcHay.includes(lcNeedle)) return 0.64
  if (subsequenceMatch(lcHay, lcNeedle)) return 0.4
  return 0
}

/**
 * Multi-token matching: every token contributes, but partial coverage still
 * counts so "fix auth token" finds "auth token refresh fix". Coverage below
 * half is treated as noise.
 */
function scoreTokens(hay: string, tokens: string[]): number {
  if (!hay || tokens.length === 0) return 0
  const lcHay = hay.toLowerCase()
  let hits = 0
  for (const token of tokens) {
    if (lcHay.includes(token)) hits += 1
  }
  const coverage = hits / tokens.length
  if (coverage < 0.5) return 0
  return 0.32 + coverage * 0.58
}

function tokenize(query: string): string[] {
  const seen = new Set<string>()
  const tokens: string[] = []
  for (const raw of query.toLowerCase().split(/[^a-z0-9_$.-]+/)) {
    const token = raw.replace(/^[.-]+|[.-]+$/g, '')
    if (token.length < 2 || seen.has(token)) continue
    seen.add(token)
    tokens.push(token)
  }
  return tokens.slice(0, 10)
}

export function registerSearchIpc() {
  ipcMain.handle('search:global', async (_e, payload: { query: string; workspaceId?: string }) => {
    const { query, workspaceId: activeWorkspaceId } = payload
    if (!query || !query.trim()) return []
    const q = query.trim()
    const tokens = tokenize(q)
    const like = `%${tokens[0] || q}%`
    const results: any[] = []
    const seen = new Set<string>()

    // Intelligence-aware ranking: one snapshot of every workspace's
    // intelligence, then a boost per workspace derived from it.
    const intelligenceByWorkspace: Record<string, WorkspaceIntelligence> = {}
    try {
      const intelRows = await all<any>(`SELECT workspace_id, data FROM workspace_intelligence`)
      for (const row of intelRows) {
        try { intelligenceByWorkspace[row.workspace_id] = JSON.parse(row.data) } catch { /* ignore */ }
      }
    } catch { /* intelligence unavailable */ }

    const brainCounts: Record<string, number> = {}
    try {
      const brainRows = await all<any>(
        `SELECT workspace_id, COUNT(*) AS c FROM project_brain GROUP BY workspace_id`
      )
      for (const row of brainRows) brainCounts[row.workspace_id] = row.c
    } catch { /* ignore */ }

    const boostCache: Record<string, number> = {}
    const boostFor = (workspaceId?: string): number => {
      if (!workspaceId) return 0
      if (boostCache[workspaceId] !== undefined) return boostCache[workspaceId]
      const boost = intelligenceBoost({
        intelligence: intelligenceByWorkspace[workspaceId] || null,
        brainEntries: brainCounts[workspaceId] || 0,
        isActive: !!activeWorkspaceId && workspaceId === activeWorkspaceId,
        tokens,
      })
      boostCache[workspaceId] = boost
      return boost
    }

    const add = (
      group: string,
      id: string,
      title: string,
      subtitle: string | undefined,
      snippet: string | undefined,
      action: any,
      options?: { floor?: number; workspaceId?: string; pinned?: boolean }
    ) => {
      const key = `${group}:${id}`
      if (seen.has(key)) return
      let score = Math.max(
        scoreMatch(title || '', q),
        scoreTokens(title || '', tokens),
        subtitle ? Math.max(scoreMatch(subtitle, q), scoreTokens(subtitle, tokens)) * 0.8 : 0,
        snippet ? Math.max(scoreMatch(snippet.slice(0, 400), q), scoreTokens(snippet.slice(0, 400), tokens)) * 0.7 : 0
      )
      if (options?.workspaceId && activeWorkspaceId && options.workspaceId === activeWorkspaceId) score += 0.12
      if (options?.pinned) score += 0.08
      score += boostFor(options?.workspaceId)
      if (score <= 0 && !options?.floor) return
      seen.add(key)
      results.push({
        group,
        id,
        title,
        subtitle,
        snippet,
        action,
        score: Math.min(1.4, options?.floor ? Math.max(score, options.floor) : score),
      })
    }

    // Messages — the most direct answer to "where did we discuss this?"
    try {
      const messages = await all<any>(
        `SELECT m.id, m.chat_id, m.content, m.role, m.created_at, c.title AS chat_title, c.workspace_id
         FROM messages m JOIN chats c ON c.id = m.chat_id
         WHERE m.content LIKE ?
         ORDER BY m.created_at DESC LIMIT 24`,
        [like]
      )
      for (const m of messages) {
        add(
          'messages',
          m.id,
          m.chat_title || 'Untitled chat',
          m.role === 'assistant' ? 'Assistant reply' : 'Your message',
          (m.content || '').slice(0, 180),
          { kind: 'openChat', chatId: m.chat_id, workspaceId: m.workspace_id },
          { workspaceId: m.workspace_id }
        )
      }
    } catch { /* ignore */ }

    // Chats — title hits plus chats with a matching message, without concatenating whole histories.
    try {
      const chats = await all<any>(
        `SELECT c.*,
           (SELECT content FROM messages WHERE chat_id = c.id AND content LIKE ? ORDER BY created_at DESC LIMIT 1) AS hit
         FROM chats c
         WHERE c.title LIKE ?
            OR EXISTS (SELECT 1 FROM messages WHERE chat_id = c.id AND content LIKE ?)
         ORDER BY c.updated_at DESC LIMIT 20`,
        [like, like, like]
      )
      for (const c of chats) {
        add(
          'chats',
          c.id,
          c.title || 'Untitled',
          c.pinned ? 'Pinned conversation' : undefined,
          c.hit ? c.hit.slice(0, 150) : undefined,
          { kind: 'openChat', chatId: c.id, workspaceId: c.workspace_id },
          { workspaceId: c.workspace_id, pinned: !!c.pinned }
        )
      }
    } catch { /* ignore */ }

    // Prompts
    try {
      const prompts = await all<any>(
        `SELECT * FROM prompts WHERE name LIKE ? OR content LIKE ? OR category LIKE ? ORDER BY pinned DESC, updated_at DESC LIMIT 15`,
        [like, like, like]
      )
      for (const p of prompts) {
        add('prompts', p.id, p.name, p.category, (p.content || '').slice(0, 150), { kind: 'openView', tab: 'prompts' })
      }
    } catch { /* ignore */ }

    // Memories
    try {
      const mems = await all<any>(
        `SELECT * FROM memories WHERE content LIKE ? ORDER BY pinned DESC, updated_at DESC LIMIT 15`,
        [like]
      )
      for (const m of mems) {
        add(
          'memories',
          m.id,
          (m.content || '').slice(0, 90),
          [m.type, m.pinned ? 'pinned' : ''].filter(Boolean).join(' · ') || undefined,
          undefined,
          { kind: 'openView', tab: 'memory' },
          { workspaceId: m.workspace_id, pinned: !!m.pinned }
        )
      }
    } catch { /* ignore */ }

    // Providers
    try {
      const provs = await all<any>(
        `SELECT * FROM providers WHERE name LIKE ? OR base_url LIKE ? ORDER BY name ASC LIMIT 10`,
        [like, like]
      )
      for (const p of provs) {
        add('providers', p.id, p.name, p.base_url, undefined, { kind: 'openView', tab: 'settings' })
      }
    } catch { /* ignore */ }

    // Models
    try {
      const provs = await all<any>(`SELECT id, name, models FROM providers WHERE enabled = 1`)
      for (const p of provs) {
        const models = JSON.parse(p.models || '[]')
        for (const m of models) {
          const name: string = m.name || m.id || ''
          add(
            'models',
            `${p.id}:${m.id}`,
            name,
            `${p.name} · ${m.id}`,
            undefined,
            { kind: 'pickModel', providerId: p.id, modelId: m.id }
          )
        }
      }
    } catch { /* ignore */ }

    // Workspaces
    try {
      const wss = await all<any>(
        `SELECT * FROM workspaces WHERE name LIKE ? OR path LIKE ? ORDER BY last_opened_at DESC LIMIT 10`,
        [like, like]
      )
      for (const ws of wss) {
        add(
          'workspaces',
          ws.id,
          ws.name,
          ws.path,
          undefined,
          { kind: 'openWorkspace', workspaceId: ws.id },
          { workspaceId: ws.id, pinned: ws.id === activeWorkspaceId }
        )
      }
    } catch { /* ignore */ }

    // Settings
    try {
      const settingsRows = await all<any>(`SELECT * FROM settings`)
      for (const s of settingsRows) {
        add('settings', s.key, s.key.replace(/_/g, ' '), s.value?.slice(0, 60), undefined, { kind: 'openView', tab: 'settings' })
      }
    } catch { /* ignore */ }

    // Terminal history
    try {
      const terms = await all<any>(
        `SELECT * FROM terminal_history WHERE command LIKE ? OR output LIKE ? ORDER BY created_at DESC LIMIT 20`,
        [like, like]
      )
      for (const t of terms) {
        add(
          'terminal',
          t.id,
          t.command,
          t.cwd || undefined,
          t.output ? t.output.slice(0, 150) : undefined,
          { kind: 'openWorkspace', workspaceId: t.workspace_id, panel: 'terminal-git' },
          { floor: 0.4, workspaceId: t.workspace_id }
        )
      }
    } catch { /* ignore */ }

    // Project brain
    try {
      const brain = await all<any>(
        `SELECT * FROM project_brain WHERE title LIKE ? OR content LIKE ? OR tags LIKE ?
         ORDER BY pinned DESC, updated_at DESC LIMIT 18`,
        [like, like, like]
      )
      for (const b of brain) {
        add(
          'brain',
          b.id,
          b.title,
          [b.kind, b.source === 'auto' ? 'auto' : ''].filter(Boolean).join(' · ') || undefined,
          (b.content || '').slice(0, 150),
          { kind: 'openWorkspace', workspaceId: b.workspace_id, panel: 'brain' },
          { floor: 0.4, workspaceId: b.workspace_id, pinned: !!b.pinned }
        )
      }
    } catch { /* ignore */ }

    // Notifications
    try {
      const notes = await all<any>(
        `SELECT * FROM notifications WHERE title LIKE ? OR message LIKE ? ORDER BY timestamp DESC LIMIT 10`,
        [like, like]
      )
      for (const n of notes) {
        add('notifications', n.id, n.title, n.type, n.message?.slice(0, 140), undefined, { floor: 0.3 })
      }
    } catch { /* ignore */ }

    // Workspace files (indexed structure + recent files)
    try {
      const indices = await all<any>(`SELECT workspace_id, data FROM workspace_index`)
      for (const idx of indices) {
        let data: any
        try { data = JSON.parse(idx.data) } catch { continue }
        const workspaceId = idx.workspace_id
        const recentFiles: { path: string; modifiedAt: number }[] = data.recentFiles || []
        for (const f of recentFiles) {
          const name = f.path.split(/[\\/]/).pop() || f.path
          add(
            'files',
            `${workspaceId}:${f.path}`,
            name,
            f.path,
            undefined,
            { kind: 'openWorkspace', workspaceId, panel: 'explorer', filePath: f.path },
            { floor: 0.35, workspaceId }
          )
        }
        const structure: string[] = data.topStructure || []
        for (const s of structure) {
          const name = s.replace(/^[^\w.]+/, '')
          add(
            'files',
            `${workspaceId}:struct:${s}`,
            name,
            'Project structure',
            undefined,
            { kind: 'openWorkspace', workspaceId, panel: 'explorer' },
            { floor: 0.3, workspaceId }
          )
        }
      }
    } catch { /* ignore */ }

    return results.sort((a, b) => b.score - a.score).slice(0, 60)
  })
}

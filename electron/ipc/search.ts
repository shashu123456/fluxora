import { ipcMain } from 'electron'
import { all } from '../database'

function scoreMatch(hay: string, needle: string): number {
  const lcHay = hay.toLowerCase()
  const lcNeedle = needle.toLowerCase()
  if (lcHay === lcNeedle) return 1.0
  if (lcHay.startsWith(lcNeedle)) return 0.9
  if (lcHay.includes(lcNeedle)) return 0.6
  return 0.0
}

export function registerSearchIpc() {
  ipcMain.handle('search:global', async (_e, payload: { query: string }) => {
    const { query } = payload
    if (!query || !query.trim()) return []
    const q = query.trim()
    const like = `%${q}%`
    const results: any[] = []

    const add = (group: string, id: string, title: string, subtitle?: string, snippet?: string, action?: any, scoreOverride?: number) => {
      let score = scoreMatch(title, q)
      if (snippet) score = Math.max(score, scoreMatch(snippet, q) * 0.9)
      if (subtitle) score = Math.max(score, scoreMatch(subtitle, q) * 0.8)
      if (score > 0 || scoreOverride) {
        results.push({ group, id, title, subtitle, snippet, action, score: scoreOverride || score })
      }
    }

    // Chats
    try {
      const chats = await all<any>(
        `SELECT c.*, GROUP_CONCAT(m.content, ' ') AS combinedContent
         FROM chats c LEFT JOIN messages m ON m.chat_id = c.id
         WHERE c.title LIKE ? OR m.content LIKE ?
         GROUP BY c.id ORDER BY c.updated_at DESC LIMIT 25`,
        [like, like]
      )
      for (const c of chats) {
        const snippet = c.combinedContent
          ? c.combinedContent.slice(0, 140)
          : undefined
        add('chats', c.id, c.title || 'Untitled', undefined, snippet, { kind: 'openChat', chatId: c.id })
      }
    } catch { /* ignore */ }

    // Prompts
    try {
      const prompts = await all<any>(
        `SELECT * FROM prompts WHERE name LIKE ? OR content LIKE ? ORDER BY updated_at DESC LIMIT 15`,
        [like, like]
      )
      for (const p of prompts) {
        add('prompts', p.id, p.name, p.category, p.content.slice(0, 140), { kind: 'openView', tab: 'prompts' })
      }
    } catch { /* ignore */ }

    // Memories
    try {
      const mems = await all<any>(
        `SELECT * FROM memories WHERE content LIKE ? ORDER BY updated_at DESC LIMIT 15`,
        [like]
      )
      for (const m of mems) {
        add('memories', m.id, m.content.slice(0, 80), m.type, undefined, { kind: 'openView', tab: 'memory' })
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
          if (name.toLowerCase().includes(q.toLowerCase()) || (m.id && m.id.toLowerCase().includes(q.toLowerCase()))) {
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
      }
    } catch { /* ignore */ }

    // Workspaces
    try {
      const wss = await all<any>(
        `SELECT * FROM workspaces WHERE name LIKE ? OR path LIKE ? ORDER BY last_opened_at DESC LIMIT 10`,
        [like, like]
      )
      for (const ws of wss) {
        add('workspaces', ws.id, ws.name, ws.path, undefined, { kind: 'openWorkspace', workspaceId: ws.id })
      }
    } catch { /* ignore */ }

    // Settings
    try {
      const settingsRows = await all<any>(`SELECT * FROM settings`)
      for (const s of settingsRows) {
        if (s.key.toLowerCase().includes(q.toLowerCase())) {
          add('settings', s.key, s.key.replace(/_/g, ' '), s.value?.slice(0, 60), undefined, { kind: 'openView', tab: 'settings' })
        }
      }
    } catch { /* ignore */ }

    // Terminal history
    try {
      const terms = await all<any>(
        `SELECT * FROM terminal_history WHERE command LIKE ? OR output LIKE ? ORDER BY created_at DESC LIMIT 20`,
        [like, like]
      )
      for (const t of terms) {
        const snippet = t.output ? t.output.slice(0, 140) : undefined
        add(
          'terminal',
          t.id,
          t.command,
          t.cwd || undefined,
          snippet,
          { kind: 'openView', tab: 'workspace' },
          0.7
        )
      }
    } catch { /* ignore */ }

    // Workspace files (search indexed file names)
    try {
      const indices = await all<any>(`SELECT workspace_id, data FROM workspace_index`)
      for (const idx of indices) {
        let data: any
        try { data = JSON.parse(idx.data) } catch { continue }
        const recentFiles: { path: string; modifiedAt: number }[] = data.recentFiles || []
        const workspaceId = idx.workspace_id
        for (const f of recentFiles) {
          const name = f.path.split(/[\\/]/).pop() || f.path
          const score = scoreMatch(name, q)
          if (score > 0) {
            add('files', `${workspaceId}:${f.path}`, name, f.path, undefined, { kind: 'openWorkspace', workspaceId }, score * 0.85)
          }
        }
        // Also match against top-level structure entries
        const structure: string[] = data.topStructure || []
        for (const s of structure) {
          const name = s.split(/[\\/]/).pop() || s
          if (name.toLowerCase().includes(q.toLowerCase())) {
            add('files', `${workspaceId}:struct:${s}`, name, `Project structure`, undefined, { kind: 'openWorkspace', workspaceId }, 0.6)
          }
        }
      }
    } catch { /* ignore */ }

    return results.sort((a, b) => b.score - a.score).slice(0, 60)
  })
}

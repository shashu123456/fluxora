import { ipcMain, dialog, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { all, get, run, transaction } from '../database'
import { Workspace, AttachedFile, FileEntry } from '../../src/types'
import path from 'path'
import fs from 'fs'
import { isSkippedDir, BINARY_EXTENSIONS, formatBytes } from './shared'

function mapRow(row: any): Workspace {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    settings: row.settings ? JSON.parse(row.settings) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    color: row.color,
    icon: row.icon,
    lastOpenedAt: row.last_opened_at,
  }
}

const MAX_FILE_SIZE = 5 * 1024 * 1024

async function assertInsideWorkspace(filePath: string) {
  const workspaces = await all<{ path: string | null }>('SELECT path FROM workspaces WHERE path IS NOT NULL')
  const resolved = path.resolve(filePath)
  const inside = workspaces.some((w) => {
    if (!w.path) return false
    const root = path.resolve(w.path)
    const rel = path.relative(root, resolved)
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
  })
  if (!inside) {
    throw new Error('This operation is only allowed inside a registered workspace folder.')
  }
}

export function registerWorkspaceIpc() {
  ipcMain.handle('workspace:list', async () => {
    const rows = await all<any>('SELECT * FROM workspaces ORDER BY last_opened_at DESC, created_at ASC')
    return rows.map(mapRow)
  })

  ipcMain.handle('workspace:create', async (_e, data: Partial<Workspace>) => {
    const now = Date.now()
    const ws: Workspace = {
      id: randomUUID(),
      name: data.name || 'New Workspace',
      path: data.path,
      createdAt: now,
      updatedAt: now,
      color: data.color,
      icon: data.icon,
      settings: data.settings,
    }
    await run(
      'INSERT INTO workspaces (id, name, path, color, icon, created_at, updated_at, settings) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [ws.id, ws.name, ws.path, ws.color, ws.icon, now, now, ws.settings ? JSON.stringify(ws.settings) : null]
    )
    return ws
  })

  ipcMain.handle('workspace:update', async (_e, id: string, data: Partial<Workspace>) => {
    const now = Date.now()
    const fields: string[] = []
    const values: any[] = []
    const mapping: Record<string, string> = {
      name: 'name',
      path: 'path',
      color: 'color',
      icon: 'icon',
      lastOpenedAt: 'last_opened_at',
    }
    for (const [tsKey, dbKey] of Object.entries(mapping)) {
      const v = (data as any)[tsKey]
      if (v !== undefined) {
        fields.push(dbKey)
        values.push(v)
      }
    }
    if (data.settings !== undefined) {
      fields.push('settings')
      values.push(JSON.stringify(data.settings))
    }
    if (fields.length === 0) return null
    fields.push('updated_at')
    values.push(now)
    values.push(id)
    await run(`UPDATE workspaces SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, values)
    if (data.lastOpenedAt !== undefined) {
      await run('UPDATE workspaces SET last_opened_at = ? WHERE id = ?', [now, id])
    }
    const row = await get<any>('SELECT * FROM workspaces WHERE id = ?', [id])
    return row ? mapRow(row) : null
  })

  ipcMain.handle('workspace:delete', async (_e, id: string) => {
    await transaction(async () => {
      const chats = await all<any>('SELECT id FROM chats WHERE workspace_id = ?', [id])
      for (const c of chats) {
        await run('DELETE FROM messages WHERE chat_id = ?', [c.id])
      }
      await run('DELETE FROM chats WHERE workspace_id = ?', [id])
      await run('DELETE FROM memories WHERE workspace_id = ?', [id])
      await run('DELETE FROM prompts WHERE workspace_id = ?', [id])
      await run('DELETE FROM workspaces WHERE id = ?', [id])
    })
    return true
  })

  ipcMain.handle('workspace:open-folder', async (_e) => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      title: 'Open Folder',
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths[0] || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('workspace:select-folder', async (_e) => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      title: 'Select Folder',
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle('workspace:read-file', async (_e, filePath: string) => {
    const stat = fs.statSync(filePath)
    if (stat.size > MAX_FILE_SIZE) {
      return { error: 'File too large', truncated: true, content: '' }
    }
    const ext = path.extname(filePath).toLowerCase()
    if (BINARY_EXTENSIONS.has(ext)) {
      const content = fs.readFileSync(filePath).toString('base64')
      return { content, base64: true, name: path.basename(filePath), size: stat.size }
    }
    const content = fs.readFileSync(filePath, 'utf-8')
    return { content, base64: false, name: path.basename(filePath), size: stat.size, truncated: content.length > 200000 }
  })

  ipcMain.handle('workspace:list-directory', async (_e, dirPath: string) => {
    return readLocalDirectory(dirPath)
  })

  ipcMain.handle('workspace:search-files', async (_e, rootPath: string, query: string) => {
    return searchDirectory(rootPath, query, 50)
  })

  ipcMain.handle('workspace:write-file', async (_e, filePath: string, content: string) => {
    await assertInsideWorkspace(filePath)
    fs.writeFileSync(filePath, content)
    return true
  })

  ipcMain.handle('workspace:create-file', async (_e, filePath: string, content: string) => {
    await assertInsideWorkspace(filePath)
    if (fs.existsSync(filePath)) throw new Error('File already exists')
    fs.writeFileSync(filePath, content || '')
    return true
  })

  ipcMain.handle('workspace:create-directory', async (_e, dirPath: string) => {
    await assertInsideWorkspace(dirPath)
    fs.mkdirSync(dirPath, { recursive: true })
    return true
  })

  ipcMain.handle('workspace:rename-file', async (_e, filePath: string, newName: string) => {
    await assertInsideWorkspace(filePath)
    if (path.isAbsolute(newName) || newName.includes('..')) {
      throw new Error('Invalid file name')
    }
    const dir = path.dirname(filePath)
    const newPath = path.join(dir, newName)
    if (fs.existsSync(newPath)) throw new Error('Target already exists')
    fs.renameSync(filePath, newPath)
    return true
  })

  ipcMain.handle('workspace:delete-file', async (_e, filePath: string) => {
    await assertInsideWorkspace(filePath)
    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) {
      fs.rmSync(filePath, { recursive: true, force: true })
    } else {
      fs.unlinkSync(filePath)
    }
    return true
  })

  ipcMain.handle('workspace:file-type', async (_e, filePath: string) => {
    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) return 'directory'
    const ext = path.extname(filePath).toLowerCase()
    const types: Record<string, string> = {
      '.md': 'markdown', '.txt': 'text', '.json': 'json', '.js': 'javascript',
      '.ts': 'typescript', '.tsx': 'typescript', '.jsx': 'javascript', '.py': 'python',
      '.html': 'html', '.css': 'css', '.sql': 'sql', '.pdf': 'pdf',
      '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', '.webp': 'image',
      '.svg': 'svg', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml', '.xml': 'xml',
      '.sh': 'shell', '.bat': 'shell', '.rs': 'rust', '.go': 'go', '.java': 'java',
      '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.rb': 'ruby', '.php': 'php', '.scss': 'scss',
      '.vue': 'vue', '.csv': 'csv', '.log': 'text',
    }
    return types[ext] || 'text'
  })

  ipcMain.handle('workspace:file-stats', async (_e, filePath: string) => {
    const stat = fs.statSync(filePath)
    return {
      name: path.basename(filePath),
      path: filePath,
      size: stat.size,
      modifiedAt: stat.mtimeMs,
      createdAt: stat.birthtimeMs,
      isDirectory: stat.isDirectory(),
    }
  })

  ipcMain.handle('dialog:select-file', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:select-files', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections'],
    })
    if (result.canceled) return []
    return result.filePaths
  })

  ipcMain.handle('dialog:select-folder', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:save-file', async (_e, opts: { defaultPath?: string; filterName?: string; extensions?: string[] }) => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showSaveDialog(win!, {
      title: 'Save File',
      defaultPath: opts.defaultPath,
      filters: [{ name: opts.filterName || 'All Files', extensions: opts.extensions || ['*'] }],
    })
    if (result.canceled || !result.filePath) return null
    return result.filePath
  })
}

function readLocalDirectory(dirPath: string) {
  const result: any[] = []
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.git' && entry.isDirectory()) continue
    if (isSkippedDir(entry.name) && entry.isDirectory()) continue
    const full = path.join(dirPath, entry.name)
    try {
      const stat = fs.statSync(full)
      const item: FileEntry = {
        name: entry.name,
        path: full,
        type: entry.isDirectory() ? 'directory' : 'file',
        size: entry.isDirectory() ? 0 : stat.size,
        modifiedAt: stat.mtimeMs,
      }
      if (entry.isDirectory()) {
        const depth = countDepth(full)
        if (depth < 3) {
          try {
            item.children = readLocalDirectory(full)
          } catch {
            item.children = []
          }
        }
      }
      result.push(item)
    } catch {
      // skip permission errors
    }
  }
  return result
}

function countDepth(p: string): number {
  return p.split(path.sep).length
}

function searchDirectory(root: string, query: string, maxResults: number): any[] {
  const results: any[] = []
  const lowerQuery = query.toLowerCase()
  const stack = [root]
  const visited = new Set<string>()

  while (stack.length > 0 && results.length < maxResults) {
    const dir = stack.pop()!
    if (visited.has(dir)) continue
    visited.add(dir)
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!isSkippedDir(entry.name) && !entry.name.startsWith('.') && stack.length < 2000) {
          stack.push(full)
        }
      } else {
        if (entry.name.toLowerCase().includes(lowerQuery)) {
          try {
            const stat = fs.statSync(full)
            if (stat.size < 500 * 1024) {
              results.push({ path: full, name: entry.name, isMatch: true })
            }
          } catch {}
        }
      }
      if (results.length >= maxResults) break
    }
  }
  return results
}

export function readFilesForAttach(paths: string[]): AttachedFile[] {
  return paths
    .map((p) => {
      try {
        const stat = fs.statSync(p)
        const name = path.basename(p)
        const ext = path.extname(p).toLowerCase()
        let content: string | undefined
        let preview: string | undefined
        if (stat.size <= 200 * 1024 && !BINARY_EXTENSIONS.has(ext)) {
          content = fs.readFileSync(p, 'utf-8')
          preview = content.slice(0, 2000)
        } else {
          preview = `[${ext || 'binary'} file, ${formatBytes(stat.size)}]`
        }
        return {
          id: randomUUID(),
          name,
          path: p,
          type: ext.replace('.', '') || 'file',
          size: stat.size,
          content,
          preview,
        }
      } catch {
        return null
      }
    })
    .filter(Boolean) as AttachedFile[]
}

export async function getWorkspaceSettings(workspaceId: string): Promise<any> {
  const row = await get<any>('SELECT settings FROM workspaces WHERE id = ?', [workspaceId])
  return row?.settings ? JSON.parse(row.settings) : {}
}
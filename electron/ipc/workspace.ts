import { ipcMain, dialog, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { all, get, run, transaction } from '../database'
import { Workspace, FileEntry } from '../../src/types'
import path from 'path'
import fs from 'fs'
import { isSkippedDir, BINARY_EXTENSIONS } from './shared'
import { canDescend, clampText } from './fsLimits'
import {
  assertPathAllowed,
  assertPathInsideRoots,
  canonicalizePath,
  isCanonicalPathInsideRoot,
  sanitizeFileName,
  trustPath,
  trustPaths,
  validatePathInput,
} from '../security-policy'

function parseSettings(raw: unknown): any {
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

function mapRow(row: any): Workspace {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    settings: parseSettings(row.settings),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    color: row.color,
    icon: row.icon,
    lastOpenedAt: row.last_opened_at,
  }
}

const MAX_FILE_SIZE = 5 * 1024 * 1024
const MAX_TEXT_CHARS = 200_000
const MAX_TREE_DEPTH = 12
const MAX_TREE_ENTRIES = 20_000

async function workspaceRoots(): Promise<Array<string | null>> {
  const workspaces = await all<{ path: string | null }>('SELECT path FROM workspaces WHERE path IS NOT NULL')
  return workspaces.map((w) => w.path)
}

async function assertInsideWorkspace(filePath: string): Promise<string> {
  return assertPathInsideRoots(filePath, await workspaceRoots())
}

async function assertReadable(filePath: string): Promise<string> {
  return assertPathAllowed(filePath, await workspaceRoots())
}

function requireExistingDirectory(input: unknown): string {
  const canonical = canonicalizePath(input)
  let stat: fs.Stats
  try {
    stat = fs.statSync(canonical)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('Workspace folder does not exist.')
    }
    throw error
  }
  if (!stat.isDirectory()) throw new Error('Workspace path must be a directory.')
  return canonical
}

export function registerWorkspaceIpc() {
  ipcMain.handle('workspace:list', async () => {
    const rows = await all<any>('SELECT * FROM workspaces ORDER BY last_opened_at DESC, created_at ASC')
    return rows.map(mapRow)
  })

  ipcMain.handle('workspace:create', async (_e, data: Partial<Workspace>) => {
    const payload: Partial<Workspace> = data && typeof data === 'object' ? data : {}
    if (payload.path !== undefined && payload.path !== null && typeof payload.path !== 'string') {
      throw new Error('Invalid workspace path.')
    }
    const workspacePath =
      payload.path && payload.path.trim() ? requireExistingDirectory(payload.path) : undefined
    const now = Date.now()
    const ws: Workspace = {
      id: randomUUID(),
      name: payload.name || 'New Workspace',
      path: workspacePath,
      createdAt: now,
      updatedAt: now,
      color: payload.color,
      icon: payload.icon,
      settings: payload.settings,
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
      if (v === undefined) continue
      if (tsKey === 'path') {
        if (typeof v !== 'string' || !v.trim()) throw new Error('Invalid workspace path.')
        fields.push(dbKey)
        values.push(requireExistingDirectory(v))
        continue
      }
      fields.push(dbKey)
      values.push(v)
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
    const selected = requireExistingDirectory(result.filePaths[0])
    trustPath(selected)
    return selected
  })

  ipcMain.handle('workspace:select-folder', async (_e) => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      title: 'Select Folder',
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const selected = requireExistingDirectory(result.filePaths[0])
    trustPath(selected)
    return selected
  })

  ipcMain.handle('workspace:read-file', async (_e, filePath: string) => {
    const safePath = await assertReadable(filePath)
    const stat = fs.statSync(safePath)
    if (stat.size > MAX_FILE_SIZE) {
      return { error: 'File too large', truncated: true, content: '' }
    }
    const name = path.basename(safePath)
    const ext = path.extname(safePath).toLowerCase()
    if (BINARY_EXTENSIONS.has(ext)) {
      const content = fs.readFileSync(safePath).toString('base64')
      return { content, base64: true, name, size: stat.size }
    }
    const raw = fs.readFileSync(safePath, 'utf-8')
    const content = clampText(raw, MAX_TEXT_CHARS)
    return { content, base64: false, name, size: stat.size, truncated: content.length < raw.length }
  })

  ipcMain.handle('workspace:list-directory', async (_e, dirPath: string) => {
    const safePath = await assertReadable(dirPath)
    return readLocalDirectory(safePath, safePath)
  })

  ipcMain.handle('workspace:search-files', async (_e, rootPath: string, query: string) => {
    const safeRoot = await assertReadable(rootPath)
    if (typeof query !== 'string') throw new Error('Invalid search query.')
    return searchDirectory(safeRoot, query, 50, safeRoot)
  })

  ipcMain.handle('workspace:write-file', async (_e, filePath: string, content: string) => {
    const safePath = await assertInsideWorkspace(filePath)
    fs.writeFileSync(safePath, content)
    return true
  })

  ipcMain.handle('workspace:create-file', async (_e, filePath: string, content: string) => {
    const safePath = await assertInsideWorkspace(filePath)
    if (fs.existsSync(safePath)) throw new Error('File already exists')
    fs.writeFileSync(safePath, content || '')
    return true
  })

  ipcMain.handle('workspace:create-directory', async (_e, dirPath: string) => {
    const safePath = await assertInsideWorkspace(dirPath)
    fs.mkdirSync(safePath, { recursive: true })
    return true
  })

  ipcMain.handle('workspace:rename-file', async (_e, filePath: string, newName: string) => {
    const safeSource = await assertInsideWorkspace(filePath)
    const safeName = sanitizeFileName(newName)
    if (!safeName) {
      throw new Error('Invalid file name')
    }
    const dir = path.dirname(safeSource)
    const safeTarget = await assertInsideWorkspace(path.join(dir, safeName))
    if (fs.existsSync(safeTarget)) throw new Error('Target already exists')
    fs.renameSync(safeSource, safeTarget)
    return true
  })

  ipcMain.handle('workspace:delete-file', async (_e, filePath: string) => {
    const inputPath = path.resolve(validatePathInput(filePath))
    const safePath = await assertInsideWorkspace(filePath)
    if (fs.lstatSync(inputPath).isSymbolicLink()) {
      fs.unlinkSync(inputPath)
      return true
    }
    const stat = fs.statSync(safePath)
    if (stat.isDirectory()) {
      fs.rmSync(safePath, { recursive: true, force: true })
    } else {
      fs.unlinkSync(safePath)
    }
    return true
  })

  ipcMain.handle('workspace:file-type', async (_e, filePath: string) => {
    const safePath = await assertReadable(filePath)
    const stat = fs.statSync(safePath)
    if (stat.isDirectory()) return 'directory'
    const ext = path.extname(safePath).toLowerCase()
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
    const safePath = await assertReadable(filePath)
    const stat = fs.statSync(safePath)
    return {
      name: path.basename(safePath),
      path: safePath,
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
    const selected = canonicalizePath(result.filePaths[0])
    trustPath(selected)
    return selected
  })

  ipcMain.handle('dialog:select-files', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections'],
    })
    if (result.canceled) return []
    const selected = result.filePaths.map((filePath) => canonicalizePath(filePath))
    trustPaths(selected)
    return selected
  })

  ipcMain.handle('dialog:select-folder', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const selected = requireExistingDirectory(result.filePaths[0])
    trustPath(selected)
    return selected
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

interface TreeBudget {
  remaining: number
}

function readLocalDirectory(
  dirPath: string,
  workspaceRoot: string,
  budget: TreeBudget = { remaining: MAX_TREE_ENTRIES }
): FileEntry[] {
  const result: FileEntry[] = []
  if (budget.remaining <= 0) return result
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    if (budget.remaining <= 0) break
    const full = path.join(dirPath, entry.name)
    try {
      let target = full
      if (entry.isSymbolicLink()) {
        target = canonicalizePath(full)
        if (!isCanonicalPathInsideRoot(target, workspaceRoot)) continue
      }
      const stat = fs.statSync(target)
      const isDirectory = stat.isDirectory()
      if (isDirectory) {
        if (entry.name.startsWith('.') && entry.name !== '.git') continue
        if (isSkippedDir(entry.name)) continue
      }
      budget.remaining -= 1
      const item: FileEntry = {
        name: entry.name,
        path: target,
        type: isDirectory ? 'directory' : 'file',
        size: isDirectory ? 0 : stat.size,
        modifiedAt: stat.mtimeMs,
      }
      if (isDirectory && canDescend(workspaceRoot, target, MAX_TREE_DEPTH)) {
        try {
          item.children = readLocalDirectory(target, workspaceRoot, budget)
        } catch {
          item.children = []
        }
      }
      result.push(item)
    } catch {
      // skip permission errors and unsafe links
    }
  }
  return result
}


function searchDirectory(root: string, query: string, maxResults: number, workspaceRoot: string): any[] {
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
      try {
        let target = full
        if (entry.isSymbolicLink()) {
          target = canonicalizePath(full)
          if (!isCanonicalPathInsideRoot(target, workspaceRoot)) continue
        }
        const stat = fs.statSync(target)
        if (stat.isDirectory()) {
          if (!isSkippedDir(entry.name) && !entry.name.startsWith('.') && stack.length < 2000) {
            stack.push(target)
          }
        } else if (entry.name.toLowerCase().includes(lowerQuery) && stat.size < 500 * 1024) {
          results.push({ path: target, name: entry.name, isMatch: true })
        }
      } catch {
        // skip unreadable and unsafe entries
      }
      if (results.length >= maxResults) break
    }
  }
  return results
}

export async function getWorkspaceSettings(workspaceId: string): Promise<any> {
  const row = await get<any>('SELECT settings FROM workspaces WHERE id = ?', [workspaceId])
  return parseSettings(row?.settings) ?? {}
}
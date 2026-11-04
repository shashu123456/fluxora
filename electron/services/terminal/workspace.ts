import fs from 'fs'
import { all, get } from '../../database'
import { canonicalizePath, isCanonicalPathInsideRoot, validatePathInput } from '../../security-policy'

export interface ResolvedTerminalWorkspace {
  workspaceId: string
  workspaceName: string
  root: string | null
  cwd: string
}

interface WorkspaceRow {
  id: string
  name: string | null
  path: string | null
}

function canonicalDirectory(value: string, label: string): string {
  const canonical = canonicalizePath(value)
  let stat: fs.Stats
  try {
    stat = fs.statSync(canonical)
  } catch {
    throw new Error(`${label} does not exist.`)
  }
  if (!stat.isDirectory()) throw new Error(`${label} must be a directory.`)
  return canonical
}

async function matchingWorkspace(cwd: string): Promise<{ row: WorkspaceRow; root: string } | null> {
  const rows = await all<WorkspaceRow>('SELECT id, name, path FROM workspaces WHERE path IS NOT NULL')
  for (const row of rows) {
    if (!row.path) continue
    try {
      const root = canonicalDirectory(row.path, 'Workspace folder')
      if (isCanonicalPathInsideRoot(cwd, root)) return { row, root }
    } catch {
      continue
    }
  }
  return null
}

export async function resolveTerminalWorkspace(
  workspaceIdInput: unknown,
  cwdInput: unknown
): Promise<ResolvedTerminalWorkspace> {
  const workspaceId = typeof workspaceIdInput === 'string' ? workspaceIdInput.trim() : ''
  const cwdValue = typeof cwdInput === 'string' ? cwdInput.trim() : ''

  if (workspaceId && workspaceId !== 'global') {
    const row = await get<WorkspaceRow>('SELECT id, name, path FROM workspaces WHERE id = ?', [workspaceId])
    if (!row) throw new Error('Workspace is not registered.')
    if (!row.path) throw new Error('Workspace has no folder on disk.')
    const root = canonicalDirectory(row.path, 'Workspace folder')
    const cwd = cwdValue ? canonicalDirectory(validatePathInput(cwdValue, 'Working directory'), 'Working directory') : root
    if (!isCanonicalPathInsideRoot(cwd, root)) {
      throw new Error('Working directory is outside the workspace.')
    }
    return {
      workspaceId: row.id,
      workspaceName: row.name || 'Workspace',
      root,
      cwd,
    }
  }

  if (!cwdValue) throw new Error('A working directory inside a workspace is required.')
  const cwd = canonicalDirectory(validatePathInput(cwdValue, 'Working directory'), 'Working directory')
  const matched = await matchingWorkspace(cwd)
  if (!matched) throw new Error('Working directory is outside every approved workspace.')
  return {
    workspaceId: matched.row.id,
    workspaceName: matched.row.name || 'Workspace',
    root: matched.root,
    cwd,
  }
}

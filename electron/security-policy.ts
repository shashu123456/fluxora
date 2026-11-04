import fs from 'fs'
import path from 'path'

export interface WorkspaceRoot {
  path: string | null | undefined
}

const MAX_PATH_LENGTH = 32767

/**
 * Lexical containment check. Kept for cheap comparisons and backwards
 * compatibility; filesystem boundaries must use the canonical helpers below.
 */
export function isPathInsideRoot(filePath: string, root: string): boolean {
  if (!filePath || !root) return false
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(filePath)
  const rel = path.relative(resolvedRoot, resolvedTarget)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

export function isPathInsideAnyRoot(filePath: string, roots: Array<string | null | undefined>): boolean {
  return roots.some((root) => (root ? isPathInsideRoot(filePath, root) : false))
}

export function describeWorkspaceViolation(filePath: string): string {
  return `Blocked: ${path.basename(filePath || 'path')} is outside every registered workspace folder.`
}

export function validatePathInput(value: unknown, label = 'path'): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${label}: expected a string.`)
  }
  if (!value.trim()) {
    throw new Error(`Invalid ${label}: path is empty.`)
  }
  if (value.includes('\0')) {
    throw new Error(`Invalid ${label}: path contains a null byte.`)
  }
  if (value.length > MAX_PATH_LENGTH) {
    throw new Error(`Invalid ${label}: path is too long.`)
  }
  return value
}

/**
 * Resolves a path to its real location. Missing trailing segments are allowed
 * for create/rename targets: the nearest existing ancestor is canonicalized
 * and the remaining segments are appended. This ensures a symlinked ancestor
 * cannot be used to escape the workspace.
 */
export function canonicalizePath(value: unknown): string {
  const input = validatePathInput(value)
  let current = path.resolve(input)
  const missing: string[] = []

  for (;;) {
    try {
      const real = fs.realpathSync.native(current)
      return missing.length ? path.join(real, ...missing.reverse()) : real
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        throw new Error(`Invalid path: ${(error as Error).message}`)
      }
      const parent = path.dirname(current)
      if (parent === current) return path.resolve(input)
      missing.push(path.basename(current))
      current = parent
    }
  }
}

function normalizeForComparison(filePath: string): string {
  return process.platform === 'win32' ? filePath.toLowerCase() : filePath
}

/** Compares two already-canonical paths. */
export function isCanonicalPathInsideRoot(canonicalPath: string, canonicalRoot: string): boolean {
  if (!canonicalPath || !canonicalRoot) return false
  const rel = path.relative(normalizeForComparison(canonicalRoot), normalizeForComparison(canonicalPath))
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))
}

function canonicalRoots(roots: Array<string | null | undefined>): string[] {
  const resolved: string[] = []
  for (const root of roots) {
    if (!root) continue
    try {
      resolved.push(canonicalizePath(root))
    } catch {
      // Ignore unusable roots; they cannot authorize anything.
    }
  }
  return resolved
}

function isTrustedCanonical(canonicalPath: string): boolean {
  for (const trusted of trustedPaths) {
    if (isCanonicalPathInsideRoot(canonicalPath, trusted)) return true
  }
  return false
}

/**
 * Validates a write target: it must resolve inside one of the workspace roots.
 * Returns the canonical path the caller must use for the operation.
 */
export function assertPathInsideRoots(
  filePath: string,
  roots: Array<string | null | undefined>
): string {
  const canonical = canonicalizePath(filePath)
  const resolvedRoots = canonicalRoots(roots)
  if (!resolvedRoots.some((root) => isCanonicalPathInsideRoot(canonical, root))) {
    throw new Error(describeWorkspaceViolation(filePath))
  }
  return canonical
}

/**
 * Validates a read target: it must resolve inside a workspace root or inside a
 * path explicitly trusted through a native file dialog.
 */
export function assertPathAllowed(
  filePath: string,
  roots: Array<string | null | undefined>
): string {
  const canonical = canonicalizePath(filePath)
  const resolvedRoots = canonicalRoots(roots)
  if (
    isTrustedCanonical(canonical) ||
    resolvedRoots.some((root) => isCanonicalPathInsideRoot(canonical, root))
  ) {
    return canonical
  }
  throw new Error(describeWorkspaceViolation(filePath))
}

export const SECURE_WEB_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
} as const

export const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

export function isAllowedExternalProtocol(protocol: string): boolean {
  return protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:'
}

const DANGEROUS_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /rm\s+-(?:[a-z]*[rf][a-z]*)/i, label: 'recursive force delete (rm -r/-f)' },
  { re: /(?:rd|rmdir)\s+\/s(?:[^&|]*)?/i, label: 'recursive directory delete (rd /s)' },
  { re: /(?:del|erase|delthread)\s+\/[a-z]*[s][a-z]*/i, label: 'recursive file delete (del /s)' },
  { re: /del\s+\/f(?:\s|$)/i, label: 'force file delete (del /f)' },
  { re: /git\s+push\s+.*(--force|-f)(?:\s|$)/i, label: 'force push (git push --force)' },
  { re: /git\s+reset\s+--hard/i, label: 'git reset --hard' },
  { re: /drop\s+(table|database)/i, label: 'drop table/database' },
  { re: /format\s+[a-z]:/i, label: 'disk format' },
  { re: /diskpart/i, label: 'diskpart' },
  { re: /^shutdown(?:\s|$)/i, label: 'system shutdown' },
  { re: /reg\s+delete/i, label: 'registry delete' },
  { re: /taskkill\s+\/f/i, label: 'force task kill' },
  { re: /pkexec\s+rm\s/i, label: 'privileged delete' },
  { re: /:\(\)\s*\{.*\};\s*:/, label: 'fork bomb' },
  { re: /mkfs\./i, label: 'filesystem format' },
  { re: /dd\s+.*of=\/dev\//i, label: 'raw disk write' },
]

export function blockedCommandReason(command: string): string | null {
  if (!command || !command.trim()) return 'empty command'
  for (const { re, label } of DANGEROUS_PATTERNS) {
    if (re.test(command)) return label
  }
  return null
}

export function isAllowlisted(command: string, allowlist: string[]): boolean {
  if (!command || allowlist.length === 0) return false
  const normalized = command.trim().toLowerCase()
  return allowlist.some((prefix) => normalized.startsWith(prefix.toLowerCase()))
}

export function sanitizeFileName(newName: string): string | null {
  if (!newName || !newName.trim()) return null
  if (newName === '.' || newName === '..') return null
  if (path.isAbsolute(newName)) return null
  if (newName.includes('..')) return null
  if (newName.includes('/') || newName.includes('\\')) return null
  if (/[<>:"|?*\x00-\x1f]/.test(newName)) return null
  return newName
}

const trustedPaths = new Set<string>()

export function trustPath(filePath: string | null | undefined): void {
  if (!filePath) return
  try {
    trustedPaths.add(canonicalizePath(filePath))
  } catch {
    // Ignore unusable paths.
  }
}

export function trustPaths(paths: Array<string | null | undefined>): void {
  for (const p of paths) trustPath(p)
}

export function isTrustedPath(filePath: string): boolean {
  try {
    return isTrustedCanonical(canonicalizePath(filePath))
  } catch {
    return false
  }
}

export function isPathAllowed(filePath: string, workspaceRoots: Array<string | null | undefined>): boolean {
  try {
    const canonical = canonicalizePath(filePath)
    if (isTrustedCanonical(canonical)) return true
    return canonicalRoots(workspaceRoots).some((root) => isCanonicalPathInsideRoot(canonical, root))
  } catch {
    return false
  }
}

export function resetTrustedPaths(): void {
  trustedPaths.clear()
}

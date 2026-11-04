import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  isPathInsideRoot,
  isPathInsideAnyRoot,
  isPathAllowed,
  isCanonicalPathInsideRoot,
  assertPathAllowed,
  assertPathInsideRoots,
  canonicalizePath,
  validatePathInput,
  blockedCommandReason,
  isAllowlisted,
  sanitizeFileName,
  isAllowedExternalProtocol,
  trustPath,
  trustPaths,
  isTrustedPath,
  resetTrustedPaths,
  SECURE_WEB_PREFERENCES,
  PRODUCTION_CSP,
} from '../../electron/security-policy'
import fs from 'fs'
import os from 'os'
import path from 'path'

const tempDirs: string[] = []

function makeTempDir(): string {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'fluxora-policy-')))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  resetTrustedPaths()
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('security-policy: path containment', () => {
  it('detects a path inside a root', () => {
    const root = path.resolve('/home/user/project')
    expect(isPathInsideRoot(path.join(root, 'src', 'index.ts'), root)).toBe(true)
  })

  it('treats the root itself as inside', () => {
    const root = path.resolve('/home/user/project')
    expect(isPathInsideRoot(root, root)).toBe(true)
  })

  it('rejects traversal outside the root', () => {
    const root = path.resolve('/home/user/project')
    expect(isPathInsideRoot(path.resolve('/home/user/secrets.txt'), root)).toBe(false)
    expect(isPathInsideRoot(path.join(root, '..', '..', 'etc', 'passwd'), root)).toBe(false)
  })

  it('is not fooled by a sibling with the same prefix', () => {
    const root = path.resolve('/home/user/project')
    expect(isPathInsideRoot(path.resolve('/home/user/project-evil/x'), root)).toBe(false)
  })

  it('checks multiple roots', () => {
    const roots = [path.resolve('/a'), path.resolve('/b')]
    expect(isPathInsideAnyRoot(path.resolve('/b/x'), roots)).toBe(true)
    expect(isPathInsideAnyRoot(path.resolve('/c/x'), roots)).toBe(false)
  })

  it('handles empty/null roots safely', () => {
    expect(isPathInsideRoot('/x', '')).toBe(false)
    expect(isPathInsideAnyRoot('/x', [null, undefined])).toBe(false)
  })
})

describe('security-policy: trusted paths', () => {
  beforeEach(() => resetTrustedPaths())

  it('trusts an explicitly registered path and its descendants', () => {
    const file = path.resolve('/tmp/picked.txt')
    expect(isTrustedPath(file)).toBe(false)
    trustPath(file)
    expect(isTrustedPath(file)).toBe(true)
  })

  it('trusts descendants of a trusted folder', () => {
    const folder = path.resolve('/tmp/folder')
    trustPath(folder)
    expect(isTrustedPath(path.join(folder, 'a', 'b.txt'))).toBe(true)
  })

  it('does not trust unrelated paths', () => {
    trustPath(path.resolve('/tmp/folder'))
    expect(isTrustedPath(path.resolve('/tmp/other/x'))).toBe(false)
  })

  it('trusts a batch of paths', () => {
    const a = path.resolve('/tmp/a')
    const b = path.resolve('/tmp/b')
    trustPaths([a, b, null])
    expect(isTrustedPath(a)).toBe(true)
    expect(isTrustedPath(b)).toBe(true)
  })

  it('isPathAllowed passes workspace-rooted or trusted paths only', () => {
    const root = path.resolve('/ws')
    const trusted = path.resolve('/tmp/picked.txt')
    trustPath(trusted)
    expect(isPathAllowed(path.join(root, 'src/a.ts'), [root])).toBe(true)
    expect(isPathAllowed(trusted, [root])).toBe(true)
    expect(isPathAllowed(path.resolve('/etc/passwd'), [root])).toBe(false)
  })
})

describe('security-policy: canonical containment', () => {
  it('accepts real paths inside a workspace and returns the canonical path', () => {
    const root = makeTempDir()
    const file = path.join(root, 'src', 'index.ts')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, 'export {}')
    const expected = fs.realpathSync.native(file)
    expect(assertPathInsideRoots(file, [root])).toBe(expected)
    expect(assertPathAllowed(file, [root])).toBe(expected)
    expect(isCanonicalPathInsideRoot(expected, root)).toBe(true)
  })

  it('rejects traversal and sibling-prefix escapes', () => {
    const root = makeTempDir()
    const sibling = makeTempDir()
    expect(() => assertPathInsideRoots(path.join(root, '..', 'outside.txt'), [root])).toThrow()
    expect(() => assertPathAllowed(path.join(sibling, 'secret.txt'), [root])).toThrow()
  })

  it('rejects a symlink or junction that escapes the workspace', () => {
    const root = makeTempDir()
    const outside = makeTempDir()
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret')
    const link = path.join(root, 'escape')
    try {
      fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir')
    } catch {
      return
    }
    expect(() => assertPathInsideRoots(path.join(link, 'secret.txt'), [root])).toThrow()
    expect(() => assertPathAllowed(path.join(link, 'secret.txt'), [root])).toThrow()
    expect(canonicalizePath(path.join(link, 'secret.txt'))).toBe(
      fs.realpathSync.native(path.join(outside, 'secret.txt'))
    )
  })

  it('allows a missing write target whose ancestor is inside the workspace', () => {
    const root = makeTempDir()
    const target = path.join(root, 'new', 'file.txt')
    expect(assertPathInsideRoots(target, [root])).toBe(path.join(fs.realpathSync.native(root), 'new', 'file.txt'))
  })

  it('allows explicitly trusted dialog paths outside workspace roots', () => {
    const root = makeTempDir()
    const outside = makeTempDir()
    const picked = path.join(outside, 'picked.txt')
    fs.writeFileSync(picked, 'x')
    trustPath(picked)
    expect(assertPathAllowed(picked, [root])).toBe(fs.realpathSync.native(picked))
  })

  it('rejects malformed path input', () => {
    expect(() => validatePathInput(undefined)).toThrow()
    expect(() => validatePathInput(null)).toThrow()
    expect(() => validatePathInput(42)).toThrow()
    expect(() => validatePathInput('   ')).toThrow()
    expect(() => validatePathInput('bad\0path')).toThrow()
    expect(() => validatePathInput('x'.repeat(32768))).toThrow()
    expect(() => canonicalizePath('\0')).toThrow()
  })

  it('rejects path separators in file names', () => {
    expect(sanitizeFileName('a/b')).toBeNull()
    expect(sanitizeFileName('a\\b')).toBeNull()
    expect(sanitizeFileName('.')).toBeNull()
    expect(sanitizeFileName('..')).toBeNull()
  })
})

describe('security-policy: command classification', () => {
  it('flags destructive commands', () => {
    expect(blockedCommandReason('rm -rf /')).toBeTruthy()
    expect(blockedCommandReason('git push --force origin main')).toBeTruthy()
    expect(blockedCommandReason('git reset --hard HEAD~3')).toBeTruthy()
    expect(blockedCommandReason('DROP TABLE users')).toBeTruthy()
    expect(blockedCommandReason('diskpart')).toBeTruthy()
    expect(blockedCommandReason('taskkill /f /im node.exe')).toBeTruthy()
  })

  it('allows benign commands', () => {
    expect(blockedCommandReason('npm run build')).toBeNull()
    expect(blockedCommandReason('git status')).toBeNull()
    expect(blockedCommandReason('ls -la')).toBeNull()
  })

  it('treats empty command as blocked', () => {
    expect(blockedCommandReason('')).toBeTruthy()
    expect(blockedCommandReason('   ')).toBeTruthy()
  })

  it('does not false-positive on git push without force', () => {
    expect(blockedCommandReason('git push origin main')).toBeNull()
  })

  it('allowlist matches by prefix', () => {
    expect(isAllowlisted('npm test', ['npm test'])).toBe(true)
    expect(isAllowlisted('npm run build', ['npm run'])).toBe(true)
    expect(isAllowlisted('rm -rf /', ['npm run'])).toBe(false)
    expect(isAllowlisted('npm', [])).toBe(false)
  })
})

describe('security-policy: filename sanitization', () => {
  it('accepts normal names', () => {
    expect(sanitizeFileName('index.ts')).toBe('index.ts')
    expect(sanitizeFileName('my file.md')).toBe('my file.md')
  })

  it('rejects traversal and absolute paths', () => {
    expect(sanitizeFileName('../evil')).toBeNull()
    expect(sanitizeFileName(path.resolve('/abs/path'))).toBeNull()
  })

  it('rejects reserved characters and empty names', () => {
    expect(sanitizeFileName('a<b>c')).toBeNull()
    expect(sanitizeFileName('a|b')).toBeNull()
    expect(sanitizeFileName('')).toBeNull()
    expect(sanitizeFileName('   ')).toBeNull()
  })
})

describe('security-policy: web hardening constants', () => {
  it('locks down web preferences', () => {
    expect(SECURE_WEB_PREFERENCES.contextIsolation).toBe(true)
    expect(SECURE_WEB_PREFERENCES.nodeIntegration).toBe(false)
    expect(SECURE_WEB_PREFERENCES.sandbox).toBe(true)
    expect(SECURE_WEB_PREFERENCES.webSecurity).toBe(true)
    expect(SECURE_WEB_PREFERENCES.allowRunningInsecureContent).toBe(false)
  })

  it('CSP forbids inline scripts and framing', () => {
    expect(PRODUCTION_CSP).toContain("default-src 'self'")
    expect(PRODUCTION_CSP).toContain("script-src 'self'")
    expect(PRODUCTION_CSP).toContain("object-src 'none'")
    expect(PRODUCTION_CSP).toContain("frame-ancestors 'none'")
    expect(PRODUCTION_CSP).not.toContain("script-src 'self' 'unsafe-inline'")
  })

  it('allows only safe external protocols', () => {
    expect(isAllowedExternalProtocol('https:')).toBe(true)
    expect(isAllowedExternalProtocol('http:')).toBe(true)
    expect(isAllowedExternalProtocol('mailto:')).toBe(true)
    expect(isAllowedExternalProtocol('file:')).toBe(false)
    expect(isAllowedExternalProtocol('javascript:')).toBe(false)
  })
})

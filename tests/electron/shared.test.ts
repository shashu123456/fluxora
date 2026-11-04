import { describe, it, expect } from 'vitest'
import { SKIP_DIRS, isSkippedDir, BINARY_EXTENSIONS, formatBytes } from '../../electron/ipc/shared'

describe('SKIP_DIRS', () => {
  it('includes common skip directories', () => {
    expect(SKIP_DIRS.has('node_modules')).toBe(true)
    expect(SKIP_DIRS.has('dist')).toBe(true)
    expect(SKIP_DIRS.has('build')).toBe(true)
    expect(SKIP_DIRS.has('.git')).toBe(true)
    expect(SKIP_DIRS.has('target')).toBe(true)
    expect(SKIP_DIRS.has('venv')).toBe(true)
  })
  it('does not skip source directories', () => {
    expect(SKIP_DIRS.has('src')).toBe(false)
    expect(SKIP_DIRS.has('electron')).toBe(false)
    expect(SKIP_DIRS.has('components')).toBe(false)
  })
})

describe('isSkippedDir', () => {
  it('returns true for skipped dirs', () => {
    expect(isSkippedDir('node_modules')).toBe(true)
    expect(isSkippedDir('.next')).toBe(true)
  })
  it('returns false for normal dirs', () => {
    expect(isSkippedDir('src')).toBe(false)
    expect(isSkippedDir('app')).toBe(false)
  })
})

describe('BINARY_EXTENSIONS', () => {
  it('includes image extensions', () => {
    expect(BINARY_EXTENSIONS.has('.png')).toBe(true)
    expect(BINARY_EXTENSIONS.has('.jpg')).toBe(true)
    expect(BINARY_EXTENSIONS.has('.webp')).toBe(true)
  })
  it('includes font extensions', () => {
    expect(BINARY_EXTENSIONS.has('.woff')).toBe(true)
    expect(BINARY_EXTENSIONS.has('.ttf')).toBe(true)
  })
  it('includes database extensions', () => {
    expect(BINARY_EXTENSIONS.has('.db')).toBe(true)
    expect(BINARY_EXTENSIONS.has('.sqlite')).toBe(true)
  })
  it('excludes code extensions', () => {
    expect(BINARY_EXTENSIONS.has('.ts')).toBe(false)
    expect(BINARY_EXTENSIONS.has('.js')).toBe(false)
    expect(BINARY_EXTENSIONS.has('.py')).toBe(false)
  })
})

describe('formatBytes (electron)', () => {
  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B')
  })
  it('formats kilobytes', () => {
    expect(formatBytes(2048)).toBe('2.0 KB')
  })
  it('formats megabytes', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
  it('handles zero', () => {
    expect(formatBytes(0)).toBe('0 B')
  })
})

import { describe, it, expect } from 'vitest'
import {
  cn, formatBytes, formatDate, formatDateTime, formatRelativeTime,
  formatTokens, formatCost, truncate, uid, stripMarkdown, extractFirstCodeBlock,
} from '@/lib/utils'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('a', 'b')).toBe('a b')
  })
  it('handles conditional classes', () => {
    expect(cn('a', false && 'b', 'c')).toBe('a c')
  })
  it('deduplicates tailwind classes', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })
})

describe('formatBytes', () => {
  it('returns 0 B for zero', () => {
    expect(formatBytes(0)).toBe('0 B')
  })
  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B')
  })
  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB')
  })
  it('formats megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1 MB')
  })
  it('formats gigabytes', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB')
  })
  it('respects decimals param', () => {
    expect(formatBytes(1536, 0)).toBe('2 KB')
  })
})

describe('formatTokens', () => {
  it('returns raw number under 1000', () => {
    expect(formatTokens(999)).toBe('999')
  })
  it('formats thousands', () => {
    expect(formatTokens(1500)).toBe('1.5K')
  })
  it('formats millions', () => {
    expect(formatTokens(2_500_000)).toBe('2.5M')
  })
})

describe('formatCost', () => {
  it('returns $0.00 for zero', () => {
    expect(formatCost(0)).toBe('$0.00')
  })
  it('shows 4 decimals for sub-cent', () => {
    expect(formatCost(0.0012)).toBe('$0.0012')
  })
  it('shows 2 decimals for cents', () => {
    expect(formatCost(1.5)).toBe('$1.50')
  })
})

describe('truncate', () => {
  it('returns empty for falsy', () => {
    expect(truncate('', 10)).toBe('')
  })
  it('returns original when short enough', () => {
    expect(truncate('hello', 10)).toBe('hello')
  })
  it('truncates with ellipsis', () => {
    expect(truncate('hello world', 5)).toBe('hello…')
  })
})

describe('uid', () => {
  it('generates unique ids', () => {
    const a = uid()
    const b = uid()
    expect(a).not.toBe(b)
  })
  it('generates non-empty string', () => {
    expect(uid().length).toBeGreaterThan(5)
  })
})

describe('stripMarkdown', () => {
  it('removes code blocks', () => {
    expect(stripMarkdown('```\ncode\n```')).toBe('')
  })
  it('removes inline code', () => {
    expect(stripMarkdown('use `npm install`')).toBe('use npm install')
  })
  it('removes emphasis markers', () => {
    expect(stripMarkdown('**bold** and _italic_')).toBe('bold and italic')
  })
  it('preserves link text', () => {
    expect(stripMarkdown('[Click here](https://example.com)')).toBe('Click here')
  })
})

describe('extractFirstCodeBlock', () => {
  it('returns null when no code block', () => {
    expect(extractFirstCodeBlock('no code here')).toBeNull()
  })
  it('extracts language and code', () => {
    const result = extractFirstCodeBlock('text\n```typescript\nconst x = 1\n```\nafter')
    expect(result).not.toBeNull()
    expect(result!.language).toBe('typescript')
    expect(result!.code).toBe('const x = 1\n')
  })
  it('handles empty language', () => {
    const result = extractFirstCodeBlock('```\nplain\n```')
    expect(result!.language).toBe('')
    expect(result!.code).toBe('plain\n')
  })
})

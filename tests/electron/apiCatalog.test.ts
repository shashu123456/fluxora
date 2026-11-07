import { describe, it, expect } from 'vitest'
import { API_CATALOG, CATALOG_VERIFIED_AT, findCatalogEntry } from '../../electron/services/apiDiscovery/catalog'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

describe('API catalog', () => {
  it('has 20 entries', () => {
    expect(new Set(API_CATALOG.map((e) => e.name)).size).toBe(20)
  })

  it('has valid metadata on every entry', () => {
    for (const entry of API_CATALOG) {
      expect(entry.id).toMatch(/^[a-z0-9-]+$/)
      expect(entry.description.length).toBeGreaterThan(10)
      expect(entry.responseNotes.length).toBeGreaterThan(5)
      expect(entry.tags.length).toBeGreaterThan(0)
      expect(['low', 'medium', 'high']).toContain(entry.risk)
      expect(entry.verifiedAt).toMatch(ISO_DATE)
      expect(entry.verifiedAt).toBe(CATALOG_VERIFIED_AT)
      expect(Number.isNaN(Date.parse(entry.verifiedAt))).toBe(false)
    }
  })

  it('records verification metadata that matches the probe result', () => {
    for (const entry of API_CATALOG) {
      expect(['ok', 'rate-limited', 'unreachable']).toContain(entry.verification.status)
      expect(Number.isInteger(entry.verification.httpStatus)).toBe(true)
      expect(entry.verification.checkedAt).toMatch(ISO_DATE)
      expect(Date.parse(entry.verification.checkedAt)).toBe(Date.parse(entry.verifiedAt))

      if (entry.verification.status === 'ok') {
        expect(entry.verification.httpStatus).toBeGreaterThanOrEqual(200)
        expect(entry.verification.httpStatus).toBeLessThan(400)
      }
      if (entry.verification.status === 'rate-limited') {
        expect(entry.verification.httpStatus).toBe(429)
        expect(entry.verification.note).toBeTruthy()
      }
      if (entry.verification.status === 'unreachable') {
        expect(entry.verification.note).toBeTruthy()
      }
    }
  })

  it('does not claim Google Books is verified working', () => {
    const books = findCatalogEntry('google-books')!
    expect(books.verification.status).toBe('rate-limited')
    expect(books.verification.httpStatus).toBe(429)
    expect(books.verification.note).toMatch(/quota/i)
    expect(API_CATALOG.filter((entry) => entry.verification.status === 'ok')).toHaveLength(19)
  })

  it('uses HTTPS for base and documentation URLs', () => {
    for (const entry of API_CATALOG) {
      expect(entry.baseUrl.startsWith('https://')).toBe(true)
      expect(entry.docsUrl.startsWith('https://')).toBe(true)
      const base = new URL(entry.baseUrl)
      expect(base.username).toBe('')
      expect(base.password).toBe('')
      expect(base.search).toBe('')
      expect(base.hash).toBe('')
      expect(base.port === '' || base.port === '443').toBe(true)
    }
  })

  it('keeps sample requests relative, GET-only, and free of secrets', () => {
    for (const entry of API_CATALOG) {
      expect(entry.sample.method).toBe('GET')
      expect(entry.sample.path.startsWith('/')).toBe(true)
      expect(entry.sample.path.startsWith('//')).toBe(false)
      expect(entry.sample.path.includes('://')).toBe(false)
      expect(entry.sample.path.includes('..')).toBe(false)
      expect(entry.sample.path.includes('#')).toBe(false)
      expect(entry.sample.path.includes('?')).toBe(false)
      expect(entry.sample.path.toLowerCase()).not.toMatch(/%2e|%2f|%00/)
      for (const [key, value] of Object.entries(entry.sample.query ?? {})) {
        expect(key.toLowerCase()).not.toMatch(/key|token|secret|password|auth/)
        expect(value.toLowerCase()).not.toMatch(/key|token|secret|password|bearer/)
      }
    }
  })

  it('lists every entry once with stable ids', () => {
    const ids = new Map<string, string>()
    for (const entry of API_CATALOG) {
      const prev = ids.get(entry.id)
      expect(prev).toBeUndefined()
      ids.set(entry.id, entry.name)
    }
    expect(ids.size).toBe(API_CATALOG.length)
  })
})

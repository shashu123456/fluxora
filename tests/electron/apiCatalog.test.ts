import { describe, it, expect } from 'vitest'
import {
  API_CATALOG,
  CATALOG_CATEGORIES,
  CATALOG_VERIFIED_AT,
  findCatalogEntry,
} from '../../electron/services/apiDiscovery/catalog'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

describe('API catalog', () => {
  it('has exactly 20 entries across exactly 6 categories', () => {
    expect(API_CATALOG).toHaveLength(20)
    expect(CATALOG_CATEGORIES).toHaveLength(6)
    expect(new Set(API_CATALOG.map((entry) => entry.category))).toEqual(new Set(CATALOG_CATEGORIES))
  })

  it('uses unique ids and names', () => {
    expect(new Set(API_CATALOG.map((e) => e.id)).size).toBe(20)
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

  it('never claims an unlimited free tier', () => {
    for (const entry of API_CATALOG) {
      expect(entry.freeTier.toLowerCase()).not.toContain('unlimited')
      expect(entry.freeTier.length).toBeGreaterThan(10)
    }
  })

  it('describes real auth behavior', () => {
    for (const entry of API_CATALOG) {
      if (entry.auth.type === 'none') continue
      if (entry.auth.type === 'header') expect(entry.auth.name.length).toBeGreaterThan(0)
      if (entry.auth.type === 'query') expect(entry.auth.name.length).toBeGreaterThan(0)
    }
    expect(API_CATALOG.filter((e) => e.auth.type !== 'none').length).toBeGreaterThanOrEqual(3)
  })

  it('looks entries up by id', () => {
    expect(findCatalogEntry('github-rest')?.name).toBe('GitHub REST')
    expect(findCatalogEntry('nope')).toBeUndefined()
    expect(findCatalogEntry('../../etc/passwd')).toBeUndefined()
  })
})

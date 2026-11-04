import { describe, expect, it } from 'vitest'
import { sanitizeSettingsForExport } from '../../electron/services/secrets/serializer'
import {
  fingerprintSecret,
  maskFingerprint,
  validateProviderCredential,
} from '../../electron/services/secrets/validation'

describe('secret validation', () => {
  it('accepts a provider-shaped OpenAI key', () => {
    const result = validateProviderCredential('openai', 'OpenAI', 'sk-proj-abcdefghijklmnop')
    expect(result.ok).toBe(true)
    expect(result.normalized).toBe('sk-proj-abcdefghijklmnop')
    expect(result.fingerprint).toBe(fingerprintSecret(result.normalized!))
  })

  it('trims outer whitespace with a warning', () => {
    const result = validateProviderCredential('custom', 'Local', '  local-secret-value  ')
    expect(result.ok).toBe(true)
    expect(result.normalized).toBe('local-secret-value')
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('rejects empty values', () => {
    const result = validateProviderCredential('openai', 'OpenAI', '   ')
    expect(result.ok).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('rejects internal whitespace and control characters', () => {
    expect(validateProviderCredential('custom', 'Local', 'abc def ghi').ok).toBe(false)
    expect(validateProviderCredential('custom', 'Local', 'abc\u0000def').ok).toBe(false)
  })

  it('rejects values outside the length bounds', () => {
    expect(validateProviderCredential('custom', 'Local', 'short').ok).toBe(false)
    expect(validateProviderCredential('custom', 'Local', 'x'.repeat(4097)).ok).toBe(false)
  })

  it('rejects a known provider prefix mismatch', () => {
    const result = validateProviderCredential('openai', 'OpenAI', 'gsk_abcdefghijklmnop')
    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.toLowerCase().includes('openai'))).toBe(true)
  })

  it('rejects duplicate fingerprints', () => {
    const key = 'sk-proj-abcdefghijklmnop'
    const fingerprint = fingerprintSecret(key)
    const result = validateProviderCredential('openai', 'OpenAI', key, [fingerprint])
    expect(result.ok).toBe(false)
    expect(result.errors.some((error) => error.toLowerCase().includes('already'))).toBe(true)
  })

  it('masks a fingerprint without exposing the key', () => {
    const fingerprint = fingerprintSecret('sk-proj-abcdefghijklmnop')
    const masked = maskFingerprint(fingerprint)
    expect(masked.endsWith(fingerprint.slice(-4))).toBe(true)
    expect(masked).not.toContain('sk-proj')
  })
})

describe('sanitizeSettingsForExport', () => {
  it('removes secret-looking keys recursively', () => {
    const sanitized = sanitizeSettingsForExport({
      theme: 'dark',
      apiKey: 'secret',
      nested: {
        accessToken: 'secret',
        password: 'secret',
        keep: 'value',
      },
      list: [{ bearer: 'secret', safe: 'keep' }],
    }) as Record<string, unknown>

    expect(sanitized.theme).toBe('dark')
    expect(sanitized.apiKey).toBeUndefined()
    expect(sanitized.nested).toEqual({ keep: 'value' })
    expect(sanitized.list).toEqual([{ safe: 'keep' }])
  })

  it('preserves ordinary settings', () => {
    const input = { favoriteModels: ['gpt-4o'], terminal: { allowlist: ['npm'] } }
    expect(sanitizeSettingsForExport(input)).toEqual(input)
  })

  it('does not recurse without bound', () => {
    let nested: Record<string, unknown> = { value: 'deep' }
    for (let i = 0; i < 12; i += 1) nested = { nested }
    const result = sanitizeSettingsForExport(nested)
    expect(result).toBeDefined()
  })
})

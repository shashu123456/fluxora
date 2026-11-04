import { describe, expect, it } from 'vitest'
import {
  CURRENT_EXPORT_SCHEMA_VERSION,
  MAX_IMPORT_ITEMS,
  validateImportPayload,
} from '../../electron/services/dataTransfer/validation'

function validExport(overrides: Record<string, unknown> = {}) {
  return {
    app: 'fluxora',
    version: '1.0.0',
    schemaVersion: CURRENT_EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    secretExportMode: 'metadata-only',
    settings: { theme: 'dark' },
    providers: [],
    chats: [],
    messages: [],
    memories: [],
    prompts: [],
    workspaces: [],
    usage: [],
    notifications: [],
    ...overrides,
  }
}

describe('validateImportPayload', () => {
  it('accepts a minimal valid export', () => {
    const result = validateImportPayload(validExport())
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.data?.app).toBe('fluxora')
    expect(result.data?.schemaVersion).toBe(CURRENT_EXPORT_SCHEMA_VERSION)
  })

  it('rejects non-object input', () => {
    const result = validateImportPayload('not-json')
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain('JSON object')
  })

  it('rejects unsupported apps', () => {
    const result = validateImportPayload(validExport({ app: 'other-app' }))
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('Unsupported export format')
  })

  it('rejects unsupported schema versions', () => {
    const result = validateImportPayload(validExport({ schemaVersion: CURRENT_EXPORT_SCHEMA_VERSION + 1 }))
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain('Unsupported schema version')
  })

  it('warns for legacy exports without a schema version', () => {
    const result = validateImportPayload(validExport({ schemaVersion: undefined }))
    expect(result.ok).toBe(true)
    expect(result.warnings.some((warning) => warning.includes('Legacy export'))).toBe(true)
  })

  it('rejects oversized files before parsing fields', () => {
    const result = validateImportPayload(validExport(), 26 * 1024 * 1024)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain('25 MB')
  })

  it('rejects non-array collection fields', () => {
    const result = validateImportPayload(validExport({ providers: 'nope' }))
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('providers must be an array')
  })

  it('rejects collections above the item limit', () => {
    const result = validateImportPayload(validExport({ chats: new Array(MAX_IMPORT_ITEMS + 1).fill({}) }))
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain('item limit')
  })

  it('discards provider credentials and warns', () => {
    const result = validateImportPayload(
      validExport({
        providers: [
          {
            id: 'p1',
            name: 'OpenAI',
            type: 'openai',
            baseUrl: 'https://api.openai.com/v1',
            apiKey: 'sk-test-secret-value',
            models: [],
            enabled: true,
            isCustom: false,
            createdAt: 1,
            updatedAt: 2,
          },
        ],
      })
    )
    expect(result.ok).toBe(true)
    expect(result.data?.providers[0].apiKey).toBe('')
    expect(result.warnings.some((warning) => warning.includes('credential'))).toBe(true)
  })

  it('skips malformed providers and keeps valid ones', () => {
    const result = validateImportPayload(
      validExport({
        providers: [{ name: 'No id' }, { id: 'p2', name: 'Valid', type: 'anthropic' }],
      })
    )
    expect(result.ok).toBe(true)
    expect(result.data?.providers).toHaveLength(1)
    expect(result.data?.providers[0].id).toBe('p2')
    expect(result.warnings.some((warning) => warning.includes('malformed provider'))).toBe(true)
  })

  it('sanitizes secret metadata and strips unknown fields', () => {
    const result = validateImportPayload(
      validExport({
        providerSecrets: [
          {
            providerId: 'p1',
            providerConfigured: true,
            hasCredential: true,
            fingerprint: 'abc123',
            validationStatus: 'valid',
            health: 'configured',
            encrypted_payload: 'should-not-survive',
          },
        ],
      })
    )
    const metadata = result.data?.providerSecrets?.[0] as Record<string, unknown>
    expect(metadata?.providerId).toBe('p1')
    expect(metadata?.fingerprint).toBe('abc123')
    expect(metadata?.encrypted_payload).toBeUndefined()
  })

  it('removes secret-looking settings keys', () => {
    const result = validateImportPayload(
      validExport({
        settings: {
          theme: 'dark',
          apiKey: 'secret',
          nested: { accessToken: 'secret', safe: 'keep' },
        },
      })
    )
    const settings = result.data?.settings as Record<string, unknown>
    expect(settings.theme).toBe('dark')
    expect(settings.apiKey).toBeUndefined()
    expect(settings.nested).toEqual({ safe: 'keep' })
  })

  it('accepts legacy ai-workspace exports', () => {
    const result = validateImportPayload(validExport({ app: 'ai-workspace' }))
    expect(result.ok).toBe(true)
  })
})

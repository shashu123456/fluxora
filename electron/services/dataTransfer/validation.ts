import type { ImportExportData, ProviderConfig } from '../../../src/types'
import type { SecretMetadataExport } from '../../../src/types/secrets'
import { sanitizeSettingsForExport } from '../secrets/serializer'

export const CURRENT_EXPORT_SCHEMA_VERSION = 1
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024
export const MAX_IMPORT_ITEMS = 200_000

export interface ImportValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  counts: Record<string, number>
  data?: ImportExportData
}

const SUPPORTED_APPS = new Set(['ai-workspace', 'fluxora'])
const PROVIDER_TYPES = new Set(['openai', 'anthropic', 'gemini', 'custom'])
const ARRAY_FIELDS = [
  'providers',
  'chats',
  'messages',
  'memories',
  'prompts',
  'workspaces',
  'usage',
  'notifications',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function cleanString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function cleanNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function sanitizeProvider(value: unknown, warnings: string[]): ProviderConfig | null {
  if (!isRecord(value)) return null
  const id = cleanString(value.id).trim()
  if (!id) return null
  if (typeof value.apiKey === 'string' && value.apiKey.trim()) {
    warnings.push(`Provider "${id}" included a credential; it was discarded`)
  }
  const type = PROVIDER_TYPES.has(cleanString(value.type)) ? cleanString(value.type) : 'custom'
  return {
    id,
    name: cleanString(value.name, id),
    type: type as ProviderConfig['type'],
    baseUrl: cleanString(value.baseUrl),
    apiKey: '',
    models: Array.isArray(value.models) ? (value.models as ProviderConfig['models']) : [],
    enabled: value.enabled !== false,
    isCustom: value.isCustom !== false,
    color: typeof value.color === 'string' ? value.color : undefined,
    capabilities: isRecord(value.capabilities) ? (value.capabilities as unknown as ProviderConfig['capabilities']) : undefined,
    createdAt: cleanNumber(value.createdAt, Date.now()),
    updatedAt: cleanNumber(value.updatedAt, Date.now()),
  }
}

function sanitizeSecretMetadata(value: unknown): SecretMetadataExport | null {
  if (!isRecord(value)) return null
  const providerId = cleanString(value.providerId).trim()
  if (!providerId) return null
  const status = cleanString(value.validationStatus, 'unchecked')
  const health = cleanString(value.health, 'configured')
  return {
    providerId,
    providerConfigured: value.providerConfigured === true,
    hasCredential: value.hasCredential === true,
    fingerprint: typeof value.fingerprint === 'string' ? value.fingerprint : null,
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : null,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : null,
    lastRotatedAt: typeof value.lastRotatedAt === 'number' ? value.lastRotatedAt : null,
    validationStatus: status as SecretMetadataExport['validationStatus'],
    health: health as SecretMetadataExport['health'],
  }
}

export function validateImportPayload(input: unknown, sourceBytes = 0): ImportValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const counts: Record<string, number> = {}

  if (sourceBytes > MAX_IMPORT_BYTES) {
    return { ok: false, errors: ['Import file exceeds the 25 MB limit'], warnings, counts }
  }
  if (!isRecord(input)) {
    return { ok: false, errors: ['Import file must contain a JSON object'], warnings, counts }
  }
  if (!SUPPORTED_APPS.has(cleanString(input.app))) {
    errors.push('Unsupported export format')
  }

  const schemaVersion = cleanNumber(input.schemaVersion, 1)
  if (schemaVersion < 1 || schemaVersion > CURRENT_EXPORT_SCHEMA_VERSION) {
    errors.push(`Unsupported schema version ${schemaVersion}`)
  }
  if (input.schemaVersion === undefined) warnings.push('Legacy export without schemaVersion; treating as version 1')

  if (input.secretExportMode && input.secretExportMode !== 'metadata-only') {
    warnings.push('Secret export mode is not metadata-only; secret payloads were ignored')
  }

  if (!isRecord(input.settings)) {
    warnings.push('Missing settings object; defaults will remain in place')
  }

  const arrays: Record<string, unknown[]> = {}
  for (const field of ARRAY_FIELDS) {
    const value = input[field]
    if (value === undefined) {
      arrays[field] = []
      continue
    }
    if (!Array.isArray(value)) {
      errors.push(`${field} must be an array`)
      continue
    }
    if (value.length > MAX_IMPORT_ITEMS) {
      errors.push(`${field} exceeds the ${MAX_IMPORT_ITEMS.toLocaleString()} item limit`)
      continue
    }
    arrays[field] = value
    counts[field] = value.length
  }

  const providers: ProviderConfig[] = []
  for (const entry of arrays.providers || []) {
    const provider = sanitizeProvider(entry, warnings)
    if (provider) providers.push(provider)
    else warnings.push('Skipped a malformed provider entry')
  }
  counts.providers = providers.length

  const providerSecrets: SecretMetadataExport[] = []
  if (Array.isArray(input.providerSecrets)) {
    for (const entry of input.providerSecrets) {
      const metadata = sanitizeSecretMetadata(entry)
      if (metadata) providerSecrets.push(metadata)
    }
  }
  counts.providerSecrets = providerSecrets.length

  if (errors.length > 0) {
    return { ok: false, errors, warnings, counts }
  }

  const settings = isRecord(input.settings)
    ? (sanitizeSettingsForExport(input.settings) as ImportExportData['settings'])
    : ({} as ImportExportData['settings'])

  return {
    ok: true,
    errors,
    warnings,
    counts,
    data: {
      app: 'fluxora',
      version: cleanString(input.version, '1.0.0'),
      schemaVersion: CURRENT_EXPORT_SCHEMA_VERSION,
      exportedAt: cleanString(input.exportedAt, new Date().toISOString()),
      secretExportMode: 'metadata-only',
      providerSecrets,
      settings,
      providers,
      chats: (arrays.chats || []) as ImportExportData['chats'],
      messages: (arrays.messages || []) as ImportExportData['messages'],
      memories: (arrays.memories || []) as ImportExportData['memories'],
      prompts: (arrays.prompts || []) as ImportExportData['prompts'],
      workspaces: (arrays.workspaces || []) as ImportExportData['workspaces'],
      usage: (arrays.usage || []) as ImportExportData['usage'],
      notifications: (arrays.notifications || []) as ImportExportData['notifications'],
    },
  }
}

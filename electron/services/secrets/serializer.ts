import type {
  ProviderSecretMetadata,
  SecretMetadataExport,
} from '../../../src/types/secrets'
import { toSecretMetadataExport } from './metadata'

const SECRET_KEY_PATTERN = /(api[-_]?key|apikey|token|secret|password|passwd|credential|authorization|bearer)/i

export function sanitizeSettingsForExport(value: unknown, depth = 0): unknown {
  if (depth > 8) return undefined
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeSettingsForExport(entry, depth + 1))
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(key)) continue
      output[key] = sanitizeSettingsForExport(entry, depth + 1)
    }
    return output
  }
  return value
}

export function serializeSecretMetadata(metadata: ProviderSecretMetadata): SecretMetadataExport {
  return toSecretMetadataExport(metadata)
}

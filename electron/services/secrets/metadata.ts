import type {
  ProviderSecretMetadata,
  SecretMetadataExport,
  SecretStorageMode,
  SecretValidationStatus,
} from '../../../src/types/secrets'
import { maskFingerprint } from './validation'

export interface SecretRecordRow {
  owner_type: string
  owner_id: string
  kind: string
  encrypted_payload: string
  version: number
  fingerprint: string
  storage_mode: SecretStorageMode
  validation_status: SecretValidationStatus
  created_at: number
  updated_at: number
  last_used_at: number | null
  last_rotated_at: number | null
  last_validated_at: number | null
  expires_at: number | null
}

export const PROVIDER_OWNER_TYPE = 'provider'
export const PROVIDER_SECRET_KIND = 'api-key'

export function rotationAgeDays(timestamp: number | null | undefined, now = Date.now()): number | null {
  if (!timestamp) return null
  return Math.max(0, Math.floor((now - timestamp) / 86_400_000))
}

export function missingProviderSecretMetadata(providerId: string): ProviderSecretMetadata {
  return {
    providerId,
    configured: false,
    hasCredential: false,
    fingerprint: null,
    maskedFingerprint: null,
    version: 0,
    storageMode: null,
    validationStatus: 'unchecked',
    health: 'missing',
    createdAt: null,
    updatedAt: null,
    lastUsedAt: null,
    lastRotatedAt: null,
    lastValidatedAt: null,
    expiresAt: null,
    rotationAgeDays: null,
  }
}

export function buildProviderSecretMetadata(
  providerId: string,
  row: SecretRecordRow | undefined,
  now = Date.now()
): ProviderSecretMetadata {
  if (!row) return missingProviderSecretMetadata(providerId)
  const expired = row.expires_at !== null && row.expires_at <= now
  return {
    providerId,
    configured: true,
    hasCredential: true,
    fingerprint: row.fingerprint,
    maskedFingerprint: maskFingerprint(row.fingerprint),
    version: row.version,
    storageMode: row.storage_mode,
    validationStatus: row.validation_status,
    health: expired ? 'expired' : row.validation_status === 'invalid' ? 'needs-attention' : 'configured',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at,
    lastRotatedAt: row.last_rotated_at,
    lastValidatedAt: row.last_validated_at,
    expiresAt: row.expires_at,
    rotationAgeDays: rotationAgeDays(row.last_rotated_at ?? row.created_at, now),
  }
}

export function toSecretMetadataExport(metadata: ProviderSecretMetadata): SecretMetadataExport {
  return {
    providerId: metadata.providerId,
    providerConfigured: metadata.configured,
    hasCredential: metadata.hasCredential,
    fingerprint: metadata.fingerprint,
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
    lastRotatedAt: metadata.lastRotatedAt,
    validationStatus: metadata.validationStatus,
    health: metadata.health,
  }
}

export type SecretOwnerType = 'provider' | 'oauth' | 'workspace' | 'plugin' | 'mcp' | 'ssh'

export type SecretStorageMode = 'os' | 'local-fallback'

export type SecretValidationStatus = 'valid' | 'invalid' | 'unchecked'

export type SecretHealthStatus = 'configured' | 'missing' | 'needs-attention' | 'expired'

export interface SecretOwner {
  type: SecretOwnerType
  id: string
  kind?: string
}

export interface ProviderSecretMetadata {
  providerId: string
  configured: boolean
  hasCredential: boolean
  fingerprint: string | null
  maskedFingerprint: string | null
  version: number
  storageMode: SecretStorageMode | null
  validationStatus: SecretValidationStatus
  health: SecretHealthStatus
  createdAt: number | null
  updatedAt: number | null
  lastUsedAt: number | null
  lastRotatedAt: number | null
  lastValidatedAt: number | null
  expiresAt: number | null
  rotationAgeDays: number | null
}

export interface SecretValidationResult {
  ok: boolean
  normalized: string
  fingerprint?: string
  errors: string[]
  warnings: string[]
}

export interface SecretMigrationDetail {
  providerId: string
  outcome: 'migrated' | 'already-secure' | 'cleared' | 'missing' | 'failed'
  message?: string
}

export interface SecretMigrationReport {
  scanned: number
  migrated: number
  alreadySecure: number
  cleared: number
  missing: number
  failed: number
  details: SecretMigrationDetail[]
}

export interface SecretMetadataExport {
  providerId: string
  providerConfigured: boolean
  hasCredential: boolean
  fingerprint: string | null
  createdAt: number | null
  updatedAt: number | null
  lastRotatedAt: number | null
  validationStatus: SecretValidationStatus
  health: SecretHealthStatus
}

export interface SecretVaultExportEntry {
  owner: SecretOwner
  payload: string
  version: number
  fingerprint: string
  createdAt: number
  updatedAt: number
  lastRotatedAt: number | null
}

export type SecretBackupMode = 'metadata-only' | 'encrypted-vault'

export interface SecretVaultExport {
  mode: SecretBackupMode
  version: 1
  createdAt: number
  entries: SecretVaultExportEntry[]
  metadata?: SecretMetadataExport[]
}

import { all, get, run } from '../../database'
import type { ProviderSecretMetadata, SecretValidationResult } from '../../../src/types/secrets'
import {
  buildProviderSecretMetadata,
  missingProviderSecretMetadata,
  PROVIDER_OWNER_TYPE,
  PROVIDER_SECRET_KIND,
  type SecretRecordRow,
} from './metadata'
import { getSecretVault } from './vault'
import { validateProviderCredential } from './validation'

function now(): number {
  return Date.now()
}

function toRow(row: any): SecretRecordRow | undefined {
  if (!row) return undefined
  return {
    owner_type: row.owner_type,
    owner_id: row.owner_id,
    kind: row.kind,
    encrypted_payload: row.encrypted_payload,
    version: row.version,
    fingerprint: row.fingerprint,
    storage_mode: row.storage_mode,
    validation_status: row.validation_status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_used_at: row.last_used_at,
    last_rotated_at: row.last_rotated_at,
    last_validated_at: row.last_validated_at,
    expires_at: row.expires_at,
  }
}

export class SecretManager {
  async getProviderMetadata(providerId: string): Promise<ProviderSecretMetadata> {
    const row = await get<any>(
      `SELECT * FROM secret_records WHERE owner_type = ? AND owner_id = ? AND kind = ?`,
      [PROVIDER_OWNER_TYPE, providerId, PROVIDER_SECRET_KIND]
    )
    return buildProviderSecretMetadata(providerId, toRow(row))
  }

  async listProviderMetadata(): Promise<ProviderSecretMetadata[]> {
    const rows = await all<any>(
      `SELECT * FROM secret_records WHERE owner_type = ? AND kind = ? ORDER BY updated_at DESC`,
      [PROVIDER_OWNER_TYPE, PROVIDER_SECRET_KIND]
    )
    const result: ProviderSecretMetadata[] = []
    for (const row of rows) {
      result.push(buildProviderSecretMetadata(row.owner_id, toRow(row)))
    }
    return result
  }

  async getProviderSecret(providerId: string): Promise<string | undefined> {
    const row = await get<any>(
      `SELECT * FROM secret_records WHERE owner_type = ? AND owner_id = ? AND kind = ?`,
      [PROVIDER_OWNER_TYPE, providerId, PROVIDER_SECRET_KIND]
    )
    const record = toRow(row)
    if (!record) return undefined
    const vault = getSecretVault()
    const secret = vault.open(record.encrypted_payload)
    await run(
      `UPDATE secret_records SET last_used_at = ? WHERE owner_type = ? AND owner_id = ? AND kind = ?`,
      [now(), PROVIDER_OWNER_TYPE, providerId, PROVIDER_SECRET_KIND]
    )
    return secret
  }

  async withProviderSecret<T>(providerId: string, fn: (secret: string | undefined) => Promise<T>): Promise<T> {
    const secret = await this.getProviderSecret(providerId)
    try {
      return await fn(secret)
    } finally {
      if (secret) {
        // Zeroize by overwriting - in practice GC will collect, but we can try
        // JS strings are immutable; best effort
      }
    }
  }

  async setProviderSecret(
    providerId: string,
    providerType: string,
    providerName: string,
    value: string
  ): Promise<{ metadata: ProviderSecretMetadata; validation: SecretValidationResult }> {
    const otherFingerprints = (await this.listProviderMetadata())
      .filter((entry) => entry.providerId !== providerId)
      .map((entry) => entry.fingerprint)
      .filter((fingerprint): fingerprint is string => !!fingerprint)
    const validation = validateProviderCredential(providerType, providerName, value, otherFingerprints)
    if (!validation.ok || !validation.fingerprint) {
      throw new Error(validation.errors.join('; ') || 'Invalid credential')
    }

    const vault = getSecretVault()
    const sealed = vault.seal(validation.normalized)
    const timestamp = now()
    const existing = await get<any>(
      `SELECT * FROM secret_records WHERE owner_type = ? AND owner_id = ? AND kind = ?`,
      [PROVIDER_OWNER_TYPE, providerId, PROVIDER_SECRET_KIND]
    )

    if (existing) {
      await run(
        `UPDATE secret_records SET encrypted_payload = ?, version = version + 1, fingerprint = ?, storage_mode = ?, validation_status = ?, updated_at = ?, last_rotated_at = ?, last_validated_at = NULL WHERE owner_type = ? AND owner_id = ? AND kind = ?`,
        [
          sealed.payload,
          validation.fingerprint,
          sealed.storageMode,
          'unchecked',
          timestamp,
          timestamp,
          PROVIDER_OWNER_TYPE,
          providerId,
          PROVIDER_SECRET_KIND,
        ]
      )
    } else {
      await run(
        `INSERT INTO secret_records (owner_type, owner_id, kind, encrypted_payload, version, fingerprint, storage_mode, validation_status, created_at, updated_at, last_used_at, last_rotated_at, last_validated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          PROVIDER_OWNER_TYPE,
          providerId,
          PROVIDER_SECRET_KIND,
          sealed.payload,
          1,
          validation.fingerprint,
          sealed.storageMode,
          'unchecked',
          timestamp,
          timestamp,
          null,
          timestamp,
          null,
          null,
        ]
      )
    }

    return {
      metadata: await this.getProviderMetadata(providerId),
      validation,
    }
  }

  async rotateProviderSecret(providerId: string): Promise<ProviderSecretMetadata> {
    const row = await get<any>(
      `SELECT * FROM secret_records WHERE owner_type = ? AND owner_id = ? AND kind = ?`,
      [PROVIDER_OWNER_TYPE, providerId, PROVIDER_SECRET_KIND]
    )
    const record = toRow(row)
    if (!record) throw new Error('No credential is configured for this provider')

    const vault = getSecretVault()
    const plain = vault.openToBuffer(record.encrypted_payload)
    try {
      const sealed = vault.seal(plain.toString('utf8'))
      const timestamp = now()
      await run(
        `UPDATE secret_records SET encrypted_payload = ?, version = version + 1, storage_mode = ?, updated_at = ?, last_rotated_at = ? WHERE owner_type = ? AND owner_id = ? AND kind = ?`,
        [sealed.payload, sealed.storageMode, timestamp, timestamp, PROVIDER_OWNER_TYPE, providerId, PROVIDER_SECRET_KIND]
      )
    } finally {
      plain.fill(0)
    }

    return this.getProviderMetadata(providerId)
  }

  async recordValidation(providerId: string, ok: boolean): Promise<ProviderSecretMetadata> {
    const timestamp = now()
    await run(
      `UPDATE secret_records SET validation_status = ?, last_validated_at = ?, updated_at = ? WHERE owner_type = ? AND owner_id = ? AND kind = ?`,
      [ok ? 'valid' : 'invalid', timestamp, timestamp, PROVIDER_OWNER_TYPE, providerId, PROVIDER_SECRET_KIND]
    )
    return this.getProviderMetadata(providerId)
  }

  async removeProviderSecret(providerId: string): Promise<void> {
    await run(
      `DELETE FROM secret_records WHERE owner_type = ? AND owner_id = ? AND kind = ?`,
      [PROVIDER_OWNER_TYPE, providerId, PROVIDER_SECRET_KIND]
    )
  }

  async hasProviderSecret(providerId: string): Promise<boolean> {
    const row = await get<any>(
      `SELECT 1 FROM secret_records WHERE owner_type = ? AND owner_id = ? AND kind = ?`,
      [PROVIDER_OWNER_TYPE, providerId, PROVIDER_SECRET_KIND]
    )
    return !!row
  }

  async testProviderSecret(providerId: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const secret = await this.getProviderSecret(providerId)
      if (!secret) return { ok: false, error: 'No credential configured' }
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Failed to retrieve credential' }
    }
  }

  async clearAll(): Promise<void> {
    await run(`DELETE FROM secret_records`)
  }

  async getAllProviderRows(): Promise<SecretRecordRow[]> {
    const rows = await all<any>(
      `SELECT * FROM secret_records WHERE owner_type = ? AND kind = ?`,
      [PROVIDER_OWNER_TYPE, PROVIDER_SECRET_KIND]
    )
    return rows.map((r) => toRow(r)).filter((r): r is SecretRecordRow => !!r)
  }
}

let singleton: SecretManager | null = null

export function getSecretManager(): SecretManager {
  if (!singleton) singleton = new SecretManager()
  return singleton
}

export function resetSecretManagerForTests(): void {
  singleton = null
}

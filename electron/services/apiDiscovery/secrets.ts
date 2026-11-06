import { createHash } from 'node:crypto'
import { get, run } from '../../database'
import { getSecretVault } from '../secrets/vault'

const OWNER_TYPE = 'api'
const SECRET_KIND = 'api-key'

export function fingerprintSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}

export async function hasApiSecret(apiId: string): Promise<boolean> {
  const row = await get<any>(
    `SELECT 1 AS present FROM secret_records WHERE owner_type = ? AND owner_id = ? AND kind = ?`,
    [OWNER_TYPE, apiId, SECRET_KIND]
  )
  return !!row
}

export async function getApiSecretFingerprint(apiId: string): Promise<string | null> {
  const row = await get<any>(
    `SELECT fingerprint FROM secret_records WHERE owner_type = ? AND owner_id = ? AND kind = ?`,
    [OWNER_TYPE, apiId, SECRET_KIND]
  )
  return row?.fingerprint ?? null
}

export async function getApiSecret(apiId: string): Promise<string | undefined> {
  const row = await get<any>(
    `SELECT encrypted_payload FROM secret_records WHERE owner_type = ? AND owner_id = ? AND kind = ?`,
    [OWNER_TYPE, apiId, SECRET_KIND]
  )
  if (!row?.encrypted_payload) return undefined
  try {
    return getSecretVault().open(row.encrypted_payload)
  } catch {
    return undefined
  }
}

export async function setApiSecret(apiId: string, value: string): Promise<string> {
  const sealed = getSecretVault().seal(value)
  const fingerprint = fingerprintSecret(value)
  const now = Date.now()
  await run(
    `INSERT INTO secret_records
       (owner_type, owner_id, kind, encrypted_payload, version, fingerprint, storage_mode, validation_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, 'unchecked', ?, ?)
     ON CONFLICT(owner_type, owner_id, kind) DO UPDATE SET
       encrypted_payload = excluded.encrypted_payload,
       version = version + 1,
       fingerprint = excluded.fingerprint,
       storage_mode = excluded.storage_mode,
       updated_at = excluded.updated_at`,
    [OWNER_TYPE, apiId, SECRET_KIND, sealed.payload, fingerprint, sealed.storageMode, now, now]
  )
  return fingerprint
}

export async function removeApiSecret(apiId: string): Promise<void> {
  await run(`DELETE FROM secret_records WHERE owner_type = ? AND owner_id = ? AND kind = ?`, [
    OWNER_TYPE,
    apiId,
    SECRET_KIND,
  ])
}

import { safeStorage } from 'electron'
import { all, get, run } from '../../database'
import { getSecretManager } from './manager'
import type { SecretMigrationReport } from '../../../src/types/secrets'

function decodeLegacySecret(stored: string): string {
  if (stored.startsWith('enc:v1:')) {
    return safeStorage.decryptString(Buffer.from(stored.slice('enc:v1:'.length), 'base64'))
  }
  if (stored.startsWith('plain:')) {
    return stored.slice('plain:'.length)
  }
  return stored
}

export async function migrateLegacyProviderSecrets(): Promise<SecretMigrationReport> {
  const manager = getSecretManager()
  const rows = await all<any>('SELECT id, name, type, api_key FROM providers')
  const report: SecretMigrationReport = {
    scanned: rows.length,
    migrated: 0,
    alreadySecure: 0,
    cleared: 0,
    missing: 0,
    failed: 0,
    details: [],
  }

  for (const row of rows) {
    const id = row.id
    const stored = row.api_key
    if (!stored) {
      report.missing++
      report.details.push({ providerId: id, outcome: 'missing' })
      continue
    }

    try {
      // Check if already migrated
      if (await manager.hasProviderSecret(id)) {
        report.alreadySecure++
        report.details.push({ providerId: id, outcome: 'already-secure' })
        continue
      }

      let plain = ''
      try {
        plain = decodeLegacySecret(stored).trim()
      } catch {
        plain = ''
      }

      if (!plain) {
        // clear legacy plaintext
        await run('UPDATE providers SET api_key = ? WHERE id = ?', ['', id])
        report.cleared++
        report.details.push({ providerId: id, outcome: 'cleared', message: 'Cleared invalid legacy credential' })
        continue
      }

      try {
        await manager.setProviderSecret(id, row.type || 'custom', row.name || id, plain)
        // Clear legacy api_key in providers table
        await run('UPDATE providers SET api_key = ? WHERE id = ?', ['', id])
        report.migrated++
        report.details.push({ providerId: id, outcome: 'migrated' })
      } catch (error) {
        report.failed++
        report.details.push({
          providerId: id,
          outcome: 'failed',
          message: error instanceof Error ? error.message : 'Migration failed',
        })
      }
    } catch (error) {
      report.failed++
      report.details.push({
        providerId: id,
        outcome: 'failed',
        message: error instanceof Error ? error.message : 'Migration failed',
      })
    }
  }

  return report
}

export async function ensureProviderSecretsEmpty(): Promise<void> {
  await run('UPDATE providers SET api_key = ? WHERE api_key != ?', ['', ''])
}

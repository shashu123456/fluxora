import { describe, it, expect, beforeEach, afterEach } from 'vitest'
process.env.FLUXORA_TEST_DB = 'test-secrets.db'

// Mock Electron config before any module that imports it loads
vi.mock('../../electron/config', () => ({
  getDataDir: () => process.cwd(),
  ensureDataDir: () => process.cwd(),
  setDataDir: () => {},
  isPortableMode: () => false,
  getPortableDir: () => process.cwd(),
}))

vi.mock('../../electron/services/secrets/vault', () => {
  const mockVault = {
    seal: (value: string) => ({
      payload: Buffer.from(value).toString('base64'),
      storageMode: 'plaintext' as const,
    }),
    open: (payload: string) => {
      try { return Buffer.from(payload, 'base64').toString('utf8') } catch { return '' }
    },
  }
  return {
    getSecretVault: () => mockVault,
    resetSecretVaultForTests: () => {},
  }
})

vi.mock('../../electron/services/secrets/keyProvider', () => ({
  OsKeyProvider: class { mode = 'os' as const; isAvailable() { return true } encrypt() { return Buffer.from([]) } decrypt() { return Buffer.from([]) } },
  LocalFallbackKeyProvider: class { mode = 'plaintext' as const; isAvailable() { return true } encrypt() { return Buffer.from([]) } decrypt() { return Buffer.from([]) } },
}))

import { getApiSecret, getApiSecretFingerprint, hasApiSecret, removeApiSecret, setApiSecret, fingerprintSecret } from '../../electron/services/apiDiscovery/secrets'

describe('API secret vault', () => {
  const TEST_API_ID = 'github-rest'
  const TEST_KEY = 'ghp_test_key_that_should_be_sealed_but_not_in_plaintext_artificially_long_enough_1234567890'

  beforeEach(async () => {
    const { initDatabase } = await import('../../electron/database')
    await initDatabase()
    const { resetSecretVaultForTests } = await import('../../electron/services/secrets/vault')
    resetSecretVaultForTests()
  })

  afterEach(async () => {
    const { closeDatabase } = await import('../../electron/database')
    try { await closeDatabase() } catch {}
    if (import.meta.env?.VIEM || false) { /* skip */ }
    try { require('fs').unlinkSync('test-secrets.db') } catch {}
    try { require('fs').unlinkSync('test-secrets.db-wal') } catch {}
    try { require('fs').unlinkSync('test-secrets.db-shm') } catch {}
  })

  it('fingerprints a secret to a 12-char hex prefix', () => {
    const fp = fingerprintSecret(TEST_KEY)
    expect(fp).toHaveLength(12)
    expect(fp).toMatch(/^[0-9a-f]{12}$/i)
    expect(fingerprintSecret(TEST_KEY)).toBe(fingerprintSecret(TEST_KEY))
    expect(fingerprintSecret('different-key')).not.toBe(fp)
  })

  it('round-trips a secret through set then get', async () => {
    const fp = await setApiSecret(TEST_API_ID, TEST_KEY)
    expect(fp).toBe(fingerprintSecret(TEST_KEY))

    const stored = await getApiSecret(TEST_API_ID)
    expect(stored).toBe(TEST_KEY)

    await removeApiSecret(TEST_API_ID)
    expect(await getApiSecret(TEST_API_ID)).toBeUndefined()
  })

  it('replaces an existing secret on the second set', async () => {
    await setApiSecret(TEST_API_ID, TEST_KEY)
    const fp1 = await getApiSecretFingerprint(TEST_API_ID)
    expect(fp1).toBe(fingerprintSecret(TEST_KEY))

    const NEW_KEY = 'new-key-value-12345678901234567890'
    await setApiSecret(TEST_API_ID, NEW_KEY)
    expect(await getApiSecret(TEST_API_ID)).toBe(NEW_KEY)
    expect(await getApiSecretFingerprint(TEST_API_ID)).toBe(fingerprintSecret(NEW_KEY))

    await removeApiSecret(TEST_API_ID)
  })

  it('removes the secret and confirms it is gone', async () => {
    await setApiSecret(TEST_API_ID, TEST_KEY)
    expect(await hasApiSecret(TEST_API_ID)).toBe(true)

    await removeApiSecret(TEST_API_ID)
    expect(await hasApiSecret(TEST_API_ID)).toBe(false)
    expect(await getApiSecretFingerprint(TEST_API_ID)).toBeNull()
    expect(await getApiSecret(TEST_API_ID)).toBeUndefined()
  })

  it('reports no secret when none was stored', async () => {
    expect(await hasApiSecret('nonexistent-api')).toBe(false)
    expect(await getApiSecretFingerprint('nonexistent-api')).toBeNull()
    expect(await getApiSecret('nonexistent-api')).toBeUndefined()
  })
})

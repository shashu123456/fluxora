import { safeStorage } from 'electron'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import fs from 'fs'
import path from 'path'
import { getDataDir } from '../../config'
import type { SecretStorageMode } from '../../../src/types/secrets'

export interface KeyProvider {
  readonly mode: SecretStorageMode
  isAvailable(): boolean
  encrypt(plain: Buffer): Buffer
  decrypt(cipher: Buffer): Buffer
}

export class OsKeyProvider implements KeyProvider {
  readonly mode = 'os' as const

  isAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  }

  encrypt(plain: Buffer): Buffer {
    if (!this.isAvailable()) throw new Error('OS credential encryption is unavailable')
    return safeStorage.encryptString(plain.toString('utf8'))
  }

  decrypt(cipher: Buffer): Buffer {
    return Buffer.from(safeStorage.decryptString(cipher), 'utf8')
  }
}

const FALLBACK_KEY_BYTES = 32
const FALLBACK_IV_BYTES = 12
const FALLBACK_TAG_BYTES = 16

function fallbackKeyPath(): string {
  return path.join(getDataDir(), 'secrets', 'vault.key')
}

export function deleteLocalFallbackKey(): void {
  try {
    fs.unlinkSync(fallbackKeyPath())
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

function readFallbackKey(): Buffer {
  const keyPath = fallbackKeyPath()
  if (fs.existsSync(keyPath)) {
    const key = fs.readFileSync(keyPath)
    if (key.length !== FALLBACK_KEY_BYTES) {
      throw new Error('Local credential key is corrupt')
    }
    return key
  }

  fs.mkdirSync(path.dirname(keyPath), { recursive: true, mode: 0o700 })
  const key = randomBytes(FALLBACK_KEY_BYTES)
  fs.writeFileSync(keyPath, key, { mode: 0o600 })
  try {
    fs.chmodSync(keyPath, 0o600)
  } catch {
    // Windows ACLs are managed by the user profile directory.
  }
  return key
}

/**
 * Last-resort encrypted fallback for systems without an OS credential store.
 * The AES key lives outside the database in a user-only application directory.
 * It is never plaintext, but it is not hardware-backed; health surfaces this mode.
 */
export class LocalFallbackKeyProvider implements KeyProvider {
  readonly mode = 'local-fallback' as const
  private cachedKey: Buffer | null = null

  isAvailable(): boolean {
    try {
      this.key()
      return true
    } catch {
      return false
    }
  }

  private key(): Buffer {
    if (!this.cachedKey) this.cachedKey = readFallbackKey()
    return this.cachedKey
  }

  encrypt(plain: Buffer): Buffer {
    const iv = randomBytes(FALLBACK_IV_BYTES)
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv)
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted])
  }

  decrypt(cipher: Buffer): Buffer {
    if (cipher.length <= FALLBACK_IV_BYTES + FALLBACK_TAG_BYTES) {
      throw new Error('Encrypted credential payload is invalid')
    }
    const iv = cipher.subarray(0, FALLBACK_IV_BYTES)
    const tag = cipher.subarray(FALLBACK_IV_BYTES, FALLBACK_IV_BYTES + FALLBACK_TAG_BYTES)
    const payload = cipher.subarray(FALLBACK_IV_BYTES + FALLBACK_TAG_BYTES)
    const decipher = createDecipheriv('aes-256-gcm', this.key(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(payload), decipher.final()])
  }
}

export function getPreferredStorageMode(): SecretStorageMode {
  return new OsKeyProvider().isAvailable() ? 'os' : 'local-fallback'
}

import { safeStorage } from 'electron'

const ENC_PREFIX = 'enc:v1:'
const PLAIN_PREFIX = 'plain:'

export function encryptSecret(plain: string | undefined | null): string {
  if (!plain) return ''
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return ENC_PREFIX + safeStorage.encryptString(plain).toString('base64')
    }
  } catch {
    // fall through to obfuscated-plaintext fallback
  }
  return PLAIN_PREFIX + plain
}

export function decryptSecret(stored: string | undefined | null): string {
  if (!stored) return ''
  try {
    if (stored.startsWith(ENC_PREFIX)) {
      return safeStorage.decryptString(Buffer.from(stored.slice(ENC_PREFIX.length), 'base64'))
    }
    if (stored.startsWith(PLAIN_PREFIX)) {
      return stored.slice(PLAIN_PREFIX.length)
    }
  } catch {
    // legacy or undecryptable value: return as-is only for legacy plaintext
    if (stored.startsWith(PLAIN_PREFIX)) return stored.slice(PLAIN_PREFIX.length)
  }
  return stored
}

export function hasSecret(stored: string | undefined | null): boolean {
  return !!stored && stored.length > 0
}

export function isEncryptedSecret(stored: string): boolean {
  return stored.startsWith(ENC_PREFIX)
}
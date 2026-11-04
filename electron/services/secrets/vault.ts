import type { SecretStorageMode } from '../../../src/types/secrets'
import {
  LocalFallbackKeyProvider,
  OsKeyProvider,
  type KeyProvider,
} from './keyProvider'

const ENVELOPE_PREFIX = 'fv1'

export interface SealedSecret {
  payload: string
  storageMode: SecretStorageMode
}

export class SecretVault {
  private providers: Partial<Record<SecretStorageMode, KeyProvider>>
  private preferred: SecretStorageMode

  constructor(
    providers: Partial<Record<SecretStorageMode, KeyProvider>>,
    preferred: SecretStorageMode
  ) {
    if (!providers[preferred]) throw new Error('Preferred credential key provider is unavailable')
    this.providers = providers
    this.preferred = preferred
  }

  get storageMode(): SecretStorageMode {
    return this.preferred
  }

  seal(plain: string): SealedSecret {
    if (!plain) throw new Error('Cannot seal an empty credential')
    const provider = this.providers[this.preferred]
    if (!provider) throw new Error('Credential key provider is unavailable')

    const source = Buffer.from(plain, 'utf8')
    try {
      const cipher = provider.encrypt(source)
      return {
        payload: `${ENVELOPE_PREFIX}:${provider.mode}:${cipher.toString('base64')}`,
        storageMode: provider.mode,
      }
    } finally {
      source.fill(0)
    }
  }

  openToBuffer(payload: string): Buffer {
    const [prefix, mode, encoded] = payload.split(':')
    if (prefix !== ENVELOPE_PREFIX || !mode || !encoded) {
      throw new Error('Unsupported encrypted credential format')
    }
    const provider = this.providers[mode as SecretStorageMode]
    if (!provider) throw new Error(`Credential key provider is unavailable: ${mode}`)
    return provider.decrypt(Buffer.from(encoded, 'base64'))
  }

  open(payload: string): string {
    const plain = this.openToBuffer(payload)
    try {
      return plain.toString('utf8')
    } finally {
      plain.fill(0)
    }
  }
}

let singleton: SecretVault | null = null

export function createSecretVault(): SecretVault {
  const providers: Partial<Record<SecretStorageMode, KeyProvider>> = {}
  const os = new OsKeyProvider()
  if (os.isAvailable()) providers.os = os
  const fallback = new LocalFallbackKeyProvider()
  if (fallback.isAvailable()) providers['local-fallback'] = fallback

  const preferred: SecretStorageMode = providers.os ? 'os' : 'local-fallback'
  return new SecretVault(providers, preferred)
}

export function getSecretVault(): SecretVault {
  if (!singleton) singleton = createSecretVault()
  return singleton
}

export function resetSecretVaultForTests(): void {
  singleton = null
}

import { createHash } from 'crypto'
import type { SecretValidationResult } from '../../../src/types/secrets'

interface KnownPrefix {
  provider: string
  prefixes: string[]
}

const KNOWN_PREFIXES: KnownPrefix[] = [
  { provider: 'anthropic', prefixes: ['sk-ant-'] },
  { provider: 'openrouter', prefixes: ['sk-or-'] },
  { provider: 'openai', prefixes: ['sk-proj-', 'sk-'] },
  { provider: 'groq', prefixes: ['gsk_'] },
  { provider: 'gemini', prefixes: ['AIza'] },
]

const EXPECTED_PREFIX: Record<string, string[]> = {
  openai: ['sk-proj-', 'sk-'],
  anthropic: ['sk-ant-'],
  gemini: ['AIza'],
  groq: ['gsk_'],
  openrouter: ['sk-or-'],
}

const MIN_SECRET_LENGTH = 8
const MAX_SECRET_LENGTH = 4096
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

export function fingerprintSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex')
}

export function maskFingerprint(fingerprint: string | null | undefined): string | null {
  if (!fingerprint) return null
  return `••••${fingerprint.slice(-4)}`
}

export function detectSecretProvider(secret: string): string | null {
  for (const entry of KNOWN_PREFIXES) {
    if (entry.prefixes.some((prefix) => secret.startsWith(prefix))) return entry.provider
  }
  return null
}

export function validateProviderCredential(
  providerType: string,
  providerName: string,
  value: unknown,
  existingFingerprints: string[] = []
): SecretValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const label = providerName || providerType || 'provider'

  if (typeof value !== 'string') {
    return { ok: false, normalized: '', errors: ['Credential must be a string'], warnings }
  }

  const normalized = value.trim()
  if (normalized.length === 0) {
    return { ok: false, normalized: '', errors: ['Credential is empty'], warnings }
  }
  if (normalized !== value) {
    warnings.push('Trimmed accidental whitespace from the credential')
  }
  if (/\s/.test(normalized)) {
    errors.push('Credential contains whitespace')
  }
  if (CONTROL_CHARS.test(normalized)) {
    errors.push('Credential contains control characters')
  }
  if (normalized.length < MIN_SECRET_LENGTH) {
    errors.push(`Credential is shorter than ${MIN_SECRET_LENGTH} characters`)
  }
  if (normalized.length > MAX_SECRET_LENGTH) {
    errors.push(`Credential exceeds ${MAX_SECRET_LENGTH} characters`)
  }

  const fingerprint = fingerprintSecret(normalized)
  if (existingFingerprints.includes(fingerprint)) {
    errors.push('Credential is already used by another provider')
  }

  const detected = detectSecretProvider(normalized)
  const expected = EXPECTED_PREFIX[providerType]
  if (expected && !expected.some((prefix) => normalized.startsWith(prefix))) {
    if (detected && detected !== providerType) {
      errors.push(`Credential appears to belong to ${detected}, not ${label}`)
    } else if (!detected) {
      warnings.push(`Credential does not match the usual ${label} prefix`)
    }
  }

  return {
    ok: errors.length === 0,
    normalized,
    fingerprint,
    errors,
    warnings,
  }
}

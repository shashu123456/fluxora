export type ApiErrorCode =
  | 'unknown_api'
  | 'auth_required'
  | 'invalid_secret'
  | 'blocked_private_address'
  | 'blocked_redirect'
  | 'invalid_url'
  | 'timeout'
  | 'too_large'
  | 'unsupported_content_type'
  | 'rate_limited'
  | 'http_error'
  | 'network_error'
  | 'catalog_invalid'

export class ApiDiscoveryError extends Error {
  readonly code: ApiErrorCode

  constructor(code: ApiErrorCode, message: string) {
    super(message)
    this.name = 'ApiDiscoveryError'
    this.code = code
  }
}

export function toApiError(error: unknown): { code: ApiErrorCode; message: string } {
  if (error instanceof ApiDiscoveryError) return { code: error.code, message: error.message }
  return { code: 'network_error', message: error instanceof Error ? error.message : 'Request failed' }
}

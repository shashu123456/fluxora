export type ApiAuthType = 'none' | 'apiKey'

export type ApiRiskLevel = 'low' | 'medium' | 'high'

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

export interface ApiCatalogView {
  id: string
  name: string
  category: string
  description: string
  freeTier: string
  risk: ApiRiskLevel
  tags: string[]
  verifiedAt: string
  authType: ApiAuthType
  connected: boolean
  enabled: boolean
  fingerprint: string | null
}

export interface ApiRequestPreview {
  method: 'GET'
  host: string
  path: string
  query?: Record<string, string>
}

export interface ApiDetailView extends ApiCatalogView {
  docsUrl: string
  baseUrl: string
  sample: ApiRequestPreview
  responseNotes: string
  authLabel: string
  lastTestAt: number | null
  lastTestStatus: string | null
}

export interface ApiConnectionView {
  apiId: string
  connected: boolean
  enabled: boolean
  fingerprint: string | null
  lastTestAt: number | null
  lastTestStatus: string | null
}

export interface ApiTestSuccessView {
  ok: true
  requestId: string
  status: number
  durationMs: number
  bytes: number
  contentType: string
  preview: string
  truncated: boolean
}

export interface ApiTestFailureView {
  ok: false
  requestId: string
  durationMs: number
  bytes: number
  status?: number
  error: { code: ApiErrorCode; message: string }
}

export type ApiTestResultView = ApiTestSuccessView | ApiTestFailureView

export interface ApiAuditEntryView {
  id: number
  requestId: string
  apiId: string
  endpoint: string
  method: string
  statusCode: number | null
  durationMs: number
  responseBytes: number
  outcome: string
  errorCode: string | null
  createdAt: number
}

export interface ApiCatalogMeta {
  version: string
  verifiedAt: string
  total: number
  categories: number
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ApiErrorCode; message: string } }

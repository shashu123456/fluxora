import https from 'node:https'
import { promises as dns } from 'node:dns'
import { findCatalogEntry, type ApiCatalogEntry } from './catalog'
import { ApiDiscoveryError, type ApiErrorCode, toApiError } from './errors'
import { assertSafeUrl, createPinnedLookup, resolvePublicAddress, type PinnedAddress } from './ssrf'
import { recordApiCall } from './audit'
import { getApiSecret } from './secrets'

export const MAX_REDIRECTS = 3
export const TIMEOUT_MS = 10_000
export const MAX_BYTES = 1024 * 1024
export const PREVIEW_CHARS = 4_000

const PER_API_MIN_INTERVAL_MS = 5_000
const GLOBAL_WINDOW_MS = 60_000
const GLOBAL_MAX_PER_WINDOW = 30

// Only JSON and plain text are displayed. HTML is never rendered.
const ALLOWED_CONTENT_TYPE = /^(application\/json|application\/[a-z0-9.+-]+\+json|text\/plain)/i

export interface RawResponse {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
  bytes: number
  truncated: boolean
}

export interface TransportOptions {
  url: URL
  headers: Record<string, string>
  lookup: unknown
  timeoutMs: number
  maxBytes: number
}

export type Transport = (options: TransportOptions) => Promise<RawResponse>

export interface ApiTestSuccess {
  ok: true
  requestId: string
  status: number
  durationMs: number
  bytes: number
  contentType: string
  preview: string
  truncated: boolean
}

export interface ApiTestFailure {
  ok: false
  requestId: string
  durationMs: number
  bytes: number
  status?: number
  error: { code: ApiErrorCode; message: string }
}

export type ApiTestResult = ApiTestSuccess | ApiTestFailure

export interface ExecutorDeps {
  lookup?: typeof dns.lookup
  transport?: Transport
  audit?: typeof recordApiCall
  getSecret?: (apiId: string) => Promise<string | undefined>
  now?: () => number
}

const lastCallByApi = new Map<string, number>()
let globalCalls: number[] = []

export function resetRateLimits(): void {
  lastCallByApi.clear()
  globalCalls = []
}

function checkRateLimit(apiId: string, now: number): void {
  const last = lastCallByApi.get(apiId) ?? 0
  if (now - last < PER_API_MIN_INTERVAL_MS) {
    throw new ApiDiscoveryError('rate_limited', 'This API was tested less than 5 seconds ago.')
  }
  globalCalls = globalCalls.filter((stamp) => now - stamp < GLOBAL_WINDOW_MS)
  if (globalCalls.length >= GLOBAL_MAX_PER_WINDOW) {
    throw new ApiDiscoveryError('rate_limited', 'Too many test requests in the last minute.')
  }
}

function markCall(apiId: string, now: number): void {
  lastCallByApi.set(apiId, now)
  globalCalls.push(now)
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export function buildRequestUrl(entry: ApiCatalogEntry, secret?: string): URL {
  const base = new URL(entry.baseUrl)
  const path = entry.sample.path
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('..') || path.includes('://')) {
    throw new ApiDiscoveryError('catalog_invalid', 'The catalog sample path is invalid.')
  }
  const prefix = base.pathname.replace(/\/+$/, '')
  const url = new URL(`${base.origin}${prefix}${path}`)
  for (const [key, value] of Object.entries(entry.sample.query ?? {})) {
    url.searchParams.set(key, value)
  }
  if (entry.auth.type === 'query' && secret) {
    url.searchParams.set(entry.auth.name, secret)
  }
  return url
}

export function buildHeaders(entry: ApiCatalogEntry, secret?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain;q=0.9',
    'User-Agent': 'Fluxora/1.0',
  }
  if (entry.auth.type === 'header' && secret) {
    headers[entry.auth.name] = `${entry.auth.prefix ?? ''}${secret}`
  }
  return headers
}

/** Redacted endpoint for logs: path only, never the query string. */
export function redactedEndpoint(url: URL): string {
  return url.pathname
}

const httpsTransport: Transport = ({ url, headers, lookup, timeoutMs, maxBytes }) =>
  new Promise<RawResponse>((resolve, reject) => {
    let settled = false
    const finish = (error: unknown, value?: RawResponse) => {
      if (settled) return
      settled = true
      if (error) reject(error)
      else resolve(value as RawResponse)
    }

    const req = https.request(
      {
        protocol: 'https:',
        hostname: url.hostname,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers,
        lookup: lookup as never,
      },
      (res) => {
        const chunks: Buffer[] = []
        let bytes = 0
        let truncated = false
        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length
          if (bytes > maxBytes) {
            truncated = true
            res.destroy()
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () => {
          finish(null, {
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
            bytes,
            truncated,
          })
        })
        res.on('error', (error) => finish(error))
      }
    )

    req.setTimeout(timeoutMs, () => {
      req.destroy(new ApiDiscoveryError('timeout', 'The request timed out after 10 seconds.'))
    })
    req.on('error', (error) => finish(error))
    req.end()
  })

async function requestWithRedirects(
  entry: ApiCatalogEntry,
  url: URL,
  headers: Record<string, string>,
  deps: ExecutorDeps
): Promise<{ response: RawResponse; finalUrl: URL }> {
  const transport = deps.transport ?? httpsTransport
  const lookup = deps.lookup ?? dns.lookup

  let currentUrl = url
  let pinned: PinnedAddress = await resolvePublicAddress(currentUrl.hostname, lookup)

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await transport({
      url: currentUrl,
      headers,
      lookup: createPinnedLookup(pinned),
      timeoutMs: TIMEOUT_MS,
      maxBytes: MAX_BYTES,
    })

    if (response.status >= 300 && response.status < 400) {
      const location = firstHeader(response.headers.location)
      if (!location) return { response, finalUrl: currentUrl }
      if (hop === MAX_REDIRECTS) {
        throw new ApiDiscoveryError('blocked_redirect', 'Too many redirects.')
      }
      const next = new URL(location, currentUrl)
      assertSafeUrl(next)
      if (next.hostname !== url.hostname) {
        throw new ApiDiscoveryError('blocked_redirect', 'Redirects to another host are not allowed.')
      }
      pinned = await resolvePublicAddress(next.hostname, lookup)
      currentUrl = next
      continue
    }
    return { response, finalUrl: currentUrl }
  }

  throw new ApiDiscoveryError('blocked_redirect', 'Too many redirects.')
}

/**
 * Runs one explicit test request for a catalog entry.
 * The caller must be an authenticated renderer action that already confirmed
 * the exact host and path with the user.
 */
export async function testApi(apiId: string, deps: ExecutorDeps = {}): Promise<ApiTestResult> {
  const now = deps.now ?? Date.now
  const audit = deps.audit ?? recordApiCall
  const started = now()

  const entry = findCatalogEntry(apiId)
  if (!entry) {
    const result: ApiTestFailure = {
      ok: false,
      requestId: '',
      durationMs: 0,
      bytes: 0,
      error: { code: 'unknown_api', message: 'That API is not in the catalog.' },
    }
    return result
  }

  let url: URL | null = null
  let secret: string | undefined

  try {
    checkRateLimit(apiId, started)

    if (entry.auth.type !== 'none') {
      secret = await (deps.getSecret ?? getApiSecret)(apiId)
      if (!secret) throw new ApiDiscoveryError('auth_required', 'Connect an API key before testing this API.')
    }

    url = buildRequestUrl(entry, secret)
    assertSafeUrl(url)
    const headers = buildHeaders(entry, secret)

    const { response, finalUrl } = await requestWithRedirects(entry, url, headers, deps)
    const durationMs = Math.max(0, now() - started)
    const contentType = (firstHeader(response.headers['content-type']) ?? '').toLowerCase()

    if (response.truncated) {
      throw new ApiDiscoveryError('too_large', 'The response exceeded the 1 MB limit and was discarded.')
    }
    if (contentType && !ALLOWED_CONTENT_TYPE.test(contentType)) {
      throw new ApiDiscoveryError('unsupported_content_type', `Unsupported response type: ${contentType.split(';')[0]}`)
    }

    const requestId = await audit({
      apiId,
      endpoint: redactedEndpoint(finalUrl),
      method: 'GET',
      statusCode: response.status,
      durationMs,
      responseBytes: response.bytes,
      outcome: response.status >= 400 ? 'http_error' : 'success',
      errorCode: response.status >= 400 ? 'http_error' : null,
    })
    markCall(apiId, started)

    if (response.status >= 400) {
      return {
        ok: false,
        requestId,
        status: response.status,
        durationMs,
        bytes: response.bytes,
        error: {
          code: 'http_error',
          message: `The API returned HTTP ${response.status}. Check the key and the endpoint documentation.`,
        },
      }
    }

    return {
      ok: true,
      requestId,
      status: response.status,
      durationMs,
      bytes: response.bytes,
      contentType,
      preview: response.body.slice(0, PREVIEW_CHARS),
      truncated: response.body.length > PREVIEW_CHARS,
    }
  } catch (error) {
    const durationMs = Math.max(0, now() - started)
    const { code, message } = toApiError(error)
    const outcome =
      code === 'rate_limited'
        ? 'rate_limited'
        : code === 'blocked_private_address' || code === 'blocked_redirect' || code === 'invalid_url'
          ? 'blocked'
          : 'failed'
    const requestId = await audit({
      apiId,
      endpoint: url ? redactedEndpoint(url) : entry.sample.path,
      method: 'GET',
      statusCode: null,
      durationMs,
      responseBytes: 0,
      outcome,
      errorCode: code,
    }).catch(() => '')
    return { ok: false, requestId, durationMs, bytes: 0, error: { code, message } }
  }
}

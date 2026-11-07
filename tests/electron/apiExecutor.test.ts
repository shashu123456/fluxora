import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/fluxora-test' },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString('utf8'),
  },
}))
import type { Transport, TransportOptions } from '../../electron/services/apiDiscovery/executor'
import { buildRequestUrl, redactedEndpoint, resetRateLimits, testApi } from '../../electron/services/apiDiscovery/executor'
import { findCatalogEntry } from '../../electron/services/apiDiscovery/catalog'
import { ApiDiscoveryError } from '../../electron/services/apiDiscovery/errors'

const publicLookup = (async () => [{ address: '93.184.216.34', family: 4 }]) as any

const calls: TransportOptions[] = []
let clock = 1_000_000

function makeDeps(transport: Transport, overrides: Record<string, unknown> = {}) {
  const audits: any[] = []
  return {
    audits,
    deps: {
      lookup: publicLookup,
      transport: async (options: TransportOptions) => {
        calls.push(options)
        return transport(options)
      },
      audit: async (input: any) => {
        audits.push(input)
        return 'request-1'
      },
      getSecret: async () => 'test-key-123',
      now: () => clock,
      ...overrides,
    } as any,
  }
}

function jsonResponse(body = '{"ok":true}', overrides: Partial<Awaited<ReturnType<Transport>>> = {}) {
  return {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body,
    bytes: body.length,
    truncated: false,
    ...overrides,
  }
}

beforeEach(() => {
  calls.length = 0
  resetRateLimits()
  clock = 1_000_000
})

describe('request construction', () => {
  it('joins the catalog base URL, path, and query', () => {
    const entry = findCatalogEntry('open-meteo-forecast')!
    const url = buildRequestUrl(entry)
    expect(url.hostname).toBe('api.open-meteo.com')
    expect(url.pathname).toBe('/v1/forecast')
    expect(url.searchParams.get('latitude')).toBe('12.9716')
    expect(url.searchParams.get('current')).toBe('temperature_2m')
  })

  it('never includes an API key in the audit endpoint', () => {
    const url = new URL('https://api.example.com/v1/thing?api_key=secret-value&q=1')
    expect(redactedEndpoint(url)).toBe('/v1/thing')
    expect(redactedEndpoint(url)).not.toContain('secret-value')
  })

  it('adds the catalog auth header and safe defaults only', async () => {
    const { deps } = makeDeps(async () => jsonResponse())
    const result = await testApi('thecatapi', deps)
    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].headers['x-api-key']).toBe('test-key-123')
    expect(calls[0].headers['User-Agent']).toBe('Fluxora/1.0')
    expect(Object.keys(calls[0].headers).sort()).toEqual(['Accept', 'User-Agent', 'x-api-key'])
    expect(calls[0].url.href).toBe('https://api.thecatapi.com/v1/images/search?limit=1')
  })

  it('uses a Bearer prefix when the catalog defines one', async () => {
    const { deps } = makeDeps(async () => jsonResponse())
    await testApi('huggingface-hub', deps)
    expect(calls[0].headers.Authorization).toBe('Bearer test-key-123')
  })
})

describe('executor failures', () => {
  it('rejects an unknown api id without a request', async () => {
    const { deps } = makeDeps(async () => jsonResponse())
    const result = await testApi('https://evil.example/steal', deps)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.code).toBe('unknown_api')
    expect(calls).toHaveLength(0)
  })

  it('requires a secret when auth is configured', async () => {
    const { deps, audits } = makeDeps(async () => jsonResponse(), { getSecret: async () => undefined })
    const result = await testApi('thecatapi', deps)
    expect(!result.ok && result.error.code).toBe('auth_required')
    expect(calls).toHaveLength(0)
    expect(audits).toHaveLength(1)
    expect(audits[0].outcome).toBe('failed')
  })

  it('enforces the timeout as a typed result', async () => {
    const { deps, audits } = makeDeps(async () => {
      throw new ApiDiscoveryError('timeout', 'The request timed out after 10 seconds.')
    })
    const result = await testApi('github-rest', deps)
    expect(!result.ok && result.error.code).toBe('timeout')
    expect(audits[0].outcome).toBe('failed')
    expect(audits[0].errorCode).toBe('timeout')
  })

  it('rejects responses over the 1 MB cap', async () => {
    const { deps } = makeDeps(async () => jsonResponse('{}', { truncated: true, bytes: 1024 * 1024 + 1 }))
    const result = await testApi('github-rest', deps)
    expect(!result.ok && result.error.code).toBe('too_large')
  })

  it('rejects unsupported content types', async () => {
    const { deps } = makeDeps(async () =>
      jsonResponse('<html></html>', { headers: { 'content-type': 'text/html' } })
    )
    const result = await testApi('github-rest', deps)
    expect(!result.ok && result.error.code).toBe('unsupported_content_type')
  })

  it('returns HTTP errors as structured results', async () => {
    const { deps, audits } = makeDeps(async () => jsonResponse('{"message":"nope"}', { status: 404 }))
    const result = await testApi('github-rest', deps)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.status).toBe(404)
    expect(!result.ok && result.error.code).toBe('http_error')
    expect(audits[0].outcome).toBe('http_error')
  })

  it('blocks a redirect to a private address', async () => {
    const { deps } = makeDeps(async () =>
      jsonResponse('', { status: 302, headers: { location: 'https://127.0.0.1/admin' } })
    )
    const result = await testApi('github-rest', deps)
    expect(!result.ok && result.error.code).toBe('blocked_private_address')
  })

  it('never forwards the Authorization header on a cross-host redirect', async () => {
    const { deps } = makeDeps(async () =>
      jsonResponse('', { status: 302, headers: { location: 'https://evil.example/collect' } })
    )
    const result = await testApi('huggingface-hub', deps)
    expect(!result.ok && result.error.code).toBe('blocked_redirect')
    expect(calls).toHaveLength(1)
    expect(calls[0].url.hostname).toBe('huggingface.co')
    expect(calls[0].headers.Authorization).toBe('Bearer test-key-123')
  })

  it('blocks a redirect to an unapproved host', async () => {
    const { deps } = makeDeps(async () =>
      jsonResponse('', { status: 301, headers: { location: 'https://evil.example/x' } })
    )
    const result = await testApi('github-rest', deps)
    expect(!result.ok && result.error.code).toBe('blocked_redirect')
  })

  it('follows a same-host redirect and revalidates DNS', async () => {
    let hop = 0
    const { deps } = makeDeps(async () => {
      hop += 1
      return hop === 1
        ? jsonResponse('', { status: 307, headers: { location: '/repos/facebook/react' } })
        : jsonResponse('{"ok":true}')
    })
    const result = await testApi('github-rest', deps)
    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(2)
    expect(calls[1].url.pathname).toBe('/repos/facebook/react')
  })

  it('rate limits a second test of the same API', async () => {
    const { deps, audits } = makeDeps(async () => jsonResponse())
    const first = await testApi('github-rest', deps)
    expect(first.ok).toBe(true)
    clock += 1_000
    const second = await testApi('github-rest', deps)
    expect(!second.ok && second.error.code).toBe('rate_limited')
    expect(calls).toHaveLength(1)
    expect(audits.some((entry) => entry.outcome === 'rate_limited')).toBe(true)
  })

  it('allows the same API again after five seconds', async () => {
    const { deps } = makeDeps(async () => jsonResponse())
    await testApi('github-rest', deps)
    clock += 6_000
    const second = await testApi('github-rest', deps)
    expect(second.ok).toBe(true)
    expect(calls).toHaveLength(2)
  })
})

describe('executor success path', () => {
  it('records one audit row with no query string and no body', async () => {
    const { deps, audits } = makeDeps(async () => jsonResponse('{"a":1}'))
    const result = await testApi('open-meteo-forecast', deps)
    expect(result.ok).toBe(true)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      apiId: 'open-meteo-forecast',
      endpoint: '/v1/forecast',
      method: 'GET',
      outcome: 'success',
      statusCode: 200,
      responseBytes: 7,
    })
    expect(JSON.stringify(audits[0])).not.toContain('latitude')
    expect(JSON.stringify(audits[0])).not.toContain('test-key-123')
  })

  it('returns a bounded preview and never the resolved address', async () => {
    const body = `{"data":"${'x'.repeat(5_000)}"}`
    const { deps } = makeDeps(async () => jsonResponse(body))
    const result = await testApi('github-rest', deps)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.preview.length).toBe(4_000)
      expect(result.truncated).toBe(true)
      expect(JSON.stringify(result)).not.toContain('93.184.216.34')
    }
  })

  it('does not leak the secret into the result', async () => {
    const { deps } = makeDeps(async () => jsonResponse())
    const result = await testApi('coingecko', deps)
    expect(JSON.stringify(result)).not.toContain('test-key-123')
  })
})

describe('buildRequestUrl guards', () => {
  it('rejects traversal in a sample path', async () => {
    const entry = { ...findCatalogEntry('github-rest')!, sample: { method: 'GET' as const, path: '/../../etc' } }
    expect(() => buildRequestUrl(entry)).toThrow()
  })
})

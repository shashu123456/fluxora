import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>() }))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => handlers.set(channel, handler),
  },
  app: { getPath: () => '/tmp/fluxora-test' },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString('utf8'),
  },
  nativeTheme: { shouldUseDarkColors: false },
}))

vi.mock('../../electron/services/secrets/vault', () => ({
  getSecretVault: () => ({
    seal: (value: string) => ({ payload: `sealed:${value}`, storageMode: 'local' }),
    open: (payload: string) => payload.replace(/^sealed:/, ''),
    unsafeSealSync: (value: string) => ({ payload: `sealed:${value}`, storageMode: 'local' }),
  }),
}))

import { initDatabase, closeDatabase, all } from '../../electron/database'
import { registerApisIpc } from '../../electron/ipc/apis'

let tempDir: string

beforeAll(() => {
  registerApisIpc()
})

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fluxora-api-ipc-'))
  await initDatabase(path.join(tempDir, 'test.db'))
  handlers.clear()
  registerApisIpc()
})

afterEach(async () => {
  await closeDatabase()
  fs.rmSync(tempDir, { recursive: true, force: true })
})

const trustedEvent = { senderFrame: { url: 'file:///C:/app/dist/index.html' } }

function call<T = any>(channel: string, ...args: any[]): Promise<T> {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`No handler registered for ${channel}`)
  return handler(trustedEvent as any, ...args)
}

describe('API discovery IPC contract', () => {
  it('registers every documented channel', () => {
    expect([...handlers.keys()].sort()).toEqual([
      'apis:audit',
      'apis:catalog-version',
      'apis:connect',
      'apis:disconnect',
      'apis:get',
      'apis:list',
      'apis:test',
    ])
  })

  it('lists the catalog without secret material', async () => {
    const result = await call('apis:list')
    expect(result.ok).toBe(true)
    expect(result.data).toHaveLength(20)
    for (const item of result.data) {
      expect(item.fingerprint).toBeNull()
      expect(JSON.stringify(item)).not.toMatch(/encrypted|secret/i)
      expect(['ok', 'rate-limited', 'unreachable']).toContain(item.verification.status)
    }
  })

  it('exposes the honest verification state for a quota-limited API', async () => {
    const result = await call('apis:list')
    const books = result.data.find((item: any) => item.id === 'google-books')
    expect(books.verification).toMatchObject({ status: 'rate-limited', httpStatus: 429 })
    expect(books.verification.note).toMatch(/quota/i)
  })

  it('rejects calls from an untrusted frame', async () => {
    for (const event of [
      { senderFrame: { url: 'https://evil.example/' } },
      { senderFrame: { url: 'file:///../../etc/passwd' } },
      { senderFrame: null },
      {},
    ]) {
      const handler = handlers.get('apis:list')!
      const result = await handler(event as any)
      expect(result).toMatchObject({ ok: false, error: { code: 'untrusted_sender' } })
    }
  })

  it('returns catalog metadata', async () => {
    const result = await call('apis:catalog-version')
    expect(result.data).toMatchObject({ total: 20, categories: 6 })
    expect(typeof result.data.version).toBe('string')
  })

  it('rejects unknown ids with a typed error', async () => {
    const result = await call('apis:get', 'does-not-exist')
    expect(result).toMatchObject({ ok: false, error: { code: 'unknown_api' } })
  })

  it('rejects URL injection through the api id', async () => {
    for (const attempt of ['https://evil.example/x', 'file:///etc/passwd', '../../secret', '', null, 42]) {
      const result = await call('apis:test', attempt)
      expect(result).toMatchObject({ ok: false, error: { code: 'unknown_api' } })
    }
  })

  it('rejects a missing or oversized secret', async () => {
    const missing = await call('apis:connect', 'thecatapi')
    expect(missing).toMatchObject({ ok: false, error: { code: 'invalid_secret' } })

    const empty = await call('apis:connect', 'thecatapi', '   ')
    expect(empty).toMatchObject({ ok: false, error: { code: 'invalid_secret' } })

    const huge = await call('apis:connect', 'thecatapi', 'x'.repeat(4097))
    expect(huge).toMatchObject({ ok: false, error: { code: 'invalid_secret' } })

    const wrongType = await call('apis:connect', 'thecatapi', { key: 'abc' })
    expect(wrongType).toMatchObject({ ok: false, error: { code: 'invalid_secret' } })
  })

  it('connects a keyless API and disconnects it', async () => {
    const connected = await call('apis:connect', 'github-rest')
    expect(connected.ok).toBe(true)
    // Keyless APIs store no secret, so they are enabled for use but not
    // "connected" under the secret-based definition.
    expect(connected.data.enabled).toBe(true)
    expect(connected.data.connected).toBe(false)
    expect(connected.data.fingerprint).toBeNull()

    const detail = await call('apis:get', 'github-rest')
    expect(detail.data.sample).toMatchObject({
      method: 'GET',
      host: 'api.github.com',
      path: '/repos/octocat/Hello-World',
    })

    const removed = await call('apis:disconnect', 'github-rest')
    expect(removed.ok).toBe(true)
    expect(removed.data.fingerprint).toBeNull()
    expect(removed.data.enabled).toBe(false)
  })

  it('ignores extra renderer arguments such as url, method, or headers', async () => {
    const result = await call('apis:get', 'github-rest', 'https://evil.example', 'POST', { auth: 'x' })
    expect(result.ok).toBe(true)
    expect(result.data.baseUrl).toBe('https://api.github.com')
    expect(result.data.sample.method).toBe('GET')
  })

  it('clamps the audit limit and returns an empty log initially', async () => {
    const result = await call('apis:audit', 999999)
    expect(result.ok).toBe(true)
    expect(result.data).toEqual([])
  })

  it('stores a key via connect and clears it via disconnect', async () => {
    const connect = await call('apis:connect', 'thecatapi', 'fake-key-abc')
    expect(connect.ok).toBe(true)
    expect(connect.data.fingerprint).toMatch(/^[a-f0-9]{12}$/)

    const rows = await all<{ encrypted_payload: string; owner_type: string }>(
      "SELECT encrypted_payload, owner_type FROM secret_records WHERE owner_type='api'"
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].owner_type).toBe('api')

    const disconnect = await call('apis:disconnect', 'thecatapi')
    expect(disconnect.ok).toBe(true)
    expect(disconnect.data.fingerprint).toBeNull()

    const after = await all<{ owner_type: string }>("SELECT owner_type FROM secret_records")
    expect(after).toHaveLength(0)
    expect(await call('apis:get', 'thecatapi')).toMatchObject({
      data: { connected: false, fingerprint: null },
    })
  })

  it('reports a connection and secret fingerprints without exposing the key', async () => {
    await call('apis:connect', 'thecatapi', 'fake-key-abc')
    const result = await call('apis:list')
    const item = result.data.find((row: any) => row.id === 'thecatapi')
    expect(item.connected).toBe(true)
    expect(item.fingerprint).toMatch(/^[a-f0-9]{12}$/)
    // No raw key or vault hint should leak through the renderer-facing view.
    expect(JSON.stringify(item)).not.toMatch(/fake-key-abc/i)
    expect(JSON.stringify(item)).not.toMatch(/sealed/i)
  })
})

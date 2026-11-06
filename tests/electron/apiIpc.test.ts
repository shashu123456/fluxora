import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

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
}))

import { initDatabase, closeDatabase } from '../../electron/database'
import { registerApisIpc } from '../../electron/ipc/apis'

let tempDir: string

beforeAll(() => {
  registerApisIpc()
})

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fluxora-api-ipc-'))
  await initDatabase(path.join(tempDir, 'test.db'))
})

afterEach(async () => {
  await closeDatabase()
  fs.rmSync(tempDir, { recursive: true, force: true })
})

function call<T = any>(channel: string, ...args: any[]): Promise<T> {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`No handler registered for ${channel}`)
  return handler({} as any, ...args)
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
    expect(connected.data.connected).toBe(true)

    const detail = await call('apis:get', 'github-rest')
    expect(detail.data.sample).toMatchObject({
      method: 'GET',
      host: 'api.github.com',
      path: '/repos/octocat/Hello-World',
    })

    const removed = await call('apis:disconnect', 'github-rest')
    expect(removed.ok).toBe(true)
    expect(removed.data.fingerprint).toBeNull()
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
})

import { ipcMain } from 'electron'
import { all, get, run } from '../database'
import {
  API_CATALOG,
  CATALOG_CATEGORIES,
  CATALOG_VERIFIED_AT,
  CATALOG_VERSION,
  findCatalogEntry,
} from '../services/apiDiscovery/catalog'
import { testApi } from '../services/apiDiscovery/executor'
import { listApiAudit } from '../services/apiDiscovery/audit'
import { getApiSecretFingerprint, removeApiSecret, setApiSecret } from '../services/apiDiscovery/secrets'
import { ApiDiscoveryError, toApiError } from '../services/apiDiscovery/errors'
import type {
  ApiCatalogMeta,
  ApiCatalogView,
  ApiDetailView,
  ApiConnectionView,
  ApiResult,
} from '../../src/types/apiDiscovery'

function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data }
}

function fail<T>(error: unknown): ApiResult<T> {
  const { code, message } = toApiError(error)
  return { ok: false, error: { code, message } }
}

function requireEntry(apiId: unknown) {
  if (typeof apiId !== 'string' || !apiId.trim()) {
    throw new ApiDiscoveryError('unknown_api', 'An API id is required.')
  }
  const entry = findCatalogEntry(apiId)
  if (!entry) throw new ApiDiscoveryError('unknown_api', 'That API is not in the catalog.')
  return entry
}

function validateSecret(authType: 'none' | 'header' | 'query', secret: unknown): string | undefined {
  if (authType === 'none') return undefined
  if (typeof secret !== 'string') {
    throw new ApiDiscoveryError('invalid_secret', 'An API key is required for this API.')
  }
  const value = secret.trim()
  if (value.length < 1 || value.length > 4096) {
    throw new ApiDiscoveryError('invalid_secret', 'The API key must be between 1 and 4096 characters.')
  }
  return value
}

async function connectionRow(apiId: string): Promise<any | null> {
  return get<any>(`SELECT * FROM api_connections WHERE api_id = ?`, [apiId])
}

function connectionView(apiId: string, row: any | null, fingerprint: string | null): ApiConnectionView {
  return {
    apiId,
    connected: !!fingerprint || !!row,
    enabled: row ? !!row.enabled : false,
    fingerprint,
    lastTestAt: row?.last_test_at ?? null,
    lastTestStatus: row?.last_test_status ?? null,
  }
}

export function registerApisIpc() {
  ipcMain.handle('apis:list', async (): Promise<ApiResult<ApiCatalogView[]>> => {
    try {
      const rows = await all<any>('SELECT * FROM api_connections')
      const byId = new Map(rows.map((row) => [row.api_id, row]))
      const items: ApiCatalogView[] = []
      for (const entry of API_CATALOG) {
        const fingerprint = await getApiSecretFingerprint(entry.id)
        items.push({
          id: entry.id,
          name: entry.name,
          category: entry.category,
          description: entry.description,
          freeTier: entry.freeTier,
          risk: entry.risk,
          tags: entry.tags,
          verifiedAt: entry.verifiedAt,
          authType: entry.auth.type === 'none' ? 'none' : 'apiKey',
          connected: !!fingerprint,
          enabled: byId.get(entry.id) ? !!byId.get(entry.id).enabled : false,
          fingerprint,
        })
      }
      return ok(items)
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('apis:get', async (_e, apiId: unknown): Promise<ApiResult<ApiDetailView>> => {
    try {
      const entry = requireEntry(apiId)
      const row = await connectionRow(entry.id)
      const fingerprint = await getApiSecretFingerprint(entry.id)
      const base = connectionView(entry.id, row, fingerprint)
      return ok({
        ...base,
        id: entry.id,
        name: entry.name,
        category: entry.category,
        description: entry.description,
        freeTier: entry.freeTier,
        risk: entry.risk,
        tags: entry.tags,
        verifiedAt: entry.verifiedAt,
        authType: entry.auth.type === 'none' ? 'none' : 'apiKey',
        docsUrl: entry.docsUrl,
        baseUrl: entry.baseUrl,
        sample: {
          method: 'GET',
          host: new URL(entry.baseUrl).host,
          path: entry.sample.path,
          query: entry.sample.query,
        },
        responseNotes: entry.responseNotes,
        authLabel:
          entry.auth.type === 'none'
            ? 'No key required'
            : `Sent as the ${entry.auth.type === 'header' ? 'header' : 'query parameter'} "${entry.auth.name}"`,
        lastTestAt: base.lastTestAt,
        lastTestStatus: base.lastTestStatus,
      })
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle(
    'apis:connect',
    async (_e, apiId: unknown, secret?: unknown): Promise<ApiResult<ApiConnectionView>> => {
      try {
        const entry = requireEntry(apiId)
        const value = validateSecret(entry.auth.type, secret)
        if (value !== undefined) await setApiSecret(entry.id, value)

        const now = Date.now()
        await run(
          `INSERT INTO api_connections (api_id, auth_mode, enabled, created_at, updated_at)
           VALUES (?, ?, 1, ?, ?)
           ON CONFLICT(api_id) DO UPDATE SET auth_mode = excluded.auth_mode, enabled = 1, updated_at = excluded.updated_at`,
          [entry.id, entry.auth.type === 'none' ? 'none' : 'key', now, now]
        )

        const row = await connectionRow(entry.id)
        const fingerprint = await getApiSecretFingerprint(entry.id)
        return ok(connectionView(entry.id, row, fingerprint))
      } catch (error) {
        return fail(error)
      }
    }
  )

  ipcMain.handle('apis:disconnect', async (_e, apiId: unknown): Promise<ApiResult<ApiConnectionView>> => {
    try {
      const entry = requireEntry(apiId)
      await removeApiSecret(entry.id)
      await run(`UPDATE api_connections SET enabled = 0, updated_at = ? WHERE api_id = ?`, [Date.now(), entry.id])
      const row = await connectionRow(entry.id)
      return ok(connectionView(entry.id, row, null))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('apis:test', async (_e, apiId: unknown) => {
    try {
      const entry = requireEntry(apiId)
      const result = await testApi(entry.id)
      const status = result.ok ? `ok:${result.status}` : `error:${result.error.code}`
      await run(
        `INSERT INTO api_connections (api_id, auth_mode, enabled, last_test_at, last_test_status, created_at, updated_at)
         VALUES (?, ?, 1, ?, ?, ?, ?)
         ON CONFLICT(api_id) DO UPDATE SET last_test_at = excluded.last_test_at,
           last_test_status = excluded.last_test_status, updated_at = excluded.updated_at`,
        [entry.id, entry.auth.type === 'none' ? 'none' : 'key', Date.now(), status, Date.now(), Date.now()]
      )
      return ok(result)
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('apis:audit', async (_e, limit?: unknown) => {
    try {
      const parsed = typeof limit === 'number' && Number.isFinite(limit) ? Math.floor(limit) : 100
      return ok(await listApiAudit(Math.min(500, Math.max(1, parsed))))
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('apis:catalog-version', async (): Promise<ApiResult<ApiCatalogMeta>> => {
    return ok({
      version: CATALOG_VERSION,
      verifiedAt: CATALOG_VERIFIED_AT,
      total: API_CATALOG.length,
      categories: CATALOG_CATEGORIES.length,
    })
  })
}

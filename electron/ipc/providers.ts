import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { all, get, run } from '../database'
import { ProviderConfig, ProviderCapabilities } from '../../src/types'
import { getDefaultProviderConfigs, fetchModelsFromProvider, fetchModelsDetailed } from '../services/ai'
import { normalizeBaseUrl } from '../services/ai/providers'
import { detectProviderApi, buildCapabilities, probeStreaming, classifyHttpError, classifyNetworkError, DetectionResult } from '../services/ai/detect'
import { ProviderApiKind } from '../../src/types'
import { getSecretManager } from '../services/secrets/manager'
import { PROVIDER_OWNER_TYPE, PROVIDER_SECRET_KIND } from '../services/secrets/metadata'

const MASK = '••••••••'

function maskApiKey(key: string): string {
  return key ? MASK : ''
}

function parseCapabilities(raw: string | null | undefined): ProviderCapabilities | undefined {
  if (!raw) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

async function mapRow(row: any) {
  const secretManager = getSecretManager()
  const hasKey = await secretManager.hasProviderSecret(row.id)
  const metadata = hasKey ? await secretManager.getProviderMetadata(row.id) : undefined
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    baseUrl: row.base_url,
    apiKey: '',
    hasKey,
    secret: metadata,
    models: JSON.parse(row.models || '[]'),
    enabled: !!row.enabled,
    isCustom: !!row.is_custom,
    color: row.color,
    capabilities: parseCapabilities(row.capabilities),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function migrateLegacyProviderKeys() {
  // Legacy migration replaced by SecretManager migration
}

export function registerProviderIpc() {
  ipcMain.handle('providers:list', async () => {
    const rows = await all<any>('SELECT * FROM providers ORDER BY created_at ASC')
    const result = []
    for (const row of rows) {
      result.push(await mapRow(row))
    }
    return result
  })

  ipcMain.handle('providers:global-list', async () => {
    const rows = await all<any>('SELECT * FROM providers WHERE enabled = 1 ORDER BY name ASC')
    const result = []
    for (const row of rows) {
      result.push(await mapRow(row))
    }
    return result
  })

  ipcMain.handle('providers:create', async (_e, data: Partial<ProviderConfig>) => {
    const id = data.id || randomUUID()
    const rawKey = typeof data.apiKey === 'string' && data.apiKey ? data.apiKey : ''
    const now = Date.now()
    const secretManager = getSecretManager()
    if (rawKey) {
      await secretManager.setProviderSecret(id, data.type || 'custom', data.name || 'Custom Provider', rawKey)
    }
    const provider = {
      id,
      name: data.name || 'Custom Provider',
      type: data.type || 'custom',
      baseUrl: normalizeBaseUrl(data.baseUrl || '', data.type || 'custom'),
      apiKey: '',
      hasKey: !!rawKey,
      models: data.models || [],
      enabled: data.enabled ?? true,
      isCustom: data.isCustom ?? true,
      color: data.color,
      capabilities: data.capabilities,
      createdAt: now,
      updatedAt: now,
    }
    await run(
      'INSERT INTO providers (id, name, type, base_url, api_key, models, enabled, is_custom, color, capabilities, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, provider.name, provider.type, provider.baseUrl, '', JSON.stringify(provider.models), provider.enabled ? 1 : 0, provider.isCustom ? 1 : 0, provider.color, provider.capabilities ? JSON.stringify(provider.capabilities) : null, now, now]
    )
    if (rawKey) {
      const secret = await secretManager.getProviderMetadata(id)
      return { ...provider, secret }
    }
    return provider
  })

  ipcMain.handle('providers:update', async (_e, id: string, data: Partial<ProviderConfig>) => {
    const now = Date.now()
    const fields: string[] = []
    const values: any[] = []
    const mapping: Record<string, string> = {
      name: 'name',
      type: 'type',
      color: 'color',
    }
    for (const [tsKey, dbKey] of Object.entries(mapping)) {
      const v = (data as any)[tsKey]
      if (v !== undefined) {
        fields.push(dbKey)
        values.push(v)
      }
    }
    if (typeof data.apiKey === 'string' && data.apiKey) {
      const secretManager = getSecretManager()
      const row = await get<any>('SELECT type, name FROM providers WHERE id = ?', [id])
      await secretManager.setProviderSecret(id, data.type || row?.type || 'custom', data.name || row?.name || id, data.apiKey)
    } else if (data.apiKey === '') {
      const secretManager = getSecretManager()
      await secretManager.removeProviderSecret(id)
    }
    if (data.baseUrl !== undefined) {
      const existing = await get<any>('SELECT type FROM providers WHERE id = ?', [id])
      fields.push('base_url')
      values.push(normalizeBaseUrl(data.baseUrl, data.type || existing?.type || 'custom'))
    }
    if (data.models !== undefined) {
      fields.push('models')
      values.push(JSON.stringify(data.models))
    }
    if (data.enabled !== undefined) {
      fields.push('enabled')
      values.push(data.enabled ? 1 : 0)
    }
    if (data.isCustom !== undefined) {
      fields.push('is_custom')
      values.push(data.isCustom ? 1 : 0)
    }
    if (data.capabilities !== undefined) {
      fields.push('capabilities')
      values.push(JSON.stringify(data.capabilities))
      if ((data as any).type) {
        fields.push('type')
        values.push((data as any).type)
      }
    }
    fields.push('updated_at')
    values.push(now)
    values.push(id)
    if (fields.length <= 1) {
      const row = await get<any>('SELECT * FROM providers WHERE id = ?', [id])
      return row ? await mapRow(row) : null
    }
    await run(`UPDATE providers SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, values)
    const row = await get<any>('SELECT * FROM providers WHERE id = ?', [id])
    return row ? mapRow(row) : null
  })

  ipcMain.handle('providers:delete', async (_e, id: string) => {
    await getSecretManager().removeProviderSecret(id)
    await run('DELETE FROM providers WHERE id = ?', [id])
    return true
  })

  ipcMain.handle('providers:rotate', async (_e, id: string) => {
    return getSecretManager().rotateProviderSecret(id)
  })

  ipcMain.handle('providers:secret-metadata', async (_e, id: string) => {
    return getSecretManager().getProviderMetadata(id)
  })

  ipcMain.handle('providers:test', async (_e, id: string) => {
    const row = await get<any>('SELECT * FROM providers WHERE id = ?', [id])
    if (!row) throw new Error('Provider not found')
    const metadata = await mapRow(row)
    const result = await getSecretManager().withProviderSecret(id, (secret) =>
      testProvider({ ...metadata, apiKey: secret || '' } as ProviderConfig)
    )
    if (result.ok && result.capabilities) {
      const type = metadata.type === 'custom' ? 'custom' : result.capabilities.apiKind
      await run('UPDATE providers SET capabilities = ?, type = ?, updated_at = ? WHERE id = ?', [JSON.stringify(result.capabilities), type, Date.now(), id])
    }
    await getSecretManager().recordValidation(id, result.ok)
    return result
  })

  ipcMain.handle('providers:test-config', async (_e, data: Partial<ProviderConfig>) => {
    const detection = detectProviderApi(data.baseUrl || '')
    const provider: ProviderConfig = {
      id: 'test',
      name: data.name || 'Test',
      type: data.type || detection.apiKind,
      baseUrl: normalizeBaseUrl(data.baseUrl || '', data.type || detection.apiKind),
      apiKey: data.apiKey || '',
      models: [],
      enabled: true,
      isCustom: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    return testProvider(provider, detection)
  })

  ipcMain.handle('providers:detect', async (_e, data: { baseUrl: string; apiKey?: string }) => {
    const detection = detectProviderApi(data.baseUrl || '')
    const provider: ProviderConfig = {
      id: 'test',
      name: '',
      type: detection.apiKind,
      baseUrl: normalizeBaseUrl(data.baseUrl || '', detection.apiKind),
      apiKey: data.apiKey || '',
      models: [],
      enabled: true,
      isCustom: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    let models: string[] = []
    if (provider.apiKey) {
      try {
        models = await fetchModelsFromProvider(provider)
      } catch {
        models = []
      }
    }
    return { ...detection, models: models.slice(0, 20) }
  })

  ipcMain.handle('providers:list-models', async (_e, id: string) => {
    const row = await get<any>('SELECT * FROM providers WHERE id = ?', [id])
    if (!row) return []
    const provider = await mapRow(row)
    const remoteModels = await getSecretManager().withProviderSecret(id, (secret) =>
      fetchModelsFromProvider({ ...provider, apiKey: secret || '' } as ProviderConfig)
    )
    return {
      local: provider.models.map((m: { id: string }) => m.id),
      remote: remoteModels,
    }
  })

  ipcMain.handle('providers:refresh-models', async (_e, id: string) => {
    const row = await get<any>('SELECT * FROM providers WHERE id = ?', [id])
    if (!row) return { ok: false, models: [] }
    const provider = await mapRow(row)
    const fetched = await getSecretManager().withProviderSecret(id, (secret) =>
      fetchModelsDetailed({ ...provider, apiKey: secret || '' } as ProviderConfig)
    )
    if (fetched.length === 0) return { ok: false, models: [] }
    await run('UPDATE providers SET models = ?, updated_at = ? WHERE id = ?', [JSON.stringify(fetched), Date.now(), id])
    return { ok: true, models: fetched }
  })

  ipcMain.handle('providers:ensure-defaults', async () => {
    const count = await get<any>('SELECT COUNT(*) as c FROM providers')
    if (!count || count.c === 0) {
      for (const def of getDefaultProviderConfigs()) {
        const now = Date.now()
        const id = randomUUID()
        await run(
          'INSERT INTO providers (id, name, type, base_url, api_key, models, enabled, is_custom, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [id, def.name, def.type, normalizeBaseUrl(def.baseUrl, def.type), '', JSON.stringify(def.models.map((m: any) => ({ ...m, providerId: id }))), 0, def.isCustom ? 1 : 0, def.color, now, now]
        )
      }
    }
    return true
  })
}

async function testProvider(provider: ProviderConfig, detection?: DetectionResult): Promise<{ ok: boolean; latencyMs: number; error?: string; models?: string[]; capabilities?: ProviderCapabilities }> {
  const start = Date.now()
  const result = detection || detectProviderApi(provider.baseUrl)
  const apiKind = provider.type === 'custom' && !detection ? result.apiKind : (provider.type === 'gemini' ? 'gemini' : provider.type === 'anthropic' ? 'anthropic' : result.apiKind)

  if (provider.type === 'gemini' || apiKind === 'gemini') {
    return testGemini(provider, result)
  }

  try {
    const models = await fetchModelsFromProvider(provider)
    if (models.length === 0) {
      throw new Error('No models available — the endpoint responded but returned an empty model list.')
    }
    const streaming = await probeStreaming({
      apiKind: apiKind as ProviderApiKind,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      modelId: models[0],
    })
    const capabilities = buildCapabilities({
      apiKind: apiKind as ProviderApiKind,
      detectedType: result.detectedType,
      models: models.map((id) => ({ id })),
      streaming,
    })
    if (detection) {
      provider.capabilities = capabilities
      provider.type = provider.type === 'custom' ? 'custom' : (apiKind as ProviderApiKind)
    }
    return {
      ok: true,
      latencyMs: Date.now() - start,
      models: models.slice(0, 20),
      capabilities,
    }
  } catch (e: any) {
    const friendly = classifyNetworkError(e, provider.baseUrl)
    if (friendly.category !== 'unknown') {
      return { ok: false, latencyMs: Date.now() - start, error: friendly.message, capabilities: buildCapabilities({ apiKind: apiKind as ProviderApiKind, detectedType: result.detectedType, models: [], streaming: false }) }
    }
    // Fall back to trying the chat completions endpoint
    try {
      const { getEndpointForPath } = await import('../services/ai/providers')
      const url = getEndpointForPath(provider, '/chat/completions')
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': provider.apiKey,
          'anthropic-version': '2023-06-01',
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: provider.models[0]?.id || 'test',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        const friendlyHttp = classifyHttpError(res.status, body, result.detectedType)
        return { ok: false, latencyMs: Date.now() - start, error: friendlyHttp.message }
      }
      return { ok: true, latencyMs: Date.now() - start }
    } catch (e2: any) {
      const friendly2 = classifyNetworkError(e2, provider.baseUrl)
      return { ok: false, latencyMs: Date.now() - start, error: friendly2.message || 'Connection failed' }
    }
  }
}

async function testGemini(provider: ProviderConfig, detection?: DetectionResult): Promise<{ ok: boolean; latencyMs: number; error?: string; models?: string[]; capabilities?: ProviderCapabilities }> {
  const start = Date.now()
  const result = detection || detectProviderApi(provider.baseUrl)
  try {
    const base = provider.baseUrl.trim().replace(/\/+$/, '')
    const url = `${base}/models`
    const res = await fetch(url, { headers: { 'x-goog-api-key': provider.apiKey } })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, latencyMs: Date.now() - start, error: classifyHttpError(res.status, body, result.detectedType).message }
    }
    const data: any = await res.json()
    const models = (data.models || []).map((m: any) => m.name)
    const streaming = models.length ? await probeStreaming({ apiKind: 'gemini', baseUrl: provider.baseUrl, apiKey: provider.apiKey, modelId: models[0] }) : false
    return {
      ok: true,
      latencyMs: Date.now() - start,
      models: models.slice(0, 20),
      capabilities: buildCapabilities({ apiKind: 'gemini', detectedType: result.detectedType, models: models.map((m: string) => ({ id: m })), streaming }),
    }
  } catch (e: any) {
    const friendly = classifyNetworkError(e, provider.baseUrl) || { message: e.message || 'Connection failed' }
    return { ok: false, latencyMs: Date.now() - start, error: friendly.message }
  }
}
import { ProviderConfig, ModelConfig, AIMessageParam } from '../../../src/types'
import { get } from '../../database'
import { complete, getEndpointForPath, stream, StreamCallbacks } from './providers'
import { decryptSecret } from '../../security'

export function getDefaultProviderConfigs(): Omit<ProviderConfig, 'id' | 'createdAt' | 'updatedAt' | 'apiKey'>[] {
  return [
    {
      name: 'OpenAI',
      type: 'openai',
      baseUrl: 'https://api.openai.com',
      models: [
        { id: 'gpt-4o', name: 'GPT-4o', providerId: '', supportsStreaming: true, supportsVision: true, contextWindow: 128000 },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', providerId: '', supportsStreaming: true, supportsVision: true, contextWindow: 128000 },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', providerId: '', supportsStreaming: true, contextWindow: 128000 },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', providerId: '', supportsStreaming: true, contextWindow: 16385 },
      ],
      enabled: false,
      isCustom: false,
      color: '#10a37f',
    },
    {
      name: 'Anthropic',
      type: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      models: [
        { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet', providerId: '', supportsStreaming: true, contextWindow: 200000 },
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', providerId: '', supportsStreaming: true, contextWindow: 200000 },
        { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', providerId: '', supportsStreaming: true, contextWindow: 200000 },
      ],
      enabled: false,
      isCustom: false,
      color: '#d97757',
    },
    {
      name: 'Google Gemini',
      type: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      models: [
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', providerId: '', supportsStreaming: true, contextWindow: 2000000 },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', providerId: '', supportsStreaming: true, contextWindow: 1000000 },
        { id: 'gemini-1.5-flash-8b', name: 'Gemini 1.5 Flash 8B', providerId: '', supportsStreaming: true, contextWindow: 1000000 },
      ],
      enabled: false,
      isCustom: false,
      color: '#4285f4',
    },
    {
      name: 'Groq',
      type: 'openai',
      baseUrl: 'https://api.groq.com/openai',
      models: [
        { id: 'qwen/qwen3.8-27b', name: 'Qwen3.8 27B', providerId: '', supportsStreaming: true, supportsVision: true, contextWindow: 131072, maxOutputTokens: 16384 },
        { id: 'qwen/qwen3.6-27b', name: 'Qwen3.6 27B', providerId: '', supportsStreaming: true, contextWindow: 131072 },
        { id: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', providerId: '', supportsStreaming: true, contextWindow: 131072 },
        { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', providerId: '', supportsStreaming: true, contextWindow: 131072 },
        { id: 'groq/compound', name: 'Compound', providerId: '', supportsStreaming: true, contextWindow: 131072 },
        { id: 'groq/compound-mini', name: 'Compound Mini', providerId: '', supportsStreaming: true, contextWindow: 131072 },
      ],
      enabled: false,
      isCustom: false,
      color: '#f55036',
    },
    {
      name: 'OpenRouter',
      type: 'openai',
      baseUrl: 'https://openrouter.ai/api/v1',
      models: [
        { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', providerId: '', supportsStreaming: true, contextWindow: 200000 },
        { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', providerId: '', supportsStreaming: true, contextWindow: 200000 },
        { id: 'openai/gpt-4o', name: 'GPT-4o', providerId: '', supportsStreaming: true, contextWindow: 128000 },
        { id: 'google/gemini-pro-1.5', name: 'Gemini 1.5 Pro', providerId: '', supportsStreaming: true, contextWindow: 2000000 },
        { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', providerId: '', supportsStreaming: true, contextWindow: 131072 },
      ],
      enabled: false,
      isCustom: false,
      color: '#E5F5FF',
    },
    {
      name: 'Ollama',
      type: 'custom',
      baseUrl: 'http://localhost:11434/v1',
      models: [
        { id: 'llama3.1', name: 'Llama 3.1', providerId: '', supportsStreaming: true, contextWindow: 131072 },
        { id: 'llama3.2', name: 'Llama 3.2', providerId: '', supportsStreaming: true, contextWindow: 131072 },
        { id: 'phi3', name: 'Phi 3', providerId: '', supportsStreaming: true, contextWindow: 131072 },
        { id: 'mistral', name: 'Mistral', providerId: '', supportsStreaming: true, contextWindow: 32768 },
        { id: 'qwen2.5', name: 'Qwen 2.5', providerId: '', supportsStreaming: true, contextWindow: 131072 },
      ],
      enabled: false,
      isCustom: true,
      color: '#00C2FF',
    },
    {
      name: 'LM Studio',
      type: 'custom',
      baseUrl: 'http://localhost:1234/v1',
      models: [
        { id: 'local-model', name: 'Local Model', providerId: '', supportsStreaming: true, contextWindow: 32768 },
      ],
      enabled: false,
      isCustom: true,
      color: '#8b5cf6',
    },
  ]
}

export async function getProviderById(id: string): Promise<ProviderConfig | undefined> {
  return get<ProviderRow>('SELECT * FROM providers WHERE id = ?', [id]).then(mapRow)
}

function mapRow(row: ProviderRow | undefined): ProviderConfig | undefined {
  if (!row) return undefined
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    baseUrl: row.base_url,
    apiKey: decryptSecret(row.api_key),
    models: JSON.parse(row.models || '[]'),
    enabled: !!row.enabled,
    isCustom: !!row.is_custom,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

interface ProviderRow {
  id: string
  name: string
  type: ProviderConfig['type']
  base_url: string
  api_key: string
  models: string
  enabled: number
  is_custom: number
  color: string
  created_at: number
  updated_at: number
}

export async function listEnabledProviders(): Promise<ProviderConfig[]> {
  const { all } = await import('../../database')
  const rows = await all<any>('SELECT * FROM providers WHERE enabled = 1')
  return rows.map(mapRowAny)
}

function mapRowAny(row: any): ProviderConfig {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    baseUrl: row.base_url,
    apiKey: decryptSecret(row.api_key),
    models: JSON.parse(row.models || '[]'),
    enabled: !!row.enabled,
    isCustom: !!row.is_custom,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function completeChat(
  provider: ProviderConfig,
  model: ModelConfig,
  messages: AIMessageParam[],
  opts: { temperature?: number; maxTokens?: number } = {}
) {
  return complete(provider, model, messages, opts)
}

export async function streamChat(
  provider: ProviderConfig,
  model: ModelConfig,
  messages: AIMessageParam[],
  callbacks: StreamCallbacks,
  opts: { temperature?: number; maxTokens?: number } = {}
) {
  return stream(provider, model, messages, callbacks, opts)
}

const OPENAI_COMPATIBLE_MODEL_ENDPOINTS = new Set(['openrouter.ai', 'groq.com', 'localhost:11434', 'localhost:1234', '127.0.0.1'])

export async function fetchModelsFromProvider(provider: ProviderConfig): Promise<string[]> {
  try {
    const url = getEndpointForPath(provider, '/models')
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (provider.apiKey) {
      headers['Authorization'] = `Bearer ${provider.apiKey}`
    }
    const res = await fetch(url, { headers })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    const data: any = await res.json()
    if (Array.isArray(data.data)) {
      return data.data.map((m: any) => m.id)
    }
    if (data.models) {
      return data.models.map((m: any) => (typeof m === 'string' ? m : (m.name || m.id)))
    }
    return []
  } catch (e) {
    return []
  }
}

export function scoreProviderCost(provider: ProviderConfig, usage: Record<string, { totalTokens: number; cost: number }>): number {
  const u = usage[provider.id]
  if (!u) return 0.5
  return Math.min(u.totalTokens / 1000000, 1)
}

export async function fetchModelsDetailed(provider: ProviderConfig): Promise<ModelConfig[]> {
  try {
    const url = getEndpointForPath(provider, '/models')
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (provider.apiKey) headers['Authorization'] = `Bearer ${provider.apiKey}`
    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data: any = await res.json()
    const list = Array.isArray(data.data) ? data.data : data.models
    if (!Array.isArray(list)) return []
    return list
      .map((m: any): ModelConfig | null => {
        const id = typeof m === 'string' ? m : m.id || m.name
        if (!id) return null
        return {
          id,
          name: typeof m === 'string' ? id : m.name || m.id || id,
          providerId: provider.id,
          supportsStreaming: true,
          supportsVision: Array.isArray(m.supported_features) ? m.supported_features.includes('image') : !!m.supportsVision,
          contextWindow: m.context_window || m.contextWindow || m.context_length,
          maxOutputTokens: m.max_completion_tokens || m.maxOutputTokens || m.max_tokens,
        }
      })
      .filter((m: ModelConfig | null): m is ModelConfig => m !== null && !!m.id)
  } catch {
    return []
  }
}

export async function syncBuiltinProvidersToPresets(): Promise<void> {
  const { all, run, get } = await import('../../database')
  const flag = await get<any>("SELECT value FROM settings WHERE key = 'builtin_models_synced'")
  if (flag) return
  const presets = getDefaultProviderConfigs()
  for (const def of presets) {
    const rows = await all<any>('SELECT id, models FROM providers WHERE name = ? AND is_custom = 0', [def.name])
    const presetIds = new Set(def.models.map((m) => m.id))
    for (const row of rows) {
      let current: any[] = []
      try {
        current = JSON.parse(row.models || '[]')
      } catch {
        current = []
      }
      if (current.some((m) => presetIds.has(m.id))) continue
      const next = def.models.map((m) => ({ ...m, providerId: row.id }))
      await run('UPDATE providers SET models = ?, updated_at = ? WHERE id = ?', [JSON.stringify(next), Date.now(), row.id])
    }
  }
  await run("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('builtin_models_synced', '1', ?)", [Date.now()])
}
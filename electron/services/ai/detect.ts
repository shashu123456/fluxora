import { ProviderApiKind, ProviderCapabilities } from '../../../src/types'

export interface DetectionResult {
  apiKind: ProviderApiKind
  detectedType: string
  normalizedBaseUrl: string
}

export function detectProviderApi(baseUrl: string): DetectionResult {
  const url = (baseUrl || '').trim().toLowerCase()
  const host = url.replace(/^https?:\/\//, '').split('/')[0] || ''

  if (host.includes('anthropic')) {
    return { apiKind: 'anthropic', detectedType: 'Anthropic', normalizedBaseUrl: url }
  }
  if (host.includes('generativelanguage') || host.includes('googleapis')) {
    return { apiKind: 'gemini', detectedType: 'Google Gemini', normalizedBaseUrl: url }
  }
  if (host.includes('openrouter')) {
    return { apiKind: 'openai', detectedType: 'OpenRouter', normalizedBaseUrl: url }
  }
  if (host.includes('groq')) {
    return { apiKind: 'openai', detectedType: 'Groq', normalizedBaseUrl: url }
  }
  if (host.includes('openai')) {
    return { apiKind: 'openai', detectedType: 'OpenAI', normalizedBaseUrl: url }
  }
  if (url.includes('11434')) {
    return { apiKind: 'openai', detectedType: 'Ollama', normalizedBaseUrl: url }
  }
  if (url.includes('1234')) {
    return { apiKind: 'openai', detectedType: 'LM Studio', normalizedBaseUrl: url }
  }
  if (url.includes('localhost') || host.startsWith('127.')) {
    return { apiKind: 'openai', detectedType: 'Local OpenAI-compatible', normalizedBaseUrl: url }
  }

  const finalUrl = url || 'https://example.com/v1'
  return { apiKind: 'openai', detectedType: 'OpenAI-compatible', normalizedBaseUrl: finalUrl }
}

const VISION_MARKERS = [
  'vision', 'understand', 'multimodal', 'vl', '-omni', 'omni', 'llava', 'bakllava',
  'moondream', 'minicpm-v', 'glm-4v', 'qwen2.5-vl', 'qwen2-vl', 'internvl', 'pixtral',
  'gpt-4o', 'gpt-4.1', 'gpt-4-turbo', 'claude-3-5', 'claude-3-', 'claude-4', 'gemini-1.5', 'gemini-2',
  'paligemma', 'cogvlm', 'idefics', 'llamma3.2-v',
]

export function modelSupportsVision(modelId: string): boolean {
  const id = modelId.toLowerCase()
  return VISION_MARKERS.some((m) => id.includes(m))
}

const CONTEXT_WINDOWS: Array<[string, number]> = [
  ['claude-3-opus', 200000],
  ['claude-3-5-sonnet', 200000],
  ['claude-3-5-haiku', 200000],
  ['claude-3-haiku', 200000],
  ['claude-3-sonnet', 200000],
  ['claude-4', 400000],
  ['claude-3.7', 200000],
  ['gpt-4.1', 1047576],
  ['gpt-4o', 128000],
  ['gpt-4-turbo', 128000],
  ['gpt-4-32k', 32768],
  ['gpt-4', 8192],
  ['gpt-3.5-turbo', 16385],
  ['o1', 200000],
  ['o3', 200000],
  ['gemini-2', 1048576],
  ['gemini-1.5-pro', 2097152],
  ['gemini-1.5-flash', 1048576],
  ['gemini-pro', 32768],
  ['gemma', 8192],
  ['llama3.3', 131072],
  ['llama3.2', 131072],
  ['llama3.1', 131072],
  ['llama3', 8192],
  ['llama-3.1', 131072],
  ['llama-3.3', 131072],
  ['llama-3.2', 131072],
  ['llama-3', 8192],
  ['mixtral', 32768],
  ['qwen2.5', 131072],
  ['qwen2', 131072],
  ['qwen', 32768],
  ['mistral-large', 128000],
  ['mistral-small', 32768],
  ['codestral', 32768],
  ['deepseek', 131072],
  ['command-r', 128000],
  ['command-r-plus', 128000],
  ['groq', 131072],
  ['gpt-oss', 131072],
  ['gemma2', 8192],
]

export function contextWindowForModel(modelId: string, fallback = 32768): number {
  const id = modelId.toLowerCase()
  for (const [key, value] of CONTEXT_WINDOWS) {
    if (id.includes(key)) return value
  }
  return fallback
}

export interface FriendlyError {
  message: string
  category: 'auth' | 'not-found' | 'rate-limit' | 'bad-request' | 'server' | 'network' | 'timeout' | 'unknown'
}

export function classifyHttpError(status: number, body: string, providerName: string): FriendlyError {
  const snippet = body ? ` ${body.replace(/\s+/g, ' ').slice(0, 160)}` : ''
  switch (status) {
    case 401:
    case 403:
      return {
        category: 'auth',
        message: `${providerName} rejected the API key (${status}). Check the key and try again.${status === 403 ? ' Make sure you have access to this model.' : ''}`,
      }
    case 404:
      return {
        category: 'not-found',
        message: `Endpoint not found (404). The base URL may be wrong or should include a path like /v1.${snippet}`,
      }
    case 429:
      return { category: 'rate-limit', message: `${providerName} is rate-limiting you (429). Wait a moment and retry.` }
    case 400:
      return { category: 'bad-request', message: `${providerName} rejected the request (400). Check the base URL and model name.${snippet}` }
    default:
      if (status >= 500) {
        return { category: 'server', message: `${providerName} is having server trouble (${status}).${snippet}` }
      }
      return { category: 'unknown', message: `${providerName} returned an unexpected status (${status}).${snippet}` }
  }
}

export function classifyNetworkError(error: unknown, baseUrl: string, timeoutMs?: number): FriendlyError {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('aborted') || message.includes('timed out')) {
    return { category: 'timeout', message: `Connection timed out. ${timeoutMs ? `Took longer than ${timeoutMs}ms.` : ''} ${baseUrl} may be slow or down.` }
  }
  if (/connection|ECONNREFUSED|ENOTFOUND|ERR_NAME_NOT_RESOLVED|network|fetch failed/i.test(message)) {
    let hint = ''
    if (message.includes('ENOTFOUND') || message.includes('ERR_NAME_NOT_RESOLVED')) hint = ' The domain does not resolve — check for typos.'
    if (message.includes('ECONNREFUSED')) hint = ' Nothing is listening there — is the local server running?'
    const host = (baseUrl || '').replace(/^https?:\/\//, '').split('/')[0]
    return { category: 'network', message: `Could not reach ${host}.${hint} (${message.slice(0, 120)})` }
  }
  return { category: 'unknown', message }
}

export function buildCapabilities(provider: {
  apiKind: ProviderApiKind
  detectedType: string
  models: { id: string }[]
  streaming: boolean
}): ProviderCapabilities {
  const ids = provider.models.map((m) => m.id)
  const contextWindow = ids.length ? Math.max(...ids.map((id) => contextWindowForModel(id))) : 32768
  return {
    apiKind: provider.apiKind,
    detectedType: provider.detectedType,
    supportsStreaming: provider.streaming,
    supportsVision: ids.some((id) => modelSupportsVision(id)),
    contextWindow,
    detectedAt: Date.now(),
  }
}

export async function probeStreaming(provider: {
  apiKind: ProviderApiKind
  baseUrl: string
  apiKey: string
  modelId: string
}): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  try {
    const base = provider.baseUrl.trim().replace(/\/+$/, '')
    if (provider.apiKind === 'anthropic') {
      const res = await fetch(`${base}/messages`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': provider.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: provider.modelId,
          max_tokens: 1,
          stream: true,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      })
      return res.ok && !!res.body
    }
    if (provider.apiKind === 'gemini') {
      const res = await fetch(`${base}/models/${provider.modelId}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': provider.apiKey },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }] }),
      })
      return res.ok && !!res.body
    }
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
      body: JSON.stringify({ model: provider.modelId, stream: true, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
    })
    return res.ok && !!res.body
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
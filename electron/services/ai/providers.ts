import { ProviderConfig, AIMessageParam, ModelConfig, TokenUsage } from '../../../src/types'

interface CompleteResponse {
  content: string
  reasoning?: string
  usage?: TokenUsage
  model?: string
}

export function getProviderApiEndpoint(provider: ProviderConfig): string {
  const url = provider.baseUrl.trim().replace(/\/+$/, '')
  return url
}

export function getEndpointForPath(provider: ProviderConfig, path: string): string {
  const base = getProviderApiEndpoint(provider)
  if (base.endsWith('/v1')) {
    return `${base}${path}`
  }
  if (provider.type === 'gemini') {
    return base
  }
  if (provider.type === 'anthropic') {
    return `${base}${path}`
  }
  return `${base}${path}`
}

export function normalizeBaseUrl(url: string, type: string): string {
  let u = url.trim().replace(/\/+$/, '')
  if (type === 'anthropic' && !u.endsWith('/v1')) {
    u = `${u}/v1`
  }
  if ((type === 'openai' || type === 'custom') && !u.endsWith('/v1')) {
    u = `${u}/v1`
  }
  return u
}

function isOpenAICompatible(provider: ProviderConfig): boolean {
  return provider.type === 'openai' || provider.type === 'custom'
}

function parseUsage(data: any): TokenUsage | undefined {
  if (!data) return undefined
  const pt = data.prompt_tokens ?? data.input_tokens ?? data.promptTokens ?? data.promptTokenCount
  const ct = data.completion_tokens ?? data.output_tokens ?? data.completionTokens ?? data.candidatesTokenCount
  if (pt == null && ct == null) return undefined
  return {
    promptTokens: pt ?? 0,
    completionTokens: ct ?? 0,
    totalTokens: (data.total_tokens ?? data.totalTokens ?? data.totalTokenCount) || (pt ?? 0) + (ct ?? 0),
  }
}

function buildMessagesForOpenAI(messages: AIMessageParam[]): any[] {
  return messages.map((m) => ({
    role: m.role === 'system' ? 'system' : m.role,
    content: m.content,
  }))
}

function buildMessagesForAnthropic(messages: AIMessageParam[]): { system?: string; messages: any[] } {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n')
  const rest = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }))
  return { system, messages: rest }
}

function buildMessagesForGemini(messages: AIMessageParam[]): any[] {
  const parts: { role: string; parts: { text: string }[] }[] = []
  for (const m of messages) {
    if (m.role === 'system') continue
    parts.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })
  }
  return parts
}

export async function complete(
  provider: ProviderConfig,
  model: ModelConfig,
  messages: AIMessageParam[],
  opts: { temperature?: number; maxTokens?: number } = {}
): Promise<CompleteResponse> {
  const { temperature = 0.7, maxTokens } = opts

  if (provider.type === 'anthropic') {
    return completeAnthropic(provider, model, messages, temperature, maxTokens)
  }
  if (provider.type === 'gemini') {
    return completeGemini(provider, model, messages, temperature, maxTokens)
  }
  return completeOpenAICompatible(provider, model, messages, temperature, maxTokens)
}

async function completeOpenAICompatible(
  provider: ProviderConfig,
  model: ModelConfig,
  messages: AIMessageParam[],
  temperature: number,
  maxTokens?: number
): Promise<CompleteResponse> {
  const url = `${getEndpointForPath(provider, '/chat/completions')}`
  const body: any = {
    model: model.id,
    messages: buildMessagesForOpenAI(messages),
    temperature,
  }
  if (maxTokens) body.max_tokens = maxTokens

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API error ${res.status}: ${text.slice(0, 500)}`)
  }
  const data: any = await res.json()
  const content = data.choices?.[0]?.message?.content ?? ''
  return {
    content,
    usage: parseUsage(data.usage),
    model: data.model,
  }
}

async function completeAnthropic(
  provider: ProviderConfig,
  model: ModelConfig,
  messages: AIMessageParam[],
  temperature: number,
  maxTokens?: number
): Promise<CompleteResponse> {
  const { system, messages: rest } = buildMessagesForAnthropic(messages)
  const url = getEndpointForPath(provider, '/messages')
  const body: any = {
    model: model.id,
    max_tokens: maxTokens || 8192,
    temperature,
    messages: rest,
  }
  if (system) body.system = system

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 500)}`)
  }
  const data: any = await res.json()
  return {
    content: data.content?.[0]?.text ?? '',
    usage: parseUsage(data.usage),
    model: data.model,
  }
}

async function completeGemini(
  provider: ProviderConfig,
  model: ModelConfig,
  messages: AIMessageParam[],
  temperature: number,
  maxTokens?: number
): Promise<CompleteResponse> {
  const systemParts = messages
    .filter((m) => m.role === 'system')
    .map((m) => ({ text: m.content }))
  const url = `${getProviderApiEndpoint(provider)}/models/${model.id}:generateContent`
  const body: any = {
    contents: buildMessagesForGemini(messages),
    generationConfig: {
      temperature,
    },
  }
  if (systemParts.length) {
    body.systemInstruction = { parts: systemParts }
  }
  if (maxTokens) body.generationConfig.maxOutputTokens = maxTokens

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': provider.apiKey },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Gemini API error ${res.status}: ${text.slice(0, 500)}`)
  }
  const data: any = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? ''
  return {
    content: text,
    usage: parseUsage(data.usageMetadata),
    model: data.modelVersion?.split('/').pop(),
  }
}

export interface StreamCallbacks {
  onChunk: (text: string) => void
  onReasoning?: (text: string) => void
  onDone: (r: CompleteResponse) => void
  onError: (err: Error) => void
  signal?: AbortSignal
}

export async function stream(
  provider: ProviderConfig,
  model: ModelConfig,
  messages: AIMessageParam[],
  callbacks: StreamCallbacks,
  opts: { temperature?: number; maxTokens?: number } = {}
): Promise<void> {
  if (provider.type === 'anthropic') {
    return streamAnthropic(provider, model, messages, callbacks, opts)
  }
  if (provider.type === 'gemini') {
    return streamGemini(provider, model, messages, callbacks, opts)
  }
  return streamOpenAICompatible(provider, model, messages, callbacks, opts)
}

async function streamOpenAICompatible(
  provider: ProviderConfig,
  model: ModelConfig,
  messages: AIMessageParam[],
  callbacks: StreamCallbacks,
  opts: { temperature?: number; maxTokens?: number } = {}
): Promise<void> {
  const url = `${getEndpointForPath(provider, '/chat/completions')}`
  const body: any = {
    model: model.id,
    messages: buildMessagesForOpenAI(messages),
    temperature: opts.temperature ?? 0.7,
    stream: true,
  }
  if (opts.maxTokens) body.max_tokens = opts.maxTokens

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: callbacks.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`API error ${res.status}: ${text.slice(0, 500)}`)
    }

    const reader = res.body?.getReader()
    if (!reader) throw new Error('No response body')

    let fullText = ''
    let fullUsage: TokenUsage | undefined
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') continue
        try {
          const json = JSON.parse(data)
          const delta = json.choices?.[0]?.delta
          const text = delta?.content ?? ''
          if (text) {
            fullText += text
            callbacks.onChunk(text)
          }
          if (json.usage) {
            fullUsage = parseUsage(json.usage)
          }
        } catch {
          // incomplete JSON, skip
        }
      }
    }

    callbacks.onDone({
      content: fullText,
      usage: fullUsage,
      model: model.id,
    })
  } catch (err: any) {
    if (err.name === 'AbortError') {
      callbacks.onDone({ content: '', model: model.id })
      return
    }
    callbacks.onError(err)
  }
}

async function streamAnthropic(
  provider: ProviderConfig,
  model: ModelConfig,
  messages: AIMessageParam[],
  callbacks: StreamCallbacks,
  opts: { temperature?: number; maxTokens?: number } = {}
): Promise<void> {
  const { system, messages: rest } = buildMessagesForAnthropic(messages)
  const url = getEndpointForPath(provider, '/messages')
  const body: any = {
    model: model.id,
    max_tokens: opts.maxTokens || 8192,
    temperature: opts.temperature ?? 0.7,
    messages: rest,
    stream: true,
  }
  if (system) body.system = system

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: callbacks.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 500)}`)
    }

    const reader = res.body?.getReader()
    if (!reader) throw new Error('No response body')
    const decoder = new TextDecoder()
    let fullText = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        try {
          const json = JSON.parse(data)
          if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
            const text = json.delta.text ?? ''
            if (text) {
              fullText += text
              callbacks.onChunk(text)
            }
          }
          if (json.type === 'message_delta' && json.usage) {
            // usage only available in message_stop
          }
          if (json.type === 'message_stop') {
          }
        } catch {
          // skip incomplete
        }
      }
    }

    callbacks.onDone({
      content: fullText,
      model: model.id,
    })
  } catch (err: any) {
    if (err.name === 'AbortError') {
      callbacks.onDone({ content: '', model: model.id })
      return
    }
    callbacks.onError(err)
  }
}

async function streamGemini(
  provider: ProviderConfig,
  model: ModelConfig,
  messages: AIMessageParam[],
  callbacks: StreamCallbacks,
  opts: { temperature?: number; maxTokens?: number } = {}
): Promise<void> {
  const systemParts = messages
    .filter((m) => m.role === 'system')
    .map((m) => ({ text: m.content }))
  const url = `${getProviderApiEndpoint(provider)}/models/${model.id}:streamGenerateContent?alt=sse`
  const body: any = {
    contents: buildMessagesForGemini(messages),
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
    },
  }
  if (systemParts.length) body.systemInstruction = { parts: systemParts }
  if (opts.maxTokens) body.generationConfig.maxOutputTokens = opts.maxTokens

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': provider.apiKey },
      body: JSON.stringify(body),
      signal: callbacks.signal,
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Gemini API error ${res.status}: ${text.slice(0, 500)}`)
    }

    const reader = res.body?.getReader()
    if (!reader) throw new Error('No response body')
    const decoder = new TextDecoder()
    let fullText = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        try {
          const json = JSON.parse(data)
          const partText = json.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? ''
          if (partText) {
            fullText += partText
            callbacks.onChunk(partText)
          }
        } catch {
          // skip
        }
      }
    }

    callbacks.onDone({
      content: fullText,
      model: model.id,
    })
  } catch (err: any) {
    if (err.name === 'AbortError') {
      callbacks.onDone({ content: '', model: model.id })
      return
    }
    callbacks.onError(err)
  }
}
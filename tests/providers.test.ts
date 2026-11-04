import { describe, it, expect } from 'vitest'
import {
  getProviderApiEndpoint, getEndpointForPath, normalizeBaseUrl,
  complete,
} from '../electron/services/ai/providers'
import type { ProviderConfig, AIMessageParam } from '../src/types'

const openaiProvider: ProviderConfig = {
  id: 'p1', name: 'OpenAI', type: 'openai',
  baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test',
  models: [{ id: 'gpt-4o', name: 'GPT-4o', providerId: 'p1', supportsStreaming: true }],
  enabled: true, isCustom: false, createdAt: '', updatedAt: '',
}

const anthropicProvider: ProviderConfig = {
  ...openaiProvider, id: 'p2', name: 'Anthropic', type: 'anthropic',
  baseUrl: 'https://api.anthropic.com/v1',
}

const geminiProvider: ProviderConfig = {
  ...openaiProvider, id: 'p3', name: 'Gemini', type: 'gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
}

describe('getProviderApiEndpoint', () => {
  it('strips trailing slashes', () => {
    expect(getProviderApiEndpoint({ ...openaiProvider, baseUrl: 'https://api.openai.com/v1///' }))
      .toBe('https://api.openai.com/v1')
  })
  it('preserves base URL', () => {
    expect(getProviderApiEndpoint(openaiProvider)).toBe('https://api.openai.com/v1')
  })
})

describe('getEndpointForPath', () => {
  it('appends path to /v1 base', () => {
    expect(getEndpointForPath(openaiProvider, '/chat/completions'))
      .toBe('https://api.openai.com/v1/chat/completions')
  })
  it('appends path to anthropic base', () => {
    expect(getEndpointForPath(anthropicProvider, '/messages'))
      .toBe('https://api.anthropic.com/v1/messages')
  })
})

describe('normalizeBaseUrl', () => {
  it('appends /v1 for openai type', () => {
    expect(normalizeBaseUrl('https://api.example.com', 'openai')).toBe('https://api.example.com/v1')
  })
  it('appends /v1 for anthropic type', () => {
    expect(normalizeBaseUrl('https://api.anthropic.com', 'anthropic')).toBe('https://api.anthropic.com/v1')
  })
  it('does not double-append /v1', () => {
    expect(normalizeBaseUrl('https://api.openai.com/v1', 'openai')).toBe('https://api.openai.com/v1')
  })
  it('does not append for gemini', () => {
    expect(normalizeBaseUrl('https://generativelanguage.googleapis.com', 'gemini'))
      .toBe('https://generativelanguage.googleapis.com')
  })
  it('strips trailing slashes before processing', () => {
    expect(normalizeBaseUrl('https://api.example.com/', 'openai')).toBe('https://api.example.com/v1')
  })
})

describe('complete (error paths)', () => {
  it('throws on non-ok response for OpenAI', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => ({
      ok: false, status: 401, text: () => Promise.resolve('unauthorized'),
    })) as any

    await expect(complete(
      openaiProvider,
      openaiProvider.models[0] as any,
      [{ role: 'user', content: 'hi' }] as AIMessageParam[],
    )).rejects.toThrow(/API error 401/)

    globalThis.fetch = originalFetch
  })

  it('throws on non-ok response for Anthropic', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => ({
      ok: false, status: 429, text: () => Promise.resolve('rate limited'),
    })) as any

    await expect(complete(
      anthropicProvider,
      openaiProvider.models[0] as any,
      [{ role: 'user', content: 'hi' }] as AIMessageParam[],
    )).rejects.toThrow(/Anthropic API error 429/)

    globalThis.fetch = originalFetch
  })

  it('parses OpenAI response shape', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => ({
      ok: true, status: 200,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'Hello!' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: 'gpt-4o',
      }),
    })) as any

    const result = await complete(
      openaiProvider,
      openaiProvider.models[0] as any,
      [{ role: 'user', content: 'hi' }] as AIMessageParam[],
    )
    expect(result.content).toBe('Hello!')
    expect(result.usage?.totalTokens).toBe(15)
    expect(result.model).toBe('gpt-4o')

    globalThis.fetch = originalFetch
  })

  it('parses Anthropic response shape', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => ({
      ok: true, status: 200,
      json: () => Promise.resolve({
        content: [{ type: 'text', text: 'Hi there' }],
        usage: { input_tokens: 20, output_tokens: 10 },
        model: 'claude-3-5-sonnet',
      }),
    })) as any

    const result = await complete(
      anthropicProvider,
      { id: 'claude-3-5-sonnet', name: 'Claude', providerId: 'p2', supportsStreaming: true } as any,
      [{ role: 'user', content: 'hello' }] as AIMessageParam[],
    )
    expect(result.content).toBe('Hi there')
    expect(result.usage?.promptTokens).toBe(20)
    expect(result.usage?.completionTokens).toBe(10)

    globalThis.fetch = originalFetch
  })

  it('parses Gemini response shape', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => ({
      ok: true, status: 200,
      json: () => Promise.resolve({
        candidates: [{ content: { parts: [{ text: 'Gemini says hi' }] } }],
        usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 8, totalTokenCount: 23 },
      }),
    })) as any

    const result = await complete(
      geminiProvider,
      { id: 'gemini-2.0-flash', name: 'Gemini', providerId: 'p3', supportsStreaming: true } as any,
      [{ role: 'user', content: 'hello' }] as AIMessageParam[],
    )
    expect(result.content).toBe('Gemini says hi')
    expect(result.usage?.totalTokens).toBe(23)

    globalThis.fetch = originalFetch
  })
})

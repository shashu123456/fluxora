import { describe, it, expect } from 'vitest'
import {
  detectProviderApi, modelSupportsVision, contextWindowForModel,
  classifyHttpError, classifyNetworkError, buildCapabilities,
} from '../electron/services/ai/detect'

describe('detectProviderApi', () => {
  it('detects Anthropic', () => {
    const r = detectProviderApi('https://api.anthropic.com/v1')
    expect(r.apiKind).toBe('anthropic')
    expect(r.detectedType).toBe('Anthropic')
  })
  it('detects Google Gemini', () => {
    const r = detectProviderApi('https://generativelanguage.googleapis.com/v1beta')
    expect(r.apiKind).toBe('gemini')
    expect(r.detectedType).toBe('Google Gemini')
  })
  it('detects OpenAI', () => {
    const r = detectProviderApi('https://api.openai.com/v1')
    expect(r.apiKind).toBe('openai')
    expect(r.detectedType).toBe('OpenAI')
  })
  it('detects OpenRouter', () => {
    const r = detectProviderApi('https://openrouter.ai/api/v1')
    expect(r.detectedType).toBe('OpenRouter')
    expect(r.apiKind).toBe('openai')
  })
  it('detects Groq', () => {
    const r = detectProviderApi('https://api.groq.com/openai/v1')
    expect(r.detectedType).toBe('Groq')
  })
  it('detects Ollama by port', () => {
    const r = detectProviderApi('http://localhost:11434/v1')
    expect(r.detectedType).toBe('Ollama')
    expect(r.apiKind).toBe('openai')
  })
  it('detects LM Studio', () => {
    const r = detectProviderApi('http://localhost:1234/v1')
    expect(r.detectedType).toBe('LM Studio')
  })
  it('falls back to generic OpenAI-compatible', () => {
    const r = detectProviderApi('https://my-api.example.com/v1')
    expect(r.apiKind).toBe('openai')
    expect(r.detectedType).toBe('OpenAI-compatible')
  })
  it('handles empty URL', () => {
    const r = detectProviderApi('')
    expect(r.apiKind).toBe('openai')
  })
})

describe('modelSupportsVision', () => {
  it('detects GPT-4o', () => {
    expect(modelSupportsVision('gpt-4o')).toBe(true)
  })
  it('detects Claude 3.5', () => {
    expect(modelSupportsVision('claude-3-5-sonnet-20241022')).toBe(true)
  })
  it('detects Gemini 2', () => {
    expect(modelSupportsVision('gemini-2.0-flash')).toBe(true)
  })
  it('rejects text-only models', () => {
    expect(modelSupportsVision('gpt-3.5-turbo')).toBe(false)
    expect(modelSupportsVision('llama3.2')).toBe(false)
    expect(modelSupportsVision('mistral-large')).toBe(false)
  })
})

describe('contextWindowForModel', () => {
  it('returns Claude 3.5 window', () => {
    expect(contextWindowForModel('claude-3-5-sonnet-20241022')).toBe(200000)
  })
  it('returns GPT-4o window', () => {
    expect(contextWindowForModel('gpt-4o')).toBe(128000)
  })
  it('returns Gemini 1.5 Pro window', () => {
    expect(contextWindowForModel('gemini-1.5-pro')).toBe(2097152)
  })
  it('returns fallback for unknown', () => {
    expect(contextWindowForModel('unknown-model')).toBe(32768)
    expect(contextWindowForModel('unknown-model', 9999)).toBe(9999)
  })
  it('matches substring patterns', () => {
    expect(contextWindowForModel('deepseek-chat-v3')).toBe(131072)
    expect(contextWindowForModel('mixtral-8x7b')).toBe(32768)
  })
})

describe('classifyHttpError', () => {
  it('classifies 401 as auth', () => {
    const r = classifyHttpError(401, '', 'OpenAI')
    expect(r.category).toBe('auth')
    expect(r.message).toContain('OpenAI')
  })
  it('classifies 403 as auth', () => {
    expect(classifyHttpError(403, '', 'Anthropic').category).toBe('auth')
  })
  it('classifies 404 as not-found', () => {
    expect(classifyHttpError(404, '', 'API').category).toBe('not-found')
  })
  it('classifies 429 as rate-limit', () => {
    expect(classifyHttpError(429, '', 'Gemini').category).toBe('rate-limit')
  })
  it('classifies 400 as bad-request', () => {
    expect(classifyHttpError(400, '', 'API').category).toBe('bad-request')
  })
  it('classifies 500 as server', () => {
    expect(classifyHttpError(500, '', 'API').category).toBe('server')
    expect(classifyHttpError(503, '', 'API').category).toBe('server')
  })
  it('classifies unknown as unknown', () => {
    expect(classifyHttpError(418, '', 'API').category).toBe('unknown')
  })
})

describe('classifyNetworkError', () => {
  it('classifies abort as timeout', () => {
    const r = classifyNetworkError(new Error('The operation was aborted'), 'http://localhost')
    expect(r.category).toBe('timeout')
  })
  it('classifies ECONNREFUSED as network', () => {
    const r = classifyNetworkError(new Error('connect ECONNREFUSED 127.0.0.1:11434'), 'http://localhost:11434')
    expect(r.category).toBe('network')
    expect(r.message).toContain('localhost')
  })
  it('classifies ENOTFOUND as network with DNS hint', () => {
    const r = classifyNetworkError(new Error('getaddrinfo ENOTFOUND bad.host'), 'https://bad.host/v1')
    expect(r.category).toBe('network')
    expect(r.message).toContain('domain does not resolve')
  })
  it('falls back to unknown', () => {
    const r = classifyNetworkError(new Error('something weird'), 'http://x')
    expect(r.category).toBe('unknown')
  })
})

describe('buildCapabilities', () => {
  it('builds capabilities from models', () => {
    const caps = buildCapabilities({
      apiKind: 'openai',
      detectedType: 'OpenAI',
      models: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }],
      streaming: true,
    })
    expect(caps.apiKind).toBe('openai')
    expect(caps.supportsStreaming).toBe(true)
    expect(caps.supportsVision).toBe(true)
    expect(caps.contextWindow).toBe(128000)
  })
  it('handles empty model list', () => {
    const caps = buildCapabilities({
      apiKind: 'openai', detectedType: 'Custom', models: [], streaming: false,
    })
    expect(caps.contextWindow).toBe(32768)
    expect(caps.supportsVision).toBe(false)
    expect(caps.supportsStreaming).toBe(false)
  })
  it('picks max context window across models', () => {
    const caps = buildCapabilities({
      apiKind: 'gemini', detectedType: 'Gemini',
      models: [{ id: 'gemini-1.5-flash' }, { id: 'gemini-1.5-pro' }],
      streaming: true,
    })
    expect(caps.contextWindow).toBe(2097152)
  })
})

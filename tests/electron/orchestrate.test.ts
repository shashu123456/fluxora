import { describe, it, expect } from 'vitest'
import { recommend } from '../../electron/services/ai/orchestrate'
import type { ProviderConfig } from '../../src/types'

const providers: ProviderConfig[] = [
  {
    id: 'p1', name: 'OpenAI', type: 'openai', baseUrl: 'https://api.openai.com', apiKey: 'k', hasKey: true,
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', providerId: 'p1', supportsStreaming: true, supportsVision: true, contextWindow: 128000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', providerId: 'p1', supportsStreaming: true, supportsVision: true, contextWindow: 128000 },
    ],
    enabled: true, isCustom: false, createdAt: 0, updatedAt: 0,
  },
  {
    id: 'p2', name: 'Anthropic', type: 'anthropic', baseUrl: 'https://api.anthropic.com', apiKey: 'k', hasKey: true,
    models: [
      { id: 'claude-3-opus', name: 'Claude 3 Opus', providerId: 'p2', supportsStreaming: true, contextWindow: 200000 },
    ],
    enabled: true, isCustom: false, createdAt: 0, updatedAt: 0,
  },
  {
    id: 'p3', name: 'Disabled', type: 'openai', baseUrl: 'x', apiKey: '', hasKey: false,
    models: [{ id: 'm', name: 'M', providerId: 'p3', supportsStreaming: true }],
    enabled: false, isCustom: false, createdAt: 0, updatedAt: 0,
  },
]

describe('recommend', () => {
  it('returns null with no enabled providers', () => {
    expect(recommend({ task: 'fix bug', providers: [] })).toBeNull()
    expect(recommend({ task: 'fix bug', providers: [{ ...providers[0], enabled: false }] })).toBeNull()
  })

  it('routes bugfix tasks and returns workflow', () => {
    const rec = recommend({ task: 'fix the login crash bug', providers })
    expect(rec).toBeTruthy()
    expect(rec!.workflow).toContain('Reproduce')
    expect(rec!.promptTip).toContain('error')
    expect(['p1', 'p2']).toContain(rec!.providerId)
    expect(rec!.confidence).toBeGreaterThanOrEqual(40)
    expect(rec!.confidence).toBeLessThanOrEqual(95)
  })

  it('routes test tasks', () => {
    const rec = recommend({ task: 'write unit tests for the parser', providers })
    expect(rec!.workflow).toContain('failing tests')
  })

  it('routes long-context tasks to long-window model', () => {
    const rec = recommend({ task: 'summarize this entire transcript paste', providers })
    expect(rec!.modelId).toBe('claude-3-opus')
    expect(rec!.workflow).toContain('Chunk')
  })

  it('routes vision tasks to vision-capable model', () => {
    const rec = recommend({ task: 'read this screenshot and describe the ui', providers })
    expect(rec!.modelId).toBe('gpt-4o')
  })

  it('routes quick edits to fast model', () => {
    const rec = recommend({ task: 'small rename of a variable', providers })
    expect(rec!.modelId).toBe('gpt-4o-mini')
  })

  it('uses default workflow for unmatched tasks', () => {
    const rec = recommend({ task: 'zzz unknown task', providers })
    expect(rec!.workflow).toContain('Clarify')
    expect(rec!.reason).toContain('Default')
  })

  it('appends workspace stack to workflow', () => {
    const index: any = { frameworks: ['React', 'Electron'], testDirs: ['tests'] }
    const rec = recommend({ task: 'refactor the auth module', providers, index })
    expect(rec!.workflow).toContain('React')
    expect(rec!.promptTip).toContain('test suite')
  })
})

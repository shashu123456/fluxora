import { describe, it, expect, beforeEach } from 'vitest'
import {
  STAGE_ORDER,
  createWorkflow,
  parsePlan,
  approve,
  advance,
  regress,
  canAdvance,
  markStepDone,
  fail,
  succeed,
  progress,
} from '../src/lib/agentWorkflow'

describe('agentWorkflow', () => {
  it('creates a workflow in plan stage', () => {
    const w = createWorkflow('  add tests  ')
    expect(w.stage).toBe('observe')
    expect(w.task).toBe('add tests')
    expect(w.approved).toEqual([])
    expect(w.log).toHaveLength(1)
    expect(w.failed).toBe(false)
  })

  it('parses markdown checklist into steps with commands', () => {
    const plan = [
      '# Plan',
      '- Run `npm test` first',
      '1. Fix the failing util',
      '* Update docs without command',
      '',
      'non-list line ignored',
    ].join('\n')
    const steps = parsePlan(plan)
    expect(steps).toHaveLength(3)
    expect(steps[0].command).toBe('npm test')
    expect(steps[0].title).toContain('Run')
    expect(steps[1].title).toBe('Fix the failing util')
    expect(steps[2].command).toBeUndefined()
    expect(steps.every((s) => !s.done)).toBe(true)
  })

  it('caps plan parsing at 20 steps', () => {
    const plan = Array.from({ length: 30 }, (_, i) => `- step ${i}`).join('\n')
    expect(parsePlan(plan)).toHaveLength(20)
  })

  it('does not advance without approval', () => {
    const w = createWorkflow('x')
    // observe/understand/analyze/plan don't require approval
    expect(canAdvance(w)).toBe(true)
    const w2 = advance(w)
    expect(w2.stage).toBe('understand')
  })

  it('advances through approved stages in order', () => {
    let w = createWorkflow('x')
    // advance through observe->understand->analyze->plan
    w = advance(w) // understand
    w = advance(w) // analyze
    w = advance(w) // plan
    w.plan = '- one'
    w = advance(w) // plan -> approval
    expect(w.stage).toBe('approval')
    w = approve(w, 'approval')
    expect(canAdvance(w)).toBe(true)
    w = advance(w) // approval -> execute
    expect(w.stage).toBe('execute')
    expect(w.log.some((l) => l.message.includes('Entered stage'))).toBe(true)
  })

  it('execute stage requires all steps done', () => {
    let w = createWorkflow('x')
    w = advance(w)
    w = advance(w)
    w = advance(w)
    w.plan = '- one'
    w = advance(w)
    w = approve(w, 'approval')
    w = advance(w)
    w.steps = parsePlan('- a\n- b')
    expect(canAdvance(w)).toBe(false)
    w = markStepDone(w, w.steps[0].id)
    expect(canAdvance(w)).toBe(false)
    w = markStepDone(w, w.steps[1].id)
    expect(canAdvance(w)).toBe(true)
  })

  it('full happy path reaches done', () => {
    let w = createWorkflow('ship it')
    // advance to plan
    w = advance(w); w = advance(w); w = advance(w)
    w.plan = '- do the thing'
    w.steps = parsePlan(w.plan)
    for (let i = 0; i < 12 && w.stage !== 'next'; i++) {
      if (w.stage === 'approval') w = approve(w, 'approval')
      if (w.stage === 'execute' && w.steps.length && !w.steps[0].done) w = markStepDone(w, w.steps[0].id)
      if (w.stage === 'summarize' && !w.summary.trim()) w = { ...w, summary: 'done' }
      if (w.stage === 'brain') {
        w = advance(w)
        continue
      }
      if (w.stage === 'memory') {
        w = advance(w)
        continue
      }
      if (canAdvance(w)) w = advance(w)
      else break
    }
    expect(w.stage).toBe('next')
    expect(progress(w)).toBe(100)
  })

  it('failure routes to debug and regress returns to execute with approvals trimmed', () => {
    let w = createWorkflow('x')
    w = advance(w); w = advance(w); w = advance(w)
    w.plan = '- one'
    w.steps = parsePlan(w.plan)
    w = advance(w)
    w = approve(w, 'approval'); w = advance(w)
    expect(w.stage).toBe('execute')
    w = markStepDone(w, w.steps[0].id)
    w = advance(w)
    expect(w.stage).toBe('validate')
    w = fail(w, 'boom')
    expect(w.stage).toBe('validate')
    expect(w.failed).toBe(true)
    expect(w.log.some((l) => l.level === 'error' && l.message === 'boom')).toBe(true)
    w = regress(w, 'execute')
    expect(w.stage).toBe('execute')
    expect(w.failed).toBe(false)
    expect(w.approved).not.toContain('validate')
  })

  it('succeed appends a success log entry', () => {
    const w = succeed(createWorkflow('x'), 'all good')
    expect(w.log.at(-1)).toMatchObject({ message: 'all good', level: 'success' })
  })

  it('progress is monotonic across stages', () => {
    const values = STAGE_ORDER.map((_, i) => Math.round((i / (STAGE_ORDER.length - 1)) * 100))
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1])
    expect(values[0]).toBe(0)
    expect(values.at(-1)).toBe(100)
  })
})

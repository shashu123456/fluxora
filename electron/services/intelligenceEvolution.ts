import { get, run } from '../database'
import type { EvolutionStep, WorkspaceIntelligence } from '../../src/types/workspaceIntelligence'
import { buildEvolutionChain, slugify } from '../../src/lib/intelligence/evolution'
import { recordTimelineEvents } from './intelligenceTimeline'
import { diffIntelligence } from '../../src/lib/intelligence/timeline'

/**
 * Brain Evolution persistence.
 *
 * Stores the reasoning chain produced by Workspace Intelligence as Project
 * Brain entries, and records what changed in the Intelligence Timeline.
 */

const KIND_BY_STAGE: Record<EvolutionStep['stage'], string> = {
  observation: 'note',
  reasoning: 'note',
  insight: 'note',
  recommendation: 'todo',
  learning: 'convention',
}

function brainId(workspaceId: string, step: EvolutionStep): string {
  return `intel:${workspaceId}:${step.stage}:${slugify(step.title)}`
}

export async function writeEvolutionSteps(
  workspaceId: string,
  steps: EvolutionStep[]
): Promise<void> {
  const now = Date.now()
  for (const step of steps) {
    const id = brainId(workspaceId, step)
    const kind = KIND_BY_STAGE[step.stage]
    const status = step.stage === 'recommendation' ? 'open' : null
    const tags = JSON.stringify(['intelligence', step.stage])
    const existing = await get<{ id: string; created_at: number }>(
      'SELECT id, created_at FROM project_brain WHERE id = ?',
      [id]
    )
    if (existing) {
      await run(
        `UPDATE project_brain SET content = ?, status = ?, tags = ?, updated_at = ? WHERE id = ?`,
        [step.content, status, tags, now, id]
      )
    } else {
      await run(
        `INSERT INTO project_brain (id, workspace_id, title, content, kind, status, tags, pinned, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'intelligence', ?, ?)`,
        [id, workspaceId, step.title, step.content, kind, status, tags, now, now]
      )
    }
  }
}

/**
 * Applies an intelligence change: records timeline events and refreshes the
 * Brain entries that describe why the workspace looks the way it does.
 */
export async function evolveWorkspace(
  workspaceId: string,
  previous: WorkspaceIntelligence | null,
  next: WorkspaceIntelligence
): Promise<{ events: number; steps: number }> {
  const events = diffIntelligence(workspaceId, previous, next)
  await recordTimelineEvents(events)
  const chain = buildEvolutionChain(next, previous)
  await writeEvolutionSteps(workspaceId, chain)
  return { events: events.length, steps: chain.length }
}

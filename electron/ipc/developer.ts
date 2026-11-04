import { ipcMain } from 'electron'
import { run } from '../database'
import type { LearningEventKind } from '../../src/types/developer'
import type { MemoryEntry as MemoryEntryRow } from '../../src/types'
import { getDeveloperProfile, invalidateProfile } from '../services/developer/profile'
import { getDeveloperInsights } from '../services/developer/insights'
import { getSessionBriefing } from '../services/developer/briefing'
import { getPersonalization, getRecommendationAffinity } from '../services/developer/personalization'
import { getSessions, track } from '../services/developer/sessions'
import { pruneEvents } from '../services/developer/events'
import {
  clearDeveloperMemories,
  createDeveloperMemory,
  deleteDeveloperMemory,
  listDeveloperMemories,
  updateDeveloperMemory,
} from '../services/developer/memory'

const TRACKABLE: LearningEventKind[] = [
  'recommendation_accepted',
  'recommendation_ignored',
  'workspace_switched',
  'chat_created',
  'ai_request',
  'prompt_used',
  'search',
  'file_opened',
  'command_run',
]

let tracked = 0

export function registerDeveloperIpc() {
  ipcMain.handle('developer:profile', async () => getDeveloperProfile())

  ipcMain.handle('developer:insights', async () => {
    const profile = await getDeveloperProfile()
    return getDeveloperInsights(profile)
  })

  ipcMain.handle('developer:sessions', async (_e, limit?: number) => getSessions(limit ?? 20))

  ipcMain.handle('developer:briefing', async (_e, workspaceId?: string | null, focusHint?: string | null) =>
    getSessionBriefing(workspaceId, focusHint)
  )

  ipcMain.handle('developer:personalization', async () => {
    const profile = await getDeveloperProfile()
    return getPersonalization(profile)
  })

  ipcMain.handle('developer:affinity', async () => {
    const profile = await getDeveloperProfile()
    return getRecommendationAffinity(profile)
  })

  ipcMain.handle('developer:overview', async (_e, workspaceId?: string | null, focusHint?: string | null) => {
    const profile = await getDeveloperProfile()
    const [insights, briefing, sessions, personalization] = await Promise.all([
      getDeveloperInsights(profile),
      getSessionBriefing(workspaceId ?? null, focusHint ?? null),
      getSessions(12),
      getPersonalization(profile),
    ])
    return { profile, insights, briefing, sessions, personalization }
  })

  ipcMain.handle(
    'developer:track',
    async (
      _e,
      kind: string,
      input?: { key?: string | null; value?: string | null; workspaceId?: string | null; workspaceName?: string | null }
    ) => {
      if (!TRACKABLE.includes(kind as LearningEventKind)) return false
      await track(kind as LearningEventKind, input || {})
      tracked += 1
      if (tracked % 100 === 0) {
        await pruneEvents()
        invalidateProfile()
      }
      return true
    }
  )

  ipcMain.handle('developer:memory:list', async () => listDeveloperMemories())

  ipcMain.handle('developer:memory:create', async (_e, data: Partial<MemoryEntryRow>) => {
    const entry = await createDeveloperMemory(data)
    invalidateProfile()
    return entry
  })

  ipcMain.handle('developer:memory:update', async (_e, id: string, data: Partial<MemoryEntryRow>) => {
    const entry = await updateDeveloperMemory(id, data)
    invalidateProfile()
    return entry
  })

  ipcMain.handle('developer:memory:delete', async (_e, id: string) => {
    const result = await deleteDeveloperMemory(id)
    invalidateProfile()
    return result
  })

  ipcMain.handle('developer:reset', async (_e, options?: { includeMemory?: boolean }) => {
    await run('DELETE FROM developer_events')
    await run('DELETE FROM work_sessions')
    if (options?.includeMemory) await clearDeveloperMemories()
    invalidateProfile()
    return true
  })
}

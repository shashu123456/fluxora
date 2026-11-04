import { ipcMain } from 'electron'
import { buildWorkspaceIntelligence, getWorkspaceIntelligence } from '../services/workspaceIntelligence'
import { listTimelineEvents } from '../services/intelligenceTimeline'
import { buildEvolutionChain } from '../../src/lib/intelligence/evolution'
import { buildRecommendations } from '../../src/lib/intelligence/recommendations'
import { evolveWorkspace } from '../services/intelligenceEvolution'

/**
 * Workspace Intelligence IPC.
 *
 * One typed surface for every module that needs to reason about a project:
 * Mission Control, Smart Context, the Project Brain, Universal Search, the
 * Coding Agent and the Recommendation Engine.
 */
export function registerIntelligenceIpc() {
  ipcMain.handle('intelligence:get', async (_e, workspaceId: string) => {
    return getWorkspaceIntelligence(workspaceId)
  })

  ipcMain.handle('intelligence:rebuild', async (_e, workspaceId: string) => {
    return buildWorkspaceIntelligence(workspaceId, true)
  })

  ipcMain.handle('intelligence:recommendations', async (_e, workspaceId: string) => {
    const intel = await getWorkspaceIntelligence(workspaceId)
    if (!intel) return []
    return buildRecommendations(intel)
  })

  ipcMain.handle('intelligence:timeline', async (_e, workspaceId: string, limit?: number) => {
    return listTimelineEvents(workspaceId, limit ?? 50)
  })

  ipcMain.handle('intelligence:evolve', async (_e, workspaceId: string) => {
    const intel = await buildWorkspaceIntelligence(workspaceId, true)
    if (!intel) return null
    const chain = buildEvolutionChain(intel, null)
    await evolveWorkspace(workspaceId, null, intel)
    return chain
  })
}

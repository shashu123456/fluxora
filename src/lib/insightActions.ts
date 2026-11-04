import { isAppTab, type BrainInsight } from '@/types'
import { useUIStore } from '@/stores/uiStore'
import { useWorkspaceStore, type WorkspacePanel } from '@/stores/workspaceStore'

const PANEL_ALIASES: Record<string, WorkspacePanel> = {
  explorer: 'explorer',
  files: 'explorer',
  'terminal-git': 'terminal-git',
  terminal: 'terminal-git',
  git: 'terminal-git',
  intelligence: 'intelligence',
  insights: 'intelligence',
  brain: 'brain',
}

function resolvePanel(value: unknown): WorkspacePanel | null {
  return typeof value === 'string' ? PANEL_ALIASES[value] || null : null
}

/**
 * One action vocabulary for every insight surface. Mission Control and the
 * Workspace Brain panel used to carry separate copies of this switch; keeping
 * it here means a new insight action automatically works everywhere.
 */
export async function runInsightAction(insight: BrainInsight, fallbackWorkspaceId: string): Promise<void> {
  const action = insight.action
  if (!action) return

  const ui = useUIStore.getState()
  const workspace = useWorkspaceStore.getState()
  const payload = action.payload || {}
  const targetWorkspace = typeof payload.workspaceId === 'string' ? payload.workspaceId : fallbackWorkspaceId
  const panel = resolvePanel(payload.panel)
  const filePath = typeof payload.filePath === 'string' ? payload.filePath : null

  const focusWorkspace = (nextPanel: WorkspacePanel) => {
    if (targetWorkspace && targetWorkspace !== 'global') {
      workspace.selectWorkspace(targetWorkspace)
    }
    workspace.setPanel(nextPanel)
    if (filePath) workspace.setPendingFile(filePath)
    ui.setActiveTab('workspace')
  }

  try {
    if (action.kind === 'openTab') {
      const tab = payload.tab
      if (tab === 'workspace') {
        focusWorkspace(panel || 'intelligence')
        return
      }
      if (isAppTab(tab)) {
        ui.setActiveTab(tab)
        return
      }
      if (panel) focusWorkspace(panel)
      return
    }

    if (action.kind === 'openWorkspace' || action.kind === 'openFile') {
      focusWorkspace(panel || (action.kind === 'openFile' ? 'explorer' : 'explorer'))
      return
    }

    if (action.kind === 'syncBrain') {
      focusWorkspace('brain')
      await window.api.brain.sync(targetWorkspace)
      return
    }

    if (action.kind === 'runCommand') {
      const command = payload.command
      if (command === 'workspace.index') {
        focusWorkspace('intelligence')
        await workspace.indexWorkspace(targetWorkspace)
        return
      }
      if (command === 'brain.sync') {
        focusWorkspace('brain')
        await window.api.brain.sync(targetWorkspace)
        return
      }
      focusWorkspace(panel || 'terminal-git')
    }
  } catch {
    // Navigation should never fail loudly; the view is still reachable manually.
  }
}

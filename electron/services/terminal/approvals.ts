import { BrowserWindow, dialog } from 'electron'
import { randomUUID } from 'crypto'
import type { TerminalApprovalKind } from '../../../src/types/terminal'

const ONCE_TTL_MS = 5 * 60 * 1000
const SESSION_TTL_MS = 8 * 60 * 60 * 1000

export interface TerminalApproval {
  id: string
  workspaceId: string
  commandHash: string
  command: string
  cwd: string
  kind: TerminalApprovalKind
  createdAt: number
  expiresAt: number
}

const pending = new Map<string, TerminalApproval>()
const sessions = new Map<string, TerminalApproval>()

function sessionKey(workspaceId: string, commandHash: string): string {
  return `${workspaceId}:${commandHash}`
}

function isExpired(approval: TerminalApproval): boolean {
  return approval.expiresAt <= Date.now()
}

export function getSessionApproval(workspaceId: string, commandHash: string): TerminalApproval | null {
  const approval = sessions.get(sessionKey(workspaceId, commandHash))
  if (!approval) return null
  if (isExpired(approval)) {
    sessions.delete(sessionKey(workspaceId, commandHash))
    return null
  }
  return approval
}

export async function requestTerminalApproval(input: {
  workspaceId: string
  workspaceName: string
  command: string
  commandHash: string
  cwd: string
}): Promise<TerminalApproval | null> {
  const parent = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
  if (!parent) return null

  const result = await dialog.showMessageBox(parent, {
    type: 'warning',
    buttons: ['Cancel', 'Run command'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: 'Run terminal command?',
    message: `Run this command in ${input.workspaceName}?`,
    detail: `${input.command}\n\nWorking directory: ${input.cwd}`,
    checkboxLabel: 'Allow this exact command for the rest of this session',
    checkboxChecked: false,
  })

  if (result.response !== 1) return null

  const now = Date.now()
  const kind: TerminalApprovalKind = result.checkboxChecked ? 'session' : 'once'
  const approval: TerminalApproval = {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    commandHash: input.commandHash,
    command: input.command,
    cwd: input.cwd,
    kind,
    createdAt: now,
    expiresAt: now + (kind === 'session' ? SESSION_TTL_MS : ONCE_TTL_MS),
  }

  if (kind === 'session') sessions.set(sessionKey(input.workspaceId, input.commandHash), approval)
  else pending.set(approval.id, approval)
  return approval
}

export function verifyTerminalApproval(
  approval: TerminalApproval | null | undefined,
  workspaceId: string,
  commandHash: string
): approval is TerminalApproval {
  if (!approval) return false
  if (isExpired(approval)) {
    pending.delete(approval.id)
    sessions.delete(sessionKey(approval.workspaceId, approval.commandHash))
    return false
  }
  if (approval.workspaceId !== workspaceId || approval.commandHash !== commandHash) return false
  if (approval.kind === 'session') {
    const stored = sessions.get(sessionKey(approval.workspaceId, approval.commandHash))
    return stored?.id === approval.id
  }
  const stored = pending.get(approval.id)
  return stored?.commandHash === commandHash && stored?.workspaceId === workspaceId
}

export function consumeTerminalApproval(approval: TerminalApproval): void {
  if (approval.kind === 'once') pending.delete(approval.id)
}

export function clearTerminalApprovals(): void {
  pending.clear()
  sessions.clear()
}

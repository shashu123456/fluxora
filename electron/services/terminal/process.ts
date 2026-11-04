import { BrowserWindow } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { run } from '../../database'
import type {
  TerminalActivityEntry,
  TerminalOutputEvent,
  TerminalRunRequest,
  TerminalRunResult,
  TerminalRunStatus,
  TerminalUpdatedEvent,
} from '../../../src/types/terminal'
import { parseCommand, commandHash, normalizeTimeout, redactCommand } from './command'
import { resolveTerminalWorkspace } from './workspace'
import { consumeTerminalApproval, getSessionApproval, requestTerminalApproval, verifyTerminalApproval, type TerminalApproval } from './approvals'
import { TerminalOutputCollector } from './output'
import { updateProjectBrainFromTerminal } from './insights'

const MAX_CONCURRENT = 4
const OUTPUT_EVENT_LIMIT = 96 * 1024

interface RunningCommand {
  runId: string
  workspaceId: string
  workspaceName: string
  command: string
  cwd: string
  status: TerminalRunStatus
  startedAt: number
  child: ChildProcess
  collector: TerminalOutputCollector
  timer: NodeJS.Timeout
  cancelled: boolean
  timedOut: boolean
  binary: boolean
  outputEmitted: number
  approval: TerminalApproval
}

const running = new Map<string, RunningCommand>()

function toEntry(item: RunningCommand): TerminalActivityEntry {
  return {
    runId: item.runId,
    workspaceId: item.workspaceId,
    workspaceName: item.workspaceName,
    command: item.command,
    cwd: item.cwd,
    status: item.status,
    exitCode: null,
    durationMs: Date.now() - item.startedAt,
    startedAt: item.startedAt,
    finishedAt: null,
    cancelled: item.cancelled,
    truncated: item.binary,
    approvedBy: item.approval.kind,
  }
}

function broadcast(channel: string, payload: TerminalUpdatedEvent | TerminalOutputEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }
}

function emitUpdate(entry: TerminalActivityEntry): void {
  broadcast('terminal:updated', {
    runId: entry.runId,
    workspaceId: entry.workspaceId,
    entry,
  })
}

function findExecutable(program: string): { executable: string; viaCmd: boolean } {
  const pathEntries = (process.env.PATH || '')
    .split(path.delimiter)
    .map((entry) => entry.trim().replace(/^"(.*)"$/, '$1'))
    .filter(Boolean)
  const extensions =
    process.platform === 'win32'
      ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
      : ['']
  const hasExtension = path.extname(program).length > 0
  const candidates = hasExtension ? [program] : extensions.map((ext) => `${program}${ext.toLowerCase()}`)
  const names = hasExtension ? [program] : [...candidates, ...extensions.map((ext) => `${program}${ext.toUpperCase()}`)]

  for (const dir of pathEntries) {
    for (const name of names) {
      const candidate = path.join(dir, name)
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          const extension = path.extname(candidate).toLowerCase()
          return { executable: candidate, viaCmd: process.platform === 'win32' && (extension === '.cmd' || extension === '.bat') }
        }
      } catch {
        continue
      }
    }
  }
  throw new Error(`Executable not found: ${program}`)
}

function quoteCmdToken(value: string): string {
  return `"${value.replace(/"/g, '')}"`
}

function buildCmdLine(executable: string, args: string[]): string {
  return [executable, ...args].map(quoteCmdToken).join(' ')
}

function killTree(child: ChildProcess): void {
  if (!child.pid) return
  if (process.platform === 'win32') {
    try {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      })
      killer.on('error', () => child.kill())
    } catch {
      child.kill()
    }
    return
  }
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    child.kill('SIGKILL')
  }
}

async function insertRun(input: {
  runId: string
  workspaceId: string
  command: string
  commandHash: string
  cwd: string
  approvalId: string | null
  status: TerminalRunStatus
  startedAt: number
  approvedBy: string | null
}): Promise<void> {
  try {
    await run(
      `INSERT INTO terminal_history
       (id, workspace_id, command, output, exit_code, cwd, created_at, duration_ms, approved_by,
        command_hash, status, approval_id, output_size, truncated, cancelled, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.runId,
        input.workspaceId,
        input.command,
        '',
        null,
        input.cwd,
        input.startedAt,
        0,
        input.approvedBy,
        input.commandHash,
        input.status,
        input.approvalId,
        0,
        0,
        0,
        null,
      ]
    )
  } catch {
    // Audit storage must never prevent an approved command from running.
  }
}

async function finishAudit(input: {
  runId: string
  status: TerminalRunStatus
  exitCode: number | null
  durationMs: number
  output: string
  outputSize: number
  truncated: boolean
  cancelled: boolean
  finishedAt: number
}): Promise<void> {
  try {
    await run(
      `UPDATE terminal_history
       SET output = ?, exit_code = ?, duration_ms = ?, status = ?, output_size = ?,
           truncated = ?, cancelled = ?, finished_at = ?
       WHERE id = ?`,
      [
        input.output,
        input.exitCode,
        input.durationMs,
        input.status,
        input.outputSize,
        input.truncated ? 1 : 0,
        input.cancelled ? 1 : 0,
        input.finishedAt,
        input.runId,
      ]
    )
  } catch {
    // Audit failures stay silent to the user; the result is still returned.
  }
}

async function authorize(input: {
  workspaceId: string
  workspaceName: string
  command: string
  commandHash: string
  cwd: string
}): Promise<TerminalApproval | null> {
  const session = getSessionApproval(input.workspaceId, input.commandHash)
  if (session) return session
  return requestTerminalApproval(input)
}

export async function runTerminalCommand(rawRequest: unknown): Promise<TerminalRunResult> {
  const request: TerminalRunRequest =
    rawRequest && typeof rawRequest === 'object'
      ? (rawRequest as TerminalRunRequest)
      : { command: '', cwd: '' }

  const runId = randomUUID()
  const startedAt = Date.now()
  const parsed = parseCommand(request.command)
  if (!parsed.ok) {
    return {
      runId,
      status: 'rejected',
      command: typeof request.command === 'string' ? request.command.slice(0, 500) : '',
      cwd: '',
      output: parsed.reason,
      exitCode: null,
      durationMs: 0,
      outputSize: 0,
      truncated: false,
      cancelled: false,
      timedOut: false,
      binary: false,
      error: parsed.reason,
    }
  }

  let workspace
  try {
    workspace = await resolveTerminalWorkspace(request.workspaceId, request.cwd)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Invalid working directory.'
    return {
      runId,
      status: 'rejected',
      command: redactCommand(parsed.command.program, parsed.command.args),
      cwd: '',
      output: reason,
      exitCode: null,
      durationMs: 0,
      outputSize: 0,
      truncated: false,
      cancelled: false,
      timedOut: false,
      binary: false,
      error: reason,
    }
  }

  const display = redactCommand(parsed.command.program, parsed.command.args)
  const hash = commandHash(workspace.workspaceId, parsed.command)

  if (running.size >= MAX_CONCURRENT) {
    return {
      runId,
      status: 'rejected',
      command: display,
      cwd: workspace.cwd,
      output: `Too many commands are already running (limit ${MAX_CONCURRENT}).`,
      exitCode: null,
      durationMs: 0,
      outputSize: 0,
      truncated: false,
      cancelled: false,
      timedOut: false,
      binary: false,
      error: 'Concurrency limit reached.',
    }
  }

  const approval = await authorize({
    workspaceId: workspace.workspaceId,
    workspaceName: workspace.workspaceName,
    command: display,
    commandHash: hash,
    cwd: workspace.cwd,
  })
  if (!verifyTerminalApproval(approval, workspace.workspaceId, hash)) {
    await insertRun({
      runId,
      workspaceId: workspace.workspaceId,
      command: display,
      commandHash: hash,
      cwd: workspace.cwd,
      approvalId: null,
      status: 'rejected',
      startedAt,
      approvedBy: null,
    })
    await finishAudit({
      runId,
      status: 'rejected',
      exitCode: null,
      durationMs: 0,
      output: 'Command was not approved.',
      outputSize: 0,
      truncated: false,
      cancelled: true,
      finishedAt: Date.now(),
    })
    return {
      runId,
      status: 'rejected',
      command: display,
      cwd: workspace.cwd,
      output: 'Command was not approved.',
      exitCode: null,
      durationMs: 0,
      outputSize: 0,
      truncated: false,
      cancelled: true,
      timedOut: false,
      binary: false,
      error: 'Approval was denied or expired.',
    }
  }
  consumeTerminalApproval(approval)

  let executable: { executable: string; viaCmd: boolean }
  try {
    executable = findExecutable(parsed.command.program)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Executable not found.'
    await insertRun({
      runId,
      workspaceId: workspace.workspaceId,
      command: display,
      commandHash: hash,
      cwd: workspace.cwd,
      approvalId: approval.id,
      status: 'rejected',
      startedAt,
      approvedBy: approval.kind,
    })
    await finishAudit({
      runId,
      status: 'rejected',
      exitCode: null,
      durationMs: 0,
      output: reason,
      outputSize: 0,
      truncated: false,
      cancelled: false,
      finishedAt: Date.now(),
    })
    return {
      runId,
      status: 'rejected',
      command: display,
      cwd: workspace.cwd,
      output: reason,
      exitCode: null,
      durationMs: 0,
      outputSize: 0,
      truncated: false,
      cancelled: false,
      timedOut: false,
      binary: false,
      error: reason,
      approvalId: approval.id,
      approvedBy: approval.kind,
    }
  }

  const timeoutMs = normalizeTimeout(request.timeoutMs)
  const useCmd = process.platform === 'win32' && executable.viaCmd
  const command = useCmd ? process.env.ComSpec || 'cmd.exe' : executable.executable
  const args = useCmd
    ? ['/d', '/s', '/c', buildCmdLine(executable.executable, parsed.command.args)]
    : parsed.command.args

  await insertRun({
    runId,
    workspaceId: workspace.workspaceId,
    command: display,
    commandHash: hash,
    cwd: workspace.cwd,
    approvalId: approval.id,
    status: 'running',
    startedAt,
    approvedBy: approval.kind,
  })

  return new Promise<TerminalRunResult>((resolve) => {
    let resolved = false
    let child: ChildProcess
    try {
      child = spawn(command, args, {
        cwd: workspace.cwd,
        shell: false,
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Failed to start command.'
      void finishAudit({
        runId,
        status: 'failed',
        exitCode: null,
        durationMs: Date.now() - startedAt,
        output: reason,
        outputSize: 0,
        truncated: false,
        cancelled: false,
        finishedAt: Date.now(),
      })
      resolve({
        runId,
        status: 'failed',
        command: display,
        cwd: workspace.cwd,
        output: reason,
        exitCode: null,
        durationMs: Date.now() - startedAt,
        outputSize: 0,
        truncated: false,
        cancelled: false,
        timedOut: false,
        binary: false,
        error: reason,
        approvalId: approval.id,
        approvedBy: approval.kind,
      })
      return
    }

    const collector = new TerminalOutputCollector()
    const timer = setTimeout(() => {
      const item = running.get(runId)
      if (!item || resolved) return
      item.timedOut = true
      item.status = 'timed-out'
      killTree(item.child)
    }, timeoutMs)

    const item: RunningCommand = {
      runId,
      workspaceId: workspace.workspaceId,
      workspaceName: workspace.workspaceName,
      command: display,
      cwd: workspace.cwd,
      status: 'running',
      startedAt,
      child,
      collector,
      timer,
      cancelled: false,
      timedOut: false,
      binary: false,
      outputEmitted: 0,
      approval,
    }
    running.set(runId, item)
    emitUpdate(toEntry(item))

    const handleChunk = (chunk: Buffer): void => {
      if (resolved) return
      if (collector.append(chunk)) {
        item.binary = true
        item.status = 'failed'
        killTree(child)
        return
      }
      if (item.outputEmitted < OUTPUT_EVENT_LIMIT) {
        const text = chunk.toString('utf-8')
        item.outputEmitted += chunk.length
        broadcast('terminal:output', { runId, workspaceId: item.workspaceId, chunk: text })
      }
    }

    child.stdout?.on('data', handleChunk)
    child.stderr?.on('data', handleChunk)

    const complete = async (exitCode: number | null, errorMessage?: string): Promise<void> => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      running.delete(runId)
      const finishedAt = Date.now()
      const durationMs = finishedAt - startedAt
      const collected = collector.finish()
      const status: TerminalRunStatus = item.cancelled
        ? 'cancelled'
        : item.timedOut
          ? 'timed-out'
          : item.binary
            ? 'failed'
            : exitCode === 0
              ? 'success'
              : 'failed'
      const output = item.binary
        ? '[Binary output detected and suppressed]'
        : collected.text || '(no output)'
      const finalOutput = errorMessage ? `${output}\n${errorMessage}` : output
      await finishAudit({
        runId,
        status,
        exitCode,
        durationMs,
        output: collected.auditText || errorMessage || '',
        outputSize: collected.totalBytes,
        truncated: collected.truncated,
        cancelled: item.cancelled,
        finishedAt,
      })
      const entry: TerminalActivityEntry = {
        runId,
        workspaceId: item.workspaceId,
        workspaceName: item.workspaceName,
        command: item.command,
        cwd: item.cwd,
        status,
        exitCode,
        durationMs,
        startedAt,
        finishedAt,
        cancelled: item.cancelled,
        truncated: collected.truncated,
        approvedBy: approval.kind,
      }
      emitUpdate(entry)
      void updateProjectBrainFromTerminal(item.workspaceId)
      resolve({
        runId,
        status,
        command: display,
        cwd: workspace.cwd,
        output: finalOutput,
        exitCode,
        durationMs,
        outputSize: collected.totalBytes,
        truncated: collected.truncated,
        cancelled: item.cancelled,
        timedOut: item.timedOut,
        binary: item.binary,
        error: errorMessage,
        approvalId: approval.id,
        approvedBy: approval.kind,
      })
    }

    child.on('error', (error) => {
      void complete(null, `Failed to run command: ${error.message}`)
    })
    child.on('close', (code) => {
      void complete(code)
    })
  })
}

export function cancelTerminalRun(runId: unknown): boolean {
  if (typeof runId !== 'string') return false
  const item = running.get(runId)
  if (!item) return false
  item.cancelled = true
  item.status = 'cancelled'
  killTree(item.child)
  return true
}

export function listRunningCommands(): TerminalActivityEntry[] {
  return Array.from(running.values()).map(toEntry)
}

export function isTerminalRunActive(runId: string): boolean {
  return running.has(runId)
}

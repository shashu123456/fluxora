import { createHash } from 'crypto'
import type { TerminalCommandParts } from '../../../src/types/terminal'

const MAX_COMMAND_LENGTH = 4096
const MAX_ARGUMENTS = 128
const MAX_ARGUMENT_LENGTH = 1024
const FORBIDDEN_CHARS = new Set(['&', '|', ';', '<', '>', '`', '$', '%', '!', '^', '(', ')'])

const SHELL_HOSTS = new Set([
  'cmd',
  'cmd.exe',
  'powershell',
  'powershell.exe',
  'pwsh',
  'pwsh.exe',
  'bash',
  'bash.exe',
  'sh',
  'sh.exe',
  'zsh',
  'fish',
  'csh',
  'ksh',
  'wsl',
  'wsl.exe',
  'cscript',
  'cscript.exe',
  'wscript',
  'wscript.exe',
  'mshta',
  'mshta.exe',
  'rundll32',
  'rundll32.exe',
  'regsvr32',
  'regsvr32.exe',
  'bitsadmin',
  'bitsadmin.exe',
  'certutil',
  'certutil.exe',
  'installutil',
  'installutil.exe',
  'msiexec',
  'msiexec.exe',
])

const BLOCKED_PROGRAMS = new Set([
  'rm',
  'rmdir',
  'del',
  'erase',
  'rd',
  'mkfs',
  'dd',
  'format',
  'diskpart',
  'shutdown',
  'reboot',
  'halt',
  'taskkill',
  'reg',
  'regedit',
  'sc',
  'net',
  'netsh',
  'takeown',
  'icacls',
  'attrib',
  'bcdedit',
  'cipher',
  'schtasks',
  'wmic',
  'sudo',
  'su',
  'doas',
  'runas',
  'chmod',
  'chown',
  'mount',
  'umount',
  'xargs',
  'eval',
  'exec',
  'start',
  'call',
])

const INTERPRETER_EVAL_FLAGS = new Set(['-e', '--eval', '-c', '--command', '-Command', '-EncodedCommand'])

const SECRET_FLAG = /^--?(?:token|password|passwd|secret|api[-_]?key|access[-_]?key|auth|bearer)$/i
const INLINE_SECRET = /((?:token|password|passwd|secret|api[-_]?key|access[-_]?key)\s*[=:]\s*)([^\s"']+)/gi

export type CommandValidation =
  | { ok: true; command: TerminalCommandParts }
  | { ok: false; reason: string }

function reject(reason: string): CommandValidation {
  return { ok: false, reason }
}

function tokenize(input: string): string[] | { error: string } {
  const tokens: string[] = []
  let current = ''
  let inToken = false
  let quote: '"' | "'" | null = null

  for (const char of input) {
    const code = char.charCodeAt(0)
    if (code < 32 || code === 127) return { error: 'Control characters are not allowed.' }
    if (FORBIDDEN_CHARS.has(char)) return { error: `Shell metacharacter "${char}" is not allowed.` }

    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      inToken = true
      continue
    }

    if (char === ' ' || char === '\t') {
      if (inToken) {
        tokens.push(current)
        current = ''
        inToken = false
      }
      continue
    }

    current += char
    inToken = true
  }

  if (quote) return { error: 'Unterminated quoted argument.' }
  if (inToken) tokens.push(current)
  return tokens
}

function checkArguments(program: string, args: string[]): string | null {
  const lowerArgs = args.map((arg) => arg.toLowerCase())

  if (['node', 'node.exe', 'deno', 'bun', 'python', 'python3', 'py', 'ruby', 'perl', 'php'].includes(program)) {
    if (args.some((arg) => INTERPRETER_EVAL_FLAGS.has(arg))) {
      return 'Inline code execution is not allowed.'
    }
  }

  if (program === 'git' || program === 'git.exe') {
    const has = (flag: string) => lowerArgs.includes(flag)
    if ((lowerArgs[0] === 'push' && (has('--force') || has('-f') || lowerArgs.some((arg) => arg.startsWith('--force'))))) {
      return 'Force-pushing is not allowed.'
    }
    if (lowerArgs[0] === 'reset' && has('--hard')) {
      return 'Hard resets are not allowed.'
    }
    if (lowerArgs[0] === 'clean' && (has('-f') || has('--force') || has('-x') || has('-d'))) {
      return 'Destructive git clean is not allowed.'
    }
  }

  if (program === 'find' || program === 'find.exe') {
    if (lowerArgs.some((arg) => arg === '-delete' || arg === '-exec' || arg === '-execdir')) {
      return 'Find with execution or deletion is not allowed.'
    }
  }

  if (program === 'docker' || program === 'docker.exe') {
    const joined = lowerArgs.join(' ')
    if (/(^|\s)(system\s+prune|volume\s+prune|rm\s+-f)/.test(joined)) {
      return 'Destructive docker commands are not allowed.'
    }
  }

  return null
}

export function parseCommand(input: unknown): CommandValidation {
  if (typeof input !== 'string') return reject('Command must be a string.')
  const normalized = input.trim()
  if (!normalized) return reject('Command is empty.')
  if (normalized.length > MAX_COMMAND_LENGTH) return reject('Command is too long.')
  if (/[\u0000-\u001f\u007f]/.test(normalized)) return reject('Control characters are not allowed.')

  const tokens = tokenize(normalized)
  if (!Array.isArray(tokens)) return reject(tokens.error)
  if (tokens.length === 0) return reject('Command is empty.')
  if (tokens.length > MAX_ARGUMENTS + 1) return reject('Too many arguments.')

  const program = tokens[0].toLowerCase()
  if (!/^[a-z0-9._+-]+$/.test(program)) {
    return reject('Program must be a simple executable name, not a path.')
  }
  if (SHELL_HOSTS.has(program)) return reject('Shell and script hosts are not allowed.')
  if (BLOCKED_PROGRAMS.has(program)) return reject(`"${program}" is blocked for security reasons.`)

  const args = tokens.slice(1)
  for (const arg of args) {
    if (arg.length > MAX_ARGUMENT_LENGTH) return reject('An argument is too long.')
  }

  const argumentReason = checkArguments(program, args)
  if (argumentReason) return reject(argumentReason)

  return { ok: true, command: { program, args, display: formatCommand(program, args) } }
}

function quoteForDisplay(value: string): string {
  return /[\s"]/.test(value) ? `"${value.replace(/"/g, '')}"` : value
}

export function formatCommand(program: string, args: string[]): string {
  return [program, ...args].map(quoteForDisplay).join(' ')
}

export function redactCommand(program: string, args: string[]): string {
  const redacted: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const previous = args[index - 1] || ''
    if (SECRET_FLAG.test(previous)) {
      redacted.push('[redacted]')
      continue
    }
    redacted.push(args[index].replace(INLINE_SECRET, '$1[redacted]'))
  }
  return formatCommand(program, redacted)
}

export function commandHash(workspaceId: string, command: TerminalCommandParts): string {
  return createHash('sha256')
    .update(JSON.stringify({ workspaceId, program: command.program, args: command.args }))
    .digest('hex')
}

export function normalizeTimeout(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 60_000
  return Math.min(300_000, Math.max(1_000, Math.floor(value)))
}

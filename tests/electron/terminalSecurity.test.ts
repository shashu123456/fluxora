import { describe, expect, it } from 'vitest'
import {
  commandHash,
  normalizeTimeout,
  parseCommand,
  redactCommand,
} from '../../electron/services/terminal/command'
import {
  TerminalOutputCollector,
  redactOutput,
  summarizeOutput,
} from '../../electron/services/terminal/output'

function parseOk(command: string) {
  const result = parseCommand(command)
  if (!result.ok) throw new Error(`Expected command to parse: ${result.reason}`)
  return result.command
}

describe('terminal command parsing', () => {
  it('parses simple commands and lowercases the program', () => {
    const parsed = parseOk('GIT status')
    expect(parsed.program).toBe('git')
    expect(parsed.args).toEqual(['status'])
  })

  it('preserves quoted arguments as single values', () => {
    const parsed = parseOk('git commit -m "hello world"')
    expect(parsed.args).toEqual(['commit', '-m', 'hello world'])
  })

  it('rejects shell operators and expansion', () => {
    const commands = [
      'git status && whoami',
      'git status; whoami',
      'git status | more',
      'cat file < input',
      'echo hi > output.txt',
      'echo `whoami`',
      'echo $HOME',
      'echo %PATH%',
      '(whoami)',
    ]
    for (const command of commands) {
      expect(parseCommand(command).ok, command).toBe(false)
    }
  })

  it('rejects shell hosts and destructive programs', () => {
    const commands = [
      'powershell -Command whoami',
      'cmd /c dir',
      'bash -lc ls',
      'rm -rf .',
      'del important.txt',
      'sudo ls',
      'shutdown /s',
      'reg query HKLM',
      'taskkill /F /IM node.exe',
    ]
    for (const command of commands) {
      expect(parseCommand(command).ok, command).toBe(false)
    }
  })

  it('rejects interpreter evaluation flags', () => {
    const commands = [
      'node -e "console.log(1)"',
      'python -c "print(1)"',
      'pwsh -Command whoami',
      'perl --eval "1"',
    ]
    for (const command of commands) {
      expect(parseCommand(command).ok, command).toBe(false)
    }
  })

  it('rejects destructive git, find and docker forms', () => {
    const commands = [
      'git push --force',
      'git push -f origin main',
      'git reset --hard HEAD~1',
      'git clean -f',
      'find . -delete',
      'find . -exec rm {} ;',
      'docker system prune -a',
      'docker volume prune',
      'docker rm -f container',
    ]
    for (const command of commands) {
      expect(parseCommand(command).ok, command).toBe(false)
    }
  })

  it('rejects malformed input and executable paths', () => {
    const commands = [
      '',
      '   ',
      './git status',
      'C:\\Windows\\System32\\cmd.exe /c dir',
      'git "unterminated',
      'a'.repeat(4097),
    ]
    for (const command of commands) {
      expect(parseCommand(command).ok, command).toBe(false)
    }
    expect(parseCommand(null).ok).toBe(false)
    expect(parseCommand(42).ok).toBe(false)
  })
})

describe('terminal command hashing and normalization', () => {
  it('hashes the workspace, program and arguments', () => {
    const parts = { program: 'git', args: ['status'], display: 'git status' }
    const first = commandHash('workspace-a', parts)
    expect(first).toMatch(/^[a-f0-9]{64}$/)
    expect(commandHash('workspace-a', parts)).toBe(first)
    expect(commandHash('workspace-b', parts)).not.toBe(first)
    expect(commandHash('workspace-a', { ...parts, args: ['log'] })).not.toBe(first)
  })

  it('defaults and clamps timeouts', () => {
    expect(normalizeTimeout(undefined)).toBe(60000)
    expect(normalizeTimeout(10)).toBe(1000)
    expect(normalizeTimeout(999999)).toBe(300000)
  })

  it('redacts secret flags and inline values', () => {
    const flag = redactCommand('curl', ['--token', 'supersecret'])
    expect(flag).toContain('[redacted]')
    expect(flag).not.toContain('supersecret')

    const inline = redactCommand('tool', ['password=hunter2'])
    expect(inline).toContain('[redacted]')
    expect(inline).not.toContain('hunter2')
  })
})

describe('terminal output collection', () => {
  it('collects text and reports totals', () => {
    const collector = new TerminalOutputCollector()
    collector.append(Buffer.from('hello world'))
    const output = collector.finish()
    expect(output.text).toBe('hello world')
    expect(output.totalBytes).toBe(11)
    expect(output.truncated).toBe(false)
    expect(output.binary).toBe(false)
  })

  it('returns a placeholder for empty output', () => {
    expect(new TerminalOutputCollector().finish().text).toBe('(no output)')
  })

  it('suppresses binary output', () => {
    const collector = new TerminalOutputCollector()
    expect(collector.append(Buffer.from([1, 0, 2, 3]))).toBe(true)
    const output = collector.finish()
    expect(output.binary).toBe(true)
    expect(output.truncated).toBe(true)
    expect(output.text).toBe('[Binary output detected and suppressed]')
    expect(output.auditText).toBe('[binary output]')
  })

  it('bounds large output and marks truncation', () => {
    const collector = new TerminalOutputCollector()
    collector.append(Buffer.alloc(300 * 1024, 97))
    const output = collector.finish()
    expect(output.totalBytes).toBe(300 * 1024)
    expect(output.truncated).toBe(true)
    expect(output.text).toContain('bytes truncated')
    expect(output.text.length).toBeLessThan(output.totalBytes)
  })

  it('redacts secrets from collected output', () => {
    const collector = new TerminalOutputCollector()
    collector.append(Buffer.from('key AKIAABCDEFGHIJKLMNOP token ghp_abcdefghijklmnopqrstuvwxyz0123456789'))
    const output = collector.finish()
    expect(output.text).toContain('[redacted key]')
    expect(output.text).toContain('[redacted token]')
    expect(output.text).not.toContain('AKIAABCDEFGHIJKLMNOP')
  })
})

describe('output redaction and summaries', () => {
  it('redacts supported secret formats', () => {
    const text = [
      'AKIAABCDEFGHIJKLMNOP',
      'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
      'sk-abcdefghijklmnopqrstuvwxyz',
      'Bearer abc.def.ghi',
      'password=hunter2',
      'https://user:pass@example.com/path',
    ].join(' ')
    const redacted = redactOutput(text)
    expect(redacted).toContain('[redacted key]')
    expect(redacted).toContain('[redacted token]')
    expect(redacted).toContain('Bearer [redacted]')
    expect(redacted).toContain('[redacted]@')
    expect(redacted).not.toContain('hunter2')
    expect(redacted).not.toContain('AKIAABCDEFGHIJKLMNOP')
  })

  it('collapses whitespace and truncates long summaries', () => {
    const summary = summarizeOutput(`line one\n\nline   two\t${'x'.repeat(400)}`)
    expect(summary.startsWith('line one line two')).toBe(true)
    expect(summary.length).toBeLessThanOrEqual(283)
    expect(summary.endsWith('...')).toBe(true)
  })
})

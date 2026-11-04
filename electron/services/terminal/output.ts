const HEAD_BYTES = 128 * 1024
const TAIL_BYTES = 64 * 1024
const AUDIT_BYTES = 16 * 1024

export interface CollectedOutput {
  text: string
  auditText: string
  totalBytes: number
  truncated: boolean
  binary: boolean
}

export class TerminalOutputCollector {
  private head: Buffer[] = []
  private headBytes = 0
  private tail: Buffer[] = []
  private tailBytes = 0
  private totalBytes = 0
  private binaryDetected = false

  append(chunk: Buffer): boolean {
    if (chunk.length === 0) return false
    this.totalBytes += chunk.length
    if (!this.binaryDetected && chunk.includes(0)) {
      this.binaryDetected = true
      return true
    }

    let remaining = chunk
    if (this.headBytes < HEAD_BYTES) {
      const take = Math.min(HEAD_BYTES - this.headBytes, remaining.length)
      if (take > 0) {
        this.head.push(remaining.subarray(0, take))
        this.headBytes += take
        remaining = remaining.subarray(take)
      }
    }

    if (remaining.length > 0) {
      this.tail.push(remaining)
      this.tailBytes += remaining.length
      while (this.tailBytes > TAIL_BYTES && this.tail.length > 0) {
        const first = this.tail[0]
        const overflow = this.tailBytes - TAIL_BYTES
        if (first.length <= overflow) {
          this.tail.shift()
          this.tailBytes -= first.length
        } else {
          this.tail[0] = first.subarray(overflow)
          this.tailBytes -= overflow
        }
      }
    }
    return false
  }

  finish(): CollectedOutput {
    if (this.binaryDetected) {
      return {
        text: '[Binary output detected and suppressed]',
        auditText: '[binary output]',
        totalBytes: this.totalBytes,
        truncated: true,
        binary: true,
      }
    }

    const head = Buffer.concat(this.head).toString('utf-8')
    const tail = Buffer.concat(this.tail).toString('utf-8')
    const retained = this.headBytes + this.tailBytes
    const omitted = Math.max(0, this.totalBytes - retained)
    const marker = omitted > 0 ? `\n\n[... ${omitted} bytes truncated ...]\n\n` : ''
    const text = redactOutput(`${head}${marker}${tail}`) || '(no output)'
    return {
      text,
      auditText: text.slice(0, AUDIT_BYTES),
      totalBytes: this.totalBytes,
      truncated: omitted > 0,
      binary: false,
    }
  }
}

export function redactOutput(value: string): string {
  return value
    .replace(/\b(AKIA[0-9A-Z]{16})\b/g, '[redacted key]')
    .replace(/\b(gh[pousr]_[A-Za-z0-9]{20,})\b/g, '[redacted token]')
    .replace(/\b(sk-[A-Za-z0-9_-]{16,})\b/g, '[redacted key]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(
      /((?:api[_-]?key|access[_-]?key|token|secret|password|passwd|authorization)\s*[:=]\s*)[^\s"']+/gi,
      '$1[redacted]'
    )
    .replace(/(:\/\/)[^/\s:@]+:[^/\s@]+@/g, '$1[redacted]@')
}

export function summarizeOutput(value: string, limit = 280): string {
  const clean = redactOutput(value).replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  return clean.length > limit ? `${clean.slice(0, limit).trimEnd()}...` : clean
}

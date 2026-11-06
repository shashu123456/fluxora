import { promises as dns } from 'node:dns'
import net from 'node:net'
import { ApiDiscoveryError } from './errors'

export interface PinnedAddress {
  address: string
  family: 4 | 6
}

const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
  ['255.255.255.255', 32],
]

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
  'instance-data',
])

export function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    value = value * 256 + octet
  }
  return value >>> 0
}

/** Expands a trailing dotted-quad (::ffff:1.2.3.4) into two hex groups. */
function normalizeEmbeddedIpv4(ip: string): string {
  if (!ip.includes('.')) return ip
  const lastColon = ip.lastIndexOf(':')
  const candidate = ip.slice(lastColon + 1)
  const octets = candidate.split('.').map(Number)
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return ip
  const high = ((octets[0] << 8) | octets[1]).toString(16)
  const low = ((octets[2] << 8) | octets[3]).toString(16)
  return `${ip.slice(0, lastColon + 1)}${high}:${low}`
}

function ipv6ToGroups(rawIp: string): number[] | null {
  const ip = normalizeEmbeddedIpv4(rawIp)
  const parts = ip.split('::')
  if (parts.length > 2) return null
  const head = parts[0] ? parts[0].split(':') : []
  const tail = parts.length === 2 && parts[1] ? parts[1].split(':') : []
  const missing = 8 - head.length - tail.length
  if (missing < 0) return null
  const groups = [...head, ...Array(missing).fill('0'), ...tail]
  if (groups.length !== 8) return null
  const parsed: number[] = []
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null
    parsed.push(parseInt(group, 16))
  }
  return parsed
}

/** True when the address must never be contacted by an integration. */
export function isBlockedAddress(input: string): boolean {
  const address = input.trim().replace(/^\[|\]$/g, '')
  const family = net.isIP(address)
  if (family === 4) {
    const value = ipv4ToInt(address)
    if (value === null) return true
    return BLOCKED_V4.some(([base, prefix]) => {
      const baseInt = ipv4ToInt(base)
      if (baseInt === null) return false
      const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
      return (value & mask) >>> 0 === (baseInt & mask) >>> 0
    })
  }
  if (family !== 6) return true
  const groups = ipv6ToGroups(address)
  if (!groups) return true

  const isZeroPrefix = groups.slice(0, 5).every((g) => g === 0)
  // ::ffff:a.b.c.d — IPv4-mapped. Judge the embedded IPv4 address.
  if (isZeroPrefix && groups[5] === 0xffff) {
    const embedded = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`
    return isBlockedAddress(embedded)
  }
  if (groups.every((g) => g === 0)) return true // ::
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true // ::1
  if ((groups[0] & 0xfe00) === 0xfc00) return true // fc00::/7 unique local
  if ((groups[0] & 0xffc0) === 0xfe80) return true // fe80::/10 link local
  if ((groups[0] & 0xff00) === 0xff00) return true // ff00::/8 multicast
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true // documentation
  return false
}

export function assertPublicHostname(hostname: string): void {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (!host) throw new ApiDiscoveryError('invalid_url', 'Missing hostname.')
  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new ApiDiscoveryError('blocked_private_address', 'Local and metadata hostnames are blocked.')
  }
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) {
    throw new ApiDiscoveryError('blocked_private_address', 'Local and metadata hostnames are blocked.')
  }
  if (net.isIP(host) && isBlockedAddress(host)) {
    throw new ApiDiscoveryError('blocked_private_address', 'Private and reserved addresses are blocked.')
  }
}

/**
 * Validates a URL produced from the catalog. The renderer never supplies one.
 * HTTPS only, default port only, no credentials, no fragment.
 */
export function assertSafeUrl(rawUrl: string | URL): URL {
  let url: URL
  try {
    url = rawUrl instanceof URL ? rawUrl : new URL(rawUrl)
  } catch {
    throw new ApiDiscoveryError('invalid_url', 'The request URL could not be parsed.')
  }
  if (url.protocol !== 'https:') {
    throw new ApiDiscoveryError('invalid_url', 'Only HTTPS requests are allowed.')
  }
  if (url.username || url.password) {
    throw new ApiDiscoveryError('invalid_url', 'Credentials in the URL are not allowed.')
  }
  if (url.port && url.port !== '443') {
    throw new ApiDiscoveryError('invalid_url', 'Only the default HTTPS port is allowed.')
  }
  if (url.hash) {
    throw new ApiDiscoveryError('invalid_url', 'URL fragments are not allowed.')
  }
  assertPublicHostname(url.hostname)
  return url
}

/** Resolves every address and rejects the request if any of them is private. */
export async function resolvePublicAddress(
  hostname: string,
  lookup: typeof dns.lookup = dns.lookup
): Promise<PinnedAddress> {
  assertPublicHostname(hostname)
  let resolved: Array<{ address: string; family: number }>
  try {
    resolved = (await lookup(hostname, { all: true, verbatim: true })) as Array<{ address: string; family: number }>
  } catch {
    throw new ApiDiscoveryError('network_error', 'The hostname could not be resolved.')
  }
  if (!resolved.length) {
    throw new ApiDiscoveryError('network_error', 'The hostname resolved to no addresses.')
  }
  for (const record of resolved) {
    if (isBlockedAddress(record.address)) {
      throw new ApiDiscoveryError('blocked_private_address', 'The hostname resolves to a private or reserved address.')
    }
  }
  const first = resolved[0]
  return { address: first.address, family: first.family === 6 ? 6 : 4 }
}

/**
 * A `lookup` implementation that always returns the already-validated address,
 * so the socket cannot be re-resolved to a different (rebound) IP.
 */
export function createPinnedLookup(pinned: PinnedAddress) {
  return (_hostname: string, _options: unknown, callback: (...args: any[]) => void) => {
    callback(null, pinned.address, pinned.family)
  }
}

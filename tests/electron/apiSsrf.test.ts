import { describe, it, expect } from 'vitest'
import {
  assertSafeUrl,
  assertPublicHostname,
  createPinnedLookup,
  isBlockedAddress,
  resolvePublicAddress,
} from '../../electron/services/apiDiscovery/ssrf'

const BLOCKED = [
  '0.0.0.0',
  '10.0.0.1',
  '10.255.255.255',
  '100.64.0.1',
  '127.0.0.1',
  '127.1.2.3',
  '169.254.169.254',
  '172.16.0.1',
  '172.31.255.255',
  '192.0.0.8',
  '192.0.2.5',
  '192.168.1.1',
  '198.18.0.1',
  '198.51.100.7',
  '203.0.113.9',
  '224.0.0.1',
  '240.0.0.1',
  '255.255.255.255',
  '::',
  '::1',
  'fc00::1',
  'fd12:3456::1',
  'fe80::1',
  'ff02::1',
  '2001:db8::1',
  '::ffff:127.0.0.1',
  '::ffff:10.0.0.1',
  '::ffff:192.168.0.1',
  '::ffff:169.254.169.254',
]

const ALLOWED = ['93.184.216.34', '1.1.1.1', '8.8.8.8', '2606:4700:4700::1111', '::ffff:1.1.1.1']

describe('SSRF address checks', () => {
  it.each(BLOCKED)('blocks %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true)
  })

  it.each(ALLOWED)('allows public address %s', (address) => {
    expect(isBlockedAddress(address)).toBe(false)
  })

  it('treats unparseable input as blocked', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true)
    expect(isBlockedAddress('')).toBe(true)
  })
})

describe('SSRF hostname checks', () => {
  it.each(['localhost', 'LOCALHOST', 'foo.local', 'svc.internal', 'metadata.google.internal', '127.0.0.1'])(
    'rejects %s',
    (host) => {
      expect(() => assertPublicHostname(host)).toThrow()
    }
  )

  it('accepts a public hostname', () => {
    expect(() => assertPublicHostname('api.github.com')).not.toThrow()
  })
})

describe('SSRF URL checks', () => {
  it('rejects non-HTTPS, custom ports, credentials, and fragments', () => {
    expect(() => assertSafeUrl('http://api.github.com/repos')).toThrow()
    expect(() => assertSafeUrl('https://api.github.com:8443/repos')).toThrow()
    expect(() => assertSafeUrl('https://user:pass@api.github.com/repos')).toThrow()
    expect(() => assertSafeUrl('https://api.github.com/repos#frag')).toThrow()
    expect(() => assertSafeUrl('https://127.0.0.1/repos')).toThrow()
    expect(() => assertSafeUrl('not a url')).toThrow()
  })

  it('accepts a catalog URL', () => {
    const url = assertSafeUrl('https://api.github.com/repos/facebook/react')
    expect(url.hostname).toBe('api.github.com')
  })
})

describe('SSRF DNS resolution', () => {
  const publicLookup = (async () => [
    { address: '93.184.216.34', family: 4 },
    { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
  ]) as any

  const privateLookup = (async () => [{ address: '10.0.0.5', family: 4 }]) as any

  const mixedLookup = (async () => [
    { address: '93.184.216.34', family: 4 },
    { address: '192.168.0.10', family: 4 },
  ]) as any

  it('pins a public address', async () => {
    const pinned = await resolvePublicAddress('example.com', publicLookup)
    expect(pinned).toEqual({ address: '93.184.216.34', family: 4 })
  })

  it('rejects hostnames resolving to private addresses', async () => {
    await expect(resolvePublicAddress('evil.example', privateLookup)).rejects.toThrow()
  })

  it('rejects when any resolved record is private', async () => {
    await expect(resolvePublicAddress('mixed.example', mixedLookup)).rejects.toThrow()
  })

  it('pins the validated address so a rebinding lookup cannot change it', async () => {
    const pinned = await resolvePublicAddress('example.com', publicLookup)
    const lookup = createPinnedLookup(pinned) as unknown as (
      host: string,
      options: unknown,
      cb: (...args: any[]) => void
    ) => void
    const seen: any[] = []
    lookup('rebind.example', {}, (...args: any[]) => seen.push(args))
    expect(seen[0]).toEqual([null, '93.184.216.34', 4])
  })
})

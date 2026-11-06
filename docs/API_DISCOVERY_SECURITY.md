# API Discovery — Security Model

Scope: the approval-first API discovery feature (`electron/services/apiDiscovery/*`,
`electron/ipc/apis.ts`, `src/components/settings/ApiDiscoverySettings.tsx`).

## Assets

1. The user's machine and local network.
2. API keys stored in the main-process vault.
3. The audit trail (what left the machine, when, and with what result).
4. The integrity of the catalog itself.

## Trust boundaries

- **Renderer → main:** the renderer is untrusted for URL construction. It may send only a
  catalog `apiId`, an optional secret, and an audit limit. Every payload is validated.
- **Main → internet:** a single HTTPS GET to a host taken from the catalog, resolved to a
  validated address, with an allowlisted header set.
- **API response → renderer:** text only, capped, escaped, labelled untrusted.

## Threats and controls

### SSRF (server-side request forgery)

| Vector | Control |
|--------|---------|
| Renderer supplies an arbitrary URL | Impossible by contract: no IPC handler accepts a URL, host, method, header, or body. The URL is built in the main process from `baseUrl + sample.path + sample.query`. |
| Catalog points at localhost / RFC1918 | `assertSafeUrl` + `assertPublicHostname` reject local, `.local`, `.internal`, `.localhost`, `metadata.google.internal`, and IP literals in blocked ranges. |
| DNS returns a private address | `resolvePublicAddress` resolves with `{ all: true, verbatim: true }` and rejects if **any** record is private, reserved, loopback, link-local, multicast, or unspecified. |
| IPv6 gaps | `fc00::/7`, `fe80::/10`, `ff00::/8`, `::1`, `::`, `2001:db8::/32`, plus IPv4-mapped `::ffff:a.b.c.d` judged by its embedded IPv4 address. |
| Non-HTTPS or odd port | `https:` only; port must be empty or `443`. |
| Credentials in URL | `url.username`/`url.password` are rejected. |
| Fragment smuggling | `url.hash` is rejected. |

Blocked IPv4 ranges: `0.0.0.0/8`, `10/8`, `100.64/10`, `127/8`, `169.254/16`, `172.16/12`,
`192.0.0/24`, `192.0.2/24`, `192.168/16`, `198.18/15`, `198.51.100/24`, `203.0.113/24`,
`224/4`, `240/4`, `255.255.255.255/32`.

### DNS rebinding

`resolvePublicAddress` returns a pinned `{ address, family }`, and the request is made with
`createPinnedLookup(pinned)` as the socket `lookup` function. The socket therefore never
performs a second, uncontrolled resolution between validation and connect. Covered by
`tests/electron/apiSsrf.test.ts` ("pins the validated address so a rebinding lookup cannot
change it").

### Redirects

Automatic redirect following is disabled. Each hop is handled manually:

- maximum 3 redirects,
- the target is re-parsed with `assertSafeUrl`,
- the target host must equal the original catalog host,
- DNS is re-resolved and re-validated for the new hop,
- the pinned lookup is replaced with the new validated address.

A redirect to another host returns `blocked_redirect`; a redirect to a private address
returns `blocked_private_address`. Both are audited.

### Secrets

- Stored only in the existing vault (`secret_records`, `owner_type = 'api'`,
  `kind = 'api-key'`), through `SecretVault.seal` — the same OS-encrypted path as provider
  keys. There is no second secret system.
- The renderer receives a 12-character SHA-256 fingerprint and connection state, never the
  value. No handler returns `encrypted_payload`.
- Secrets are never written to audit rows, errors, logs, or fixtures; audit rows contain
  only the URL **path**, never the query string.
- Removing a credential deletes the secret row and disables the connection.
- `secret` must be 1–4096 characters after trimming; wrong types are rejected.

### Response handling

- 1 MB cap; the stream is destroyed when exceeded and the result is `too_large`.
- Content type must be `application/json`, `application/*+json`, or `text/plain`. HTML is
  rejected rather than rendered.
- The preview is capped at 4,000 characters and displayed in a `<pre>` as text.
- No cookies are sent, no proxy environment variables are honoured, no client certificates.

### Prompt injection

API responses are untrusted display data. They are never sent to an LLM, never parsed as
instructions, and are visibly labelled "Untrusted API response". There is no tool-calling
or model-visible path from an API response in this feature.

### Rate limits and abuse

Per-API 5-second interval and 30 requests/minute globally, enforced in the main process
before any socket is opened. Attempts rejected by the limiter are still audited as
`rate_limited`, so a scripted loop is visible in the log.

### Audit integrity

Append-only from the UI's perspective (no update or delete handler exists), capped at 500
rows, pruned after each write. No secret, header, cookie, or body column exists in the
schema — enforced by a test that inspects `PRAGMA table_info`.

## Residual risks

1. **Catalog compromise.** A malicious app release could add an entry pointing at a
   hostile public host. The SSRF rules limit this to public HTTPS endpoints, but a public
   host can still receive whatever that endpoint is sent. Mitigation: catalog review and
   the visible "what leaves your machine" panel before each test.
2. **Public-host redirects within the same host.** Same-host redirects are followed up to
   3 hops; a compromised host can redirect within itself. Impact is bounded by the same
   host and the 1 MB / content-type / timeout controls.
3. **Third-party data collection.** Once the request leaves the machine, the provider's
   policy applies. The catalog quotes documented auth and quota behaviour but cannot
   enforce it.
4. **Key scope.** A key with broader permissions than the tested endpoint is stored as
   given. The app does not verify provider-side scopes.
5. **Timing side channels.** Response durations are shown; this is not a hardened
   network oracle and makes no timing guarantees.
6. **No certificate pinning.** Standard Node TLS validation is used.
7. **Audit retention is local.** Deleting the app data directory removes the audit trail.

## Verification checklist

- [x] Loopback, RFC1918, link-local, metadata, multicast, reserved IPv4 blocked.
- [x] IPv6 loopback, ULA, link-local, multicast, documentation range blocked.
- [x] IPv4-mapped IPv6 private addresses blocked.
- [x] Hostnames resolving to private addresses blocked.
- [x] Redirect to private address blocked.
- [x] Redirect to unapproved host blocked.
- [x] Pinned lookup ignores a rebinding hostname argument.
- [x] Timeout, size cap, content type, and rate limits enforced with typed results.
- [x] Audit rows contain no query string, secret, or body.
- [x] IPC rejects unknown ids and URL/host/method injection.
- [ ] Keyed live request against a real third-party API — not run (no credential in CI).

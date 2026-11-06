# API Discovery — 90-second demo

Preconditions: a built app (`npm run build`), a workspace open, Settings reachable.

| Time | Action | What to say |
|------|--------|-------------|
| 0:00 | Settings → search "API" → API Discovery (Beta) | "This is a curated catalog, not a marketplace. Twenty APIs, six categories, catalog v1.0.0, verified 2026-11-06." |
| 0:10 | Point at the privacy line | "Requests leave from this machine. Fluxora never proxies them." |
| 0:15 | Type `weather` in search | "Search covers name, description, category, and tags." |
| 0:22 | Open **Open-Meteo Forecast** | "Base domain, docs link, exact sample request, what leaves the machine, risk, and the verified date." |
| 0:32 | Press **Test request** | "Nothing is sent yet — this is the confirmation." |
| 0:38 | Read the confirmation line, press **Send test request** | "GET, exact host, exact path. That is all this button will do." |
| 0:48 | Show the result panel | "HTTP 200, duration, size, and a capped preview labelled untrusted." |
| 0:56 | Scroll to the audit log | "One row, path only — no query string, no key, no body." |
| 1:05 | Open **TheCatAPI**, paste a test key, Save | "The key goes into the OS-encrypted main-process vault. I get a fingerprint back, never the key." |
| 1:12 | Test it, show the second audit row | "Same flow, now with `x-api-key`." |
| 1:20 | Attempt a blocked case (offline, or an API that now redirects cross-host) | "Blocked is a first-class outcome — it is audited too." |
| 1:30 | End on the audit log | "Exactly what left the machine, in order." |

## Blocked-path demo (safe)

Two reliable ways to show a block without a hostile network:

1. Disconnect the machine from the network, then test any API → `network_error`, audited.
2. Test twice within 5 seconds → `rate_limited`, audited, and **no** request is made.

Do not edit the catalog to point at a private host just for the demo; the SSRF matrix in
`tests/electron/apiSsrf.test.ts` is the reproducible proof for that case.

## Case study (README summary)

- **Problem:** users are told "use an API" and left to hunt for docs, keys, and auth
  schemes, with no record of what the app sent where.
- **Why autonomy was rejected:** autonomous discovery means crawling, guessing endpoints,
  and sending credentials to hosts nobody approved. It is unbounded SSRF with a pleasant
  name. The curated catalog keeps the set of reachable hosts finite and reviewable.
- **Architecture:** static catalog in the main process → approval-gated executor → vault →
  append-only audit → thin renderer that can only name a catalog id.
- **Security model:** HTTPS-only GET, same-host redirects, DNS pinning, a full private-range
  blocklist including IPv4-mapped IPv6, 10s timeout, 1 MB cap, content-type allowlist,
  rate limits, and path-only audit rows.
- **Tradeoffs:** 20 curated APIs instead of "everything"; no POST; a release needed to add
  an API; keyed flows not exercised end-to-end in CI.
- **Measured:** 415 tests passing (91 new), 48 SSRF cases, 20/20 catalog endpoints probed
  (19 returned JSON 200; Google Books returned 429 from a shared IP).
- **Deliberately not built:** MCP, OAuth, POST/PUT/PATCH/DELETE, scraping, codegen,
  marketplace/billing, background health checks, and any path that feeds API responses to
  an LLM.

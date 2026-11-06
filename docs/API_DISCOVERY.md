# API Discovery

API Discovery is a curated, approval-first way to find a useful API, understand what it
needs, connect a key, and send **one** explicit test request from your machine.

It is not a marketplace, not an agent, and not a crawler. Every request is:

- built by the main process from a fixed catalog entry,
- confirmed by you with the exact host and path on screen,
- sent GET-only over HTTPS,
- recorded in an append-only audit log.

**Privacy statement shown in the app:** "Requests go directly from this app on your
machine. Fluxora never proxies your data."

## Where it lives

Settings → API Discovery (Beta badge). The card appears in the Providers settings
category and is searchable from the Settings search box.

## Catalog

- Version `1.0.0`, 20 APIs, 6 categories, last verified `2026-11-06`.

| # | API | Category | Auth | Risk |
|---|-----|----------|------|------|
| 1 | GitHub REST | Developer Tools | none | low |
| 2 | npm Registry | Developer Tools | none | low |
| 3 | PyPI JSON | Developer Tools | none | low |
| 4 | DEV Community | Developer Tools | none | low |
| 5 | JSONPlaceholder | Developer Tools | none | low |
| 6 | StackExchange | Developer Tools | none | low |
| 7 | World Bank Data | Data & Reference | none | low |
| 8 | Open Library | Data & Reference | none | low |
| 9 | Wikipedia REST | Data & Reference | none | low |
| 10 | Dog CEO | Data & Reference | none | low |
| 11 | TheCatAPI | Data & Reference | `x-api-key` header | medium |
| 12 | Open-Meteo Forecast | Weather & Geo | none | low |
| 13 | Open-Meteo Geocoding | Weather & Geo | none | low |
| 14 | USGS Earthquake | Weather & Geo | none | low |
| 15 | Frankfurter | Finance | none | low |
| 16 | CoinGecko | Finance | `x-cg-demo-api-key` header | medium |
| 17 | Hugging Face Hub | AI & Models | `Authorization: Bearer` | low |
| 18 | OpenRouter Models | AI & Models | none | low |
| 19 | Hacker News | Productivity | none | low |
| 20 | Google Books | Productivity | none | low |

### Catalog policy

1. Exactly 20 entries across exactly 6 categories. If an API fails a legal,
   documentation, or technical check it is **replaced**, never dropped.
2. `baseUrl` and `docsUrl` are HTTPS. Sample paths are relative, start with `/`, and
   contain no `..`, encoded traversal, fragments, userinfo, query strings, or secrets.
3. `verifiedAt` is the date the endpoint was last checked. Endpoints are probed without
   credentials before that date is stamped; a shared-IP quota response (HTTP 429) counts
   as reachable and is labelled as such.
4. No invented quotas. Free-tier text uses the provider's published language; when a
   provider publishes no fixed limit the entry says so instead of guessing.
5. No catalog entry is rated `high` risk today. The filter exists because a future entry
   may be.
6. No entry may redirect to a different host. That is a hard executor rule, so any
   provider that migrates to a CDN host is re-pointed at its canonical host or replaced.

Changes made during verification of this catalog (2026-11-06):

- `github-rest`: sample changed from `facebook/react` (301 → `/repositories/10270250`) to
  the canonical `octocat/Hello-World` (200).
- `rest-countries`: retired. It now 301-redirects to a `files-03.restcountries.com` CDN
  host, which the executor blocks by design. Replaced by World Bank Data (200).
- `frankfurter`: `api.frankfurter.app` 301-redirects to `api.frankfurter.dev`; base URL
  and path were updated to the canonical host so no redirect is needed.
- `google-books`: returned 429 from a shared IP during verification. The endpoint is
  documented and reachable; the quota is the provider's advertised per-project limit.

## Connect flow

1. Open an API card. The detail panel shows the base domain, documentation link, exact
   sample request, "what leaves your machine", free-tier note, and risk.
2. Keyed APIs show a password-style input. Saving stores the key through the existing
   main-process vault (`secret_records`, owner type `api`, kind `api-key`) using the same
   OS-encrypted storage as provider keys.
3. The app never shows the key again. It shows only a 12-character fingerprint and
   Connected/Not connected state.
4. "Remove credential" deletes the stored secret and disables the connection row.

Keyless APIs can be marked connected without a secret; the executor never asks for one.

## Test flow

1. Press **Test request**.
2. A confirmation panel shows the exact method, host, and path. Nothing is sent until you
   press **Send test request**.
3. The main process validates the catalog id, checks the rate limits, loads the key, builds
   the URL, validates the host, resolves and pins DNS, sends the GET, and enforces timeout,
   size, redirect, and content-type rules.
4. The result shows HTTP status, duration, response size, and a bounded preview labelled
   **Untrusted API response**.
5. Every attempt — success, HTTP error, timeout, block, or rate limit — writes one audit
   row.

### Rate limits

- One test per API per 5 seconds.
- 30 test requests per minute globally.
- A blocked attempt returns `rate_limited` **without** making a network request.

### Error codes you may see

`unknown_api`, `auth_required`, `invalid_secret`, `blocked_private_address`,
`blocked_redirect`, `invalid_url`, `timeout`, `too_large`, `unsupported_content_type`,
`rate_limited`, `http_error`, `network_error`, `catalog_invalid`.

## Audit log

Read-only, newest first, capped at 500 rows (pruned after every write).

| Column | Content |
|--------|---------|
| Time | local timestamp |
| API | catalog id |
| Endpoint | **path only** — the query string is never stored, so query-string keys cannot leak |
| Status | HTTP status or `—` |
| ms / Bytes | duration and response size |
| Outcome | `success`, `http_error`, `blocked`, `failed`, `rate_limited` |

No secrets, headers, cookies, or response bodies are stored. Query-string auth is removed
by storing the path alone.

## Limitations

- One API key per catalog entry; no key rotation UX beyond replace.
- No OAuth, POST/PUT/PATCH/DELETE, or custom headers — all deliberately out of scope.
- No background health checks and no requests on startup.
- The renderer cannot supply a URL, host, method, headers, or body. It sends only `apiId`.
- Responses are display data. They are never sent to an LLM and never interpreted as
  instructions.
- Keyed end-to-end tests were not run from CI: no real third-party credentials are
  available there. Keyed paths are covered with injected secrets and injected transports.
- The catalog is bundled with the app; updating it requires a release.

## Measuring it yourself

The dialog-to-first-result time is not instrumented. To reproduce the demo path, see
`docs/API_DISCOVERY_DEMO.md`.

Verification numbers from this build:

- Catalog validation: 8 tests over 20 entries / 6 categories.
- SSRF matrix: 48 tests, including 30 blocked addresses and 5 allowed public addresses.
- Executor: 19 tests over URL building, auth headers, redirects, timeout, size cap,
  content type, rate limits, and audit rows.
- IPC contract: 9 tests, including URL/host/method injection attempts.
- Database: 7 tests over the new tables, indexes, and the 500-row retention cap.

# Changelog

## [Unreleased]

### Added

- **API Discovery (Beta)** — a curated, approval-first catalog of 20 APIs across 6
  categories, with search/filters, a detail panel showing the exact request, key storage
  through the existing vault, an explicit confirmation before every test request, and an
  append-only audit log capped at 500 rows.
  - `electron/services/apiDiscovery/catalog.ts` — catalog v1.0.0, all entries checked
    against their endpoints on 2026-11-06.
  - `electron/services/apiDiscovery/ssrf.ts` — HTTPS-only URL validation, private/reserved
    range blocklist (IPv4 and IPv6, including IPv4-mapped), pinned DNS lookup.
  - `electron/services/apiDiscovery/executor.ts` — GET-only execution, manual same-host
    redirects (max 3), 10s timeout, 1 MB cap, content-type allowlist, 1/5s per API and
    30/min global rate limits.
  - `electron/services/apiDiscovery/audit.ts` — path-only audit rows, 500-row retention.
  - `electron/services/apiDiscovery/secrets.ts` — `api` owner type in the existing
    `secret_records` vault; only a 12-character fingerprint reaches the renderer.
  - `electron/ipc/apis.ts` — seven validated IPC handlers; no handler accepts a URL,
    host, method, headers, or body.
  - `api_connections` and `api_audit_log` tables plus three indexes (additive migration).
  - Settings card with loading, empty, missing-key, blocked, timeout, HTTP-error, and
    network-error states.

### Changed

- `getAllTables()` now reports `api_connections` and `api_audit_log` so data export
  includes them.
- The catalog replaced REST Countries (now cross-host redirect, blocked by design) with
  World Bank Data, re-pointed Frankfurter to `api.frankfurter.dev`, and switched the
  GitHub sample to a canonical repository.

### Security

- The executor refuses non-HTTPS URLs, non-443 ports, credentials in the URL, fragments,
  IP-literal hosts, local/metadata hostnames, cross-host redirects, HTML responses, and
  any response above 1 MB. All refusals are typed and audited.

# Fluxora — Project Reality and API Discovery Feasibility

Read-only investigation. No code was modified to produce this report.

**Method:** direct inspection of `electron/`, `src/`, `tests/`, `package.json`. Claims are marked **Verified** (seen in code), **Likely** (inference), **Missing** (absent), **Risky** (possible with safeguards), or **NOT VERIFIED** (could not confirm). Marketing text in `README.md` and `docs/` was not used as evidence.

---

## 1. Reality check

### What Fluxora is today

A local-first Electron desktop application: React 18 renderer, Electron 28 main process, SQLite storage (15 tables, `electron/database/index.ts`), Zustand state, Tailwind + Radix UI. It stores chats, workspaces, memories, prompts, usage, terminal history and a "project brain" in a local database, and talks to LLM providers from the main process.

**Verified:** 15 `CREATE TABLE` statements in `electron/database/index.ts`; 20 IPC modules in `electron/ipc/`.

### What it does that a chat wrapper does not

Four things are real and non-trivial:

1. **Workspace-confined filesystem access.** Every read/write is validated against registered workspace roots with canonicalised paths, symlink resolution and a trust list (`electron/security-policy.ts:14-242`). A renderer cannot ask for `C:\Users\...\AppData` and get it.
2. **Terminal execution with approval.** Commands are checked against blocked patterns (`security-policy.ts:185`), confined to a workspace cwd (`electron/services/terminal/workspace.ts:30-76`), and can require an explicit approval token (`electron/services/terminal/approvals.ts:19-108`).
3. **Secret boundary.** API keys live in `secret_records`, encrypted, and provider rows return `apiKey: ''` to the renderer (`electron/ipc/providers.ts:27-45`). Keys are injected only inside the main-process stream call.
4. **Local developer intelligence.** Usage, work sessions, developer events, workspace index and a project brain feed dashboards and recommendations (`electron/services/developer/events.ts:34`, `electron/ipc/usage.ts`).

**Verified.** These are the only capabilities that survive the question "could this be a ChatGPT skin?".

### Strongest existing capabilities

- The security policy layer is genuinely defensive and tested (`tests/electron/securityPolicy.test.ts`, `terminalSecurity.test.ts`, `secretBoundary.test.ts`).
- Multi-provider streaming with cancellation, cost estimation and usage recording (`electron/ipc/system.ts:330-410`, `:575`, `:598`).
- A real schema with migration and export/import of fourteen tables (`electron/services/dataTransfer/validation.ts`).
- 324 passing tests across 21 files.

### Weakest, most generic parts

- **The chat surface.** Messages, markdown, attachments, model picker. Correct, but indistinguishable from a hundred open-source projects.
- **Provider setup.** Manual base URL + key form (`SettingsView.tsx:200-340`). Presets exist but are hardcoded and stale.
- **Tools.** `electron/ipc/tools.ts` exposes five fixed file parsers: PDF, image, OCR, JSON, file-type detection. That is not a tool system.
- **No agent loop.** The AI cannot call anything. It receives messages and returns text.
- **Dead code.** `src/lib/intelligence/providerRecommendations.ts` defines five hardcoded providers and is imported by nothing (verified by grep across `src/` and `electron/`).

### What would make a recruiter say "this is different"

Only one thing in the current repo: **the trust boundary**. Sandboxed renderer (`electron/main.ts:186-190`), path confinement, approval-gated terminal, encrypted secrets never exposed to the UI. That is security engineering, not chat UI.

What would not: another provider list, another chat bubble, another dashboard.

### Feature sprawl / imitation

- 20 IPC modules and 15 tables for an app whose visible surface is a chat window. Several are thin.
- `src/lib/intelligence/providerRecommendations.ts` duplicates pricing metadata that `PROVIDER_PRESETS` also holds, and neither is authoritative.
- Two notions of "recommendation" (`orchestrate.recommend`, `providerRecommendations`) with no shared model.

---

## 2. Current AI and provider architecture

### Add / configure / validate / store / select

| Stage | Where | Notes |
|---|---|---|
| Add | `providers:create` (`electron/ipc/providers.ts:72`) | Validates name/type/baseUrl, secret routed to `SecretManager` |
| Configure | `SettingsView.tsx:200-660` | Presets at `:66-140` (openai, anthropic, gemini, groq, openrouter, ollama, lmstudio, custom) |
| Validate | `providers:test` `:181`, `providers:test-config` `:196`, `providers:detect` `:213` | Live HTTP calls; Gemini has a separate path (`:351-357`) |
| Store | `providers` table + `secret_records` | `SecretManager` (`electron/services/secrets/manager.ts:37`) |
| Select | `chat.providerId` / `chat.modelId`; `settings.defaultProviderId`; `ai:auto-route` → `orchestrate.recommend` (`electron/services/ai/orchestrate.ts:51`) | |

### Does selection persist?

**Likely fixed, NOT VERIFIED in the UI.** `chat:update` previously whitelisted snake_case column names while reading camelCase payload keys, so `providerId`/`modelId` were silently dropped. It now maps through `electron/ipc/chatMapping.ts` (verified, tests in `tests/electron/chatMapping.test.ts`). Whether the picker shows and retains the choice end-to-end was not exercised.

### Can the renderer see API keys?

**No — Verified.** `mapRow` returns `apiKey: ''` (`providers.ts:33`). The stream path injects the secret inside `secretManager.withProviderSecret` in the main process (`electron/ipc/system.ts:340-355`). The preload surface exposes no key getter (`electron/preload.ts:43-58`).

### Streaming, cancellation, retries, usage, errors

- **Streaming:** `ai:stream-chat` handler sends `ai:chunk`, `ai:done`, `ai:error` (`electron/ipc/system.ts:330-410`).
- **Cancellation:** `activeStreams` Map of `AbortController`; `ai:stop` aborts (`:408-414`); window destruction now aborts too (`:337-338`).
- **Retries:** **Missing.** No retry or backoff anywhere in `electron/services/ai/` or `electron/ipc/providers.ts` (grep for `retry|backoff` returns only a 429 user-facing message in `detect.ts:126`).
- **Usage:** `recordUsage` (`system.ts:575`), `estimateCost` (`:598`), persisted to the `usage` table.
- **Errors:** mapped to user-facing strings in `detect.ts`; renderer gets `ai:error` with a message.

### Provider presets accuracy

Hardcoded in `src/components/settings/SettingsView.tsx:66-140`.

- Current-generation ids are mixed with retired or superseded ones (e.g. `gpt-4`, `gpt-3.5-turbo`, `claude-3-5-sonnet-20240620`, `gemini-1.5-*`, `mixtral-8x7b-32768`). **Likely stale.** No automated freshness check exists; nothing refreshes these lists.
- `openrouter` and `lmstudio` presets ship with `models: []`, so a user selecting them sees an empty picker until a manual refresh succeeds.
- `ollama` and `lmstudio` point at `localhost` and require no key — the only local providers.

### Health checks, capability metadata, fallback

- Per-call test only. `ProviderCapabilities` (`src/types/index.ts:9-17`) stores `apiKind`, `supportsStreaming`, `supportsVision`, `contextWindow`, `detectedAt` — populated by detection, never refreshed periodically.
- **Missing:** health history, periodic probes, circuit breaking, fallback provider on failure.

### What breaks if a new provider is added today

1. The UI preset must be added in `SettingsView.tsx` — it is not data-driven from the database.
2. The request shape must match one of three adapters in `electron/services/ai/providers.ts` (OpenAI-compatible, Anthropic, Gemini). Anything else needs new code.
3. Model lists must be fetched or the picker stays empty.
4. Cost estimation assumes a known price table (`estimateCost`, `system.ts:598`) — unknown models are likely estimated as zero.

---

## 3. Existing tool, search, and integration surfaces

| Capability | Status | Evidence |
|---|---|---|
| Tool calling / function calling | **Missing** | No `tool_calls`, `function_call` or `tools:` in `electron/services/ai` or `src/lib` |
| Agent workflow | **Partial, UI-only** | Pure state machine `src/lib/agentWorkflow.ts`, rendered by `src/components/workspace/AgentWorkflow.tsx:46`; it does not execute AI-chosen actions |
| MCP support | **Missing** | `'mcp'` appears once, as a secret owner type (`src/types/secrets.ts:1`). No client, server, registry or config |
| Plugin/extension architecture | **Missing** | No loader, manifest or sandbox |
| Terminal execution + approval | **Verified** | `electron/services/terminal/approvals.ts:19-108`; blocked commands and allowlist in `security-policy.ts:185-197` |
| Web search | **Missing** | `search:global` searches local SQLite only (`electron/ipc/search.ts:67`) |
| URL fetching | **Missing** | No fetch-by-URL IPC. Main-process `fetch` exists only for provider APIs |
| File/workspace boundaries | **Verified** | `security-policy.ts:109-160`, `terminal/workspace.ts:30-76` |
| Tool/API registry | **Missing** | `tools:` is five hardcoded IPC channels (`electron/ipc/tools.ts:12-58`) |
| Schema validation for external data | **Missing (library)** | No `zod`/`ajv` in `package.json`. Hand-written guards only, e.g. `electron/services/dataTransfer/validation.ts` |
| Permission model for third-party actions | **Partial** | Path and command policy exist; nothing for network destinations or API scopes |
| Audit log | **Partial** | `developer_events` table (`developer/events.ts:34`) records developer telemetry, not outbound HTTP calls |

**Bottom line:** Fluxora has strong *containment* primitives and zero *integration* primitives. It can safely touch the disk and the shell; it cannot safely touch the network on the user's behalf.

---

## 4. API discovery feasibility

### Evaluation of candidate sources

Confidence is about programmatic usability, not endorsements. Licences must be re-checked at implementation time; they change.

| Source | Programmatic | Reliability | Auth | Licence/indexing | Machine-readable | Safe to auto-integrate |
|---|---|---|---|---|---|---|
| **public-apis/public-apis** (GitHub) | Yes — raw markdown/JSON | High, actively maintained | None for raw file; GitHub API token for search | MIT-licensed repo; attribution required; entries point to third-party terms | Markdown tables (parseable), not a formal schema | **No.** Metadata only. Each linked API has its own terms |
| **GitHub Search API** | Yes | High | Token required for sane rate limits; unauthenticated is severely limited | GitHub ToS restrict scraping; API use is allowed with rate limits | JSON | **Risky.** Discovery yes, auto-integration no |
| **Awesome lists** (awesome-*, per-domain) | Yes — raw README | Varies wildly; many abandoned | None | Per-repo, often CC0/MIT; some omit a licence | Markdown, inconsistent | **No** without per-list curation |
| **OpenAPI/Swagger directories** (e.g. APIs.guru, public OpenAPI indexes) | Yes | Medium-high | None | APIs.guru data is CC0-ish but verify; each spec's own licence governs use | **Yes — OpenAPI 3** | **Best candidate.** Schema exists; still needs per-API terms review |
| **Provider official docs** | Sometimes; usually HTML | High | None | Terms usually forbid automated scraping | Rarely | **No scraping.** Manual curation only |
| **npm / PyPI client packages** | Yes (registry APIs) | High | None | Package licences vary; registry APIs are open | Package metadata, not API semantics | **Risky.** Supply-chain and licence review needed |
| **MCP server registries** | Emerging, inconsistent | Low-medium today | Varies | Often unspecified | Partly (tool manifests) | **Risky.** Executing an MCP server is running third-party code |
| **Hugging Face Hub** | Yes — documented API | High | Optional token | Model licences vary per model | Yes (model cards, OpenAPI-ish) | Models yes; arbitrary Spaces **no** |
| **Free API directories** (random "free API" sites) | Rarely | Low | — | Usually unclear | No | **No.** High scam/abandonment rate |

### Classification the product must present honestly

- **No key required** — rare, usually rate-limited by IP, often unstable.
- **Free tier with key** — the realistic majority. Requires signup and a quota.
- **Paid only** — must be labelled before the user invests effort.
- **Unknown/unreliable** — abandoned, unverifiable, or no published terms.
- **Unsafe to automate** — requires accepting terms on the user's behalf, or executes third-party code (MCP servers, arbitrary packages).

**"All APIs are free" is false and must never appear in the UI.**

### Feasibility verdict

Technically feasible **as a curated, declarative catalog with live enrichment**. Not feasible — legally or safely — as an autonomous crawler that integrates whatever it finds. The difference is the whole product.

---

## 5. Proposed architecture

Reuse what exists; add one layer.

### 5.1 API registry (local, SQLite)

```
api_entries(id, slug, name, category, homepage, docs_url, auth_kind,
            auth_url, base_url, openapi_url, licence, terms_url,
            tier, tier_notes, verified_at, source, source_url, confidence)
api_endpoints(id, api_id, method, path, summary, request_schema, response_schema, dangerous)
api_health(api_id, checked_at, ok, latency_ms, status_code)
api_calls(id, api_id, endpoint, approved_by, request_hash, status, bytes_out, bytes_in, created_at)
```

`api_calls` is the audit log. It stores a hash of the request, never the credential and never the full body.

### 5.2 Discovery service

`electron/services/apis/discovery.ts`

- **Pull, never crawl.** Fetch a small allowlist of HTTPS URLs (APIs.guru index, `public-apis` raw file, a bundled snapshot) with a 4s timeout, 2 MB cap, no cookies, no redirects past the first hop.
- Parse into `ApiEntry` rows. Anything that does not parse is dropped, not guessed.
- **Never** auto-create an enabled integration from a fetched record. Discovery writes candidates; a human promotes them.
- Cache to `api_cache.json`; serve cache when offline; show `verified_at` age in the UI.

### 5.3 Capability graph

Map a user request to candidate APIs without an LLM first:

- Keyword + embedding-free scoring over name, category, description, and endpoint summaries.
- Only if the local index returns nothing does the app ask the configured LLM to *classify* the request into a category, using a fixed prompt. The model never invents an endpoint; it picks from supplied ids.

This keeps the feature functional with zero API keys and makes hallucinated endpoints structurally impossible.

### 5.4 Schema normaliser

`electron/services/apis/normalise.ts`

OpenAPI operation → internal `ToolSpec`:

```ts
interface ToolSpec {
  id: string
  apiId: string
  method: 'GET' | 'POST' | ...
  urlTemplate: string
  params: Array<{ name: string; in: 'path'|'query'|'header'|'body'; required: boolean; schema: unknown }>
  auth: 'none' | 'apiKey' | 'bearer' | 'oauth2'
  sideEffect: 'read' | 'write' | 'destructive'
  description: string
}
```

Everything the model may call is a **declarative HTTP request**. No code generation, no `eval`, no arbitrary scripts.

### 5.5 Auth broker

Extend `SecretManager` (already built) with an `api` owner type:

- User pastes a key → validated by one cheap call → sealed with the existing vault.
- OAuth: **defer**. PKCE in an Electron window is doable but is a separate project.
- Scopes: store per-API permissions (`read` only, allowed hosts, max calls/day).

### 5.6 Sandboxed executor

`electron/services/apis/executor.ts`, main process only:

- Build the URL from the `ToolSpec`, never from model output.
- Reject non-HTTPS, reject loopback/private IPs unless the API is explicitly marked `local` (Ollama/LM Studio).
- Resolve DNS and re-check the IP after redirects; cap redirects at 2.
- Timeout 10s, response cap 1 MB, no streaming into the model by default.
- **Approval gate** for `write` and `destructive`; `read` may run under a per-API "allow read calls" toggle.
- Reuse `developer_events` patterns for `api_calls` audit rows.

### 5.7 Rate limit and health monitor

- Per-API token bucket from the catalog's stated limits; unknown limits default to 10/minute.
- Health probe only when the user opens the API, plus a nightly low-priority check.
- Two consecutive failures → mark `degraded`, stop auto-use, notify.

### 5.8 Consent and policy layer

Before any call leaves the machine, show: API name, host, method, the exact parameters, and whether the body contains workspace content. One approval per API per session for reads; per call for writes.

### 5.9 UI

Settings → **APIs** tab: search, category chips, tier badges, "Last verified", `Test`, `Enable`, `Remove`. A call log beneath. The chat shows a compact "used: OpenWeather (read)" chip on any message that triggered a call.

### Declarative vs executable

- **Declarative:** every API entry, endpoint, auth kind, limit, category.
- **Executable:** one executor, one normaliser, one approval gate. Adding an API must never add code.

---

## 6. Why this would make Fluxora unique

Three different products:

1. **"AI chat with multiple providers"** — a dropdown. Commodity.
2. **"AI that can use tools"** — a tool loop. Now also commodity; most frameworks ship it.
3. **"AI that can discover APIs, evaluate them, and integrate them safely"** — rare. The hard parts are evaluation, consent, and containment, not the tool loop.

Fluxora is positioned for (3) only because it already has (2)'s *safety* half — path policy, approvals, secret vault — and lacks (2)'s *execution* half. Adding a naive tool loop would make it generic. Adding a governed integration layer is the differentiator.

**Honest caveat:** if the feature is "search GitHub for APIs and call them", it is a wrapper around a search API plus `fetch`. The defensibility comes from the registry quality, the approval model and the audit trail.

### Ideal experience

1. User: "what's the weather in Bengaluru this weekend?"
2. Fluxora searches its **local** index → finds OpenWeather (free tier, key required), Open-Meteo (no key).
3. It answers: "Open-Meteo needs no key and covers this. OpenWeather needs a free key. Use Open-Meteo?" with a **Test** button.
4. User approves. Fluxora calls it, shows the raw result, and offers "Save as capability".
5. Next time, the same request runs automatically **within the saved policy** (read-only, 60 calls/hour), and every call appears in the log.

---

## 7. MVP and phased roadmap

### Phase 0 — registry skeleton (small)

SQLite tables, bundled catalog of 15–25 hand-verified APIs across 6 categories, Settings → APIs browser, no execution. Every entry dated and sourced.

*Effort: 2–3 days. Risk: low. Value: proves the UI and the data model.*

### Phase 1 — one live source

Pull APIs.guru's OpenAPI index, normalise specs, merge over the bundled catalog. Read-only browsing plus "Test" for a single endpoint. No model involvement.

*Effort: 3–4 days. Risk: medium (spec variety).*

### Phase 2 — governed execution

Executor with HTTPS-only, DNS re-check, timeouts, caps, approval for writes, audit rows. One "call this endpoint" flow driven by the user, not the model.

*Effort: 4–6 days. Risk: high (SSRF, injection). This is the gate.*

### Phase 3 — capability search in chat

Local index lookup, model chooses among retrieved ids only, read-only calls auto-run under policy, writes always approved.

*Effort: 3–4 days. Risk: medium.*

### Phase 4 — staleness and health

Nightly probes, removal detection with a two-strike rule, notifications.

*Effort: 2 days. Risk: low.*

### Automate without approval

- Reading the bundled catalog.
- Fetching the allowlisted public indexes.
- Read-only calls to an API the user already enabled.

### Always require approval

- Any write/destructive call.
- Any new API's first call.
- Any call that sends workspace or memory content off-device.
- Any OAuth grant.

### Defer

- OAuth flows, MCP execution, arbitrary package installation, auto-integration, publishing a shared registry, a marketplace.

### Must be true before public release

- SSRF tests: loopback, `169.254.169.254`, IPv6-mapped, redirect-to-private, DNS rebinding.
- Prompt-injection tests: malicious API responses attempting to trigger further calls.
- Audit rows for 100% of outbound calls.
- A documented, dated catalog with licences.

---

## 8. Risks and failure modes

| Risk | Why it bites here | Mitigation |
|---|---|---|
| Malicious or abandoned APIs | Catalog entries rot; a hijacked domain serves hostile data | `verified_at`, two-strike removal, domain pinning, no auto-enable |
| Credential leakage | Keys in logs, URLs, or the renderer | Keys only in main; never in URLs; hash request bodies in logs; existing vault |
| Prompt injection via API responses | A response says "now call `POST /transfer`" | Responses are data, never instructions; tool calls come from `ToolSpec`, not model text; writes always approved |
| SSRF / localhost access | Electron main can reach `127.0.0.1`, link-local, cloud metadata | HTTPS-only, DNS resolve + IP range check, re-check after redirect, deny RFC1918/169.254/::1 unless `local` |
| Arbitrary code execution | A generic "run this API client" feature | Declarative specs only; no codegen; no `eval`; no arbitrary npm install |
| Rate limits and surprise costs | Free tiers end; paid keys get charged | Declared limits, token bucket, cost badge before enabling, hard daily cap |
| Licence / ToS violations | Scraping docs, bundling specs | Only index sources whose terms allow it; store links, not copied content, where required |
| Privacy leaks | Workspace text sent to a random API | Pre-flight payload preview; redaction rules; per-API "no workspace data" flag |
| Hallucinated endpoints | An LLM invents `/v9/users` | Model selects only from retrieved ids; executor rejects unknown `ToolSpec` ids |
| Supply chain (packages, MCP) | Running third-party code on the user's machine | Out of MVP; if added, signed manifests + sandboxed process |
| Free services disappearing | Silent breakage | Health monitor, degraded state, notification |
| Tool overload | 40 enabled APIs, unpredictable behaviour | Enabled-by-default cap (e.g. 5), per-API scopes, visible call log |

---

## 9. Decisions needed from the user

1. **Discovery posture:** automatic background crawl, or approval-first with a curated catalog?
2. **Scope:** declarative HTTP APIs only, or also MCP servers and local tools?
3. **Indexing:** bundle a snapshot locally, or query sources live every time (or both)?
4. **Default categories:** all, or start with developer/data/productivity?
5. **Data egress:** may any workspace content leave the device, and under what consent?
6. **Commercial reality:** must every entry show tier and cost before enabling?
7. **Sharing:** is the registry local-only, or exportable so others can import it?
8. **Minimum bar:** is "no key required" the only allowed default, with keyed APIs opt-in?

---

## 10. Final verdict

**Is the idea worth building?** Yes — but only in its governed form. "Discover APIs and use them safely, with consent and an audit trail" is a real differentiator. "Search GitHub and call whatever comes back" is a liability and a wrapper.

**Smallest credible version:** a bundled, dated catalog of 20 APIs across 6 categories, browse-and-test in Settings, one endpoint executed by explicit user action, every call logged. No model autonomy, no crawling, no writes.

**What Fluxora already has that helps:** the path/command policy layer, the approval mechanism, the encrypted secret vault with a proven renderer boundary, the IPC discipline, and 324 tests to build on.

**What is missing:** any outbound-call capability, any tool spec, any registry, any schema validation library, any prompt-injection defence, retries, and a data-driven provider list.

**Build next:** Phase 0 and Phase 1. **Do not build:** a general GitHub crawler, automatic integration, MCP execution, or a marketplace — all before the executor and its SSRF/injection tests exist.

**What would make it genuinely impressive:** a shipped, dated, honest catalog plus an executor that a security reviewer cannot break. The catalog proves judgement; the executor proves engineering. Neither is a chat feature.

---

## Implementation status (2026-11-06)

**Phase 0 — curated catalog, browse, evaluate, audit: IMPLEMENTED**
**Phase 1 — one explicit live test path: IMPLEMENTED**

Delivered files: `electron/services/apiDiscovery/{catalog,ssrf,executor,audit,secrets,errors}.ts`,
`electron/ipc/apis.ts`, preload `window.api.apis`, `api_connections` + `api_audit_log`
migrations, `src/types/apiDiscovery.ts`, `src/stores/apiDiscoveryStore.ts`,
`src/components/settings/ApiDiscoverySettings.tsx`.

Evidence: both typechecks PASS, `npx vitest run` 415/415 PASS (26 files, 91 new),
`npm run build` PASS. Security matrix and residuals: `docs/API_DISCOVERY_SECURITY.md`.

### Deviations from this report

1. **Settings surface is a card, not a tab.** The existing Settings page is a single
   scrolling column of `<Card>` blocks with search and category filters; there is no tab
   bar. API Discovery is therefore a card with a Beta badge inside the Providers category,
   registered in `CARD_META` so Settings search finds it. Behaviour is otherwise identical
   to the "tab" requirement.
2. **REST Countries was replaced, not repaired.** It now 301-redirects to a
   `files-03.restcountries.com` CDN host. The executor blocks cross-host redirects by
   design, so the entry could not pass its own test. It was replaced by **World Bank Data**
   (`https://api.worldbank.org/v2/country/IND?format=json`), keeping the count at 20 and
   the category at 6.
3. **Frankfurter moved host.** `api.frankfurter.app` 301-redirects to
   `api.frankfurter.dev`. The catalog now points at the canonical host and path
   (`/v1/latest`) so no redirect is needed.
4. **GitHub sample changed.** `facebook/react` returns 301 to `/repositories/10270250`; the
   sample now uses `octocat/Hello-World`, which returns 200 directly.
5. **Query-string auth is supported but unused.** No catalog entry authenticates via a
   query parameter today. `buildRequestUrl` handles it, and audit rows store the path only,
   so a query key can never be logged. Tested directly.
6. **`text/*` is limited to `text/plain`.** The brief allowed "text/* where explicitly
   allowed by the catalog"; no catalog entry serves other text types, and HTML must be
   rejected, so the allowlist is `application/json`, `application/*+json`, `text/plain`.
7. **No `high` risk entries.** All 20 vetted APIs are `low` or `medium`. The filter exists
   for future entries rather than being populated artificially.
8. **No live keyed request.** No third-party credential was available in this environment;
   keyed code paths are covered with injected secrets and an injected transport. This is
   recorded as a gap, not as a pass.

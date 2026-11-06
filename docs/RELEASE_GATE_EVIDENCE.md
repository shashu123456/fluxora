# Release Gate V1 Evidence Log

Append one entry per phase. Record the command, result, artifact path, and any environmental limitation. Do not replace previous entries.

## Baseline (2026-11-04)

| Check | Result | Evidence |
|---|---|---|
| Electron TypeScript | PASS | `npx tsc -p electron/tsconfig.json --noEmit` |
| Renderer TypeScript | PASS | `npx tsc -p tsconfig.json --noEmit` |
| Targeted security/trust tests | PASS 70/70 | terminalSecurity, securityPolicy, dataTransferValidation, secretBoundary |
| Renderer production build | PASS (1912 modules) | `npm run build:renderer` after clearing `node_modules/.vite` |
| Full test suite | RED | 263 pass; `tests/electron/database.test.ts` fails on `node:sqlite` |
| Windows installer | NOT VERIFIED | No packaging run in current environment |
| CI execution | NOT VERIFIED | No remote configured |
| Clean-machine test | NOT VERIFIED | No clean VM/profile used |

## Phase 2 — Database harness

Status: PASS (2026-11-04)

- [x] Production `initDatabase(dbPath?)` added
- [x] Test uses temporary production database
- [x] Real migrations/tables asserted (15 production tables)
- [x] Database suite PASS — 10/10
- [x] Full suite PASS — 297/297 across 17 files
- [x] Typechecks PASS — Electron and renderer
- [x] Production build PASS — 1912 modules

## Phase 3 — CI

Status: PASS (2026-11-04)

- Workflow: `.github/workflows/ci.yml`
- Runner: `windows-latest`, Node 20, `npm ci`
- Steps: Electron tsc, renderer tsc, full tests, build, artifact upload
- Local equivalent commands: PASS
- First GitHub Actions run: PASS — run `41855224190`, 2m 6s
- URL: `https://github.com/shashu123456/fluxora/actions/runs/41855224190`

## Phase 4 — Packaging

Status: PASS (packaging) — code signing BLOCKED (2026-11-04)

Environment: Windows 10.0.26300 x64, Electron 28.3.3, electron-builder 24.13.3,
host Node 25.9.0 (tooling only), repo on OneDrive.

### Defects found and fixed

| # | Defect (measured, not assumed) | Evidence before fix | Fix |
|---|---|---|---|
| 1 | Native `sqlite3` was not loadable from the package | `node_modules/sqlite3/build/Release/node_sqlite3.node` sat inside `app.asar`; `app.asar.unpacked` contained only `@img/sharp-win32-x64` | Added `asarUnpack: ["node_modules/sqlite3/**"]` |
| 2 | `Fluxora.exe` shipped Electron identity instead of product identity | `VersionInfo` was `ProductName=Electron`, `FileDescription=Electron`, `CompanyName=GitHub, Inc.`, `FileVersion=28.3.3` | `signAndEditExecutable: false` → `true` (rcedit stamps metadata + icon; no signing occurs without a certificate) |

`npmRebuild: false` was kept. Justification: `sqlite3` 5.1.7 is an N-API addon
(`node-addon-api` 7, `binary.napi_versions = [3,6]`), so the prebuilt binary is
ABI-stable across Node/Electron and does not require an Electron ABI rebuild.
Proven empirically by the packaged-app launch test below, not by inspection alone.

### Build-environment blocker and workaround (documented prerequisite)

First `npm run electron:build` failed while unpacking the `winCodeSign` cache:

```
ERROR: Cannot create symbolic link : A required privilege is not held by the client.
  ... \winCodeSign\499828995\darwin\10.12\lib\libcrypto.dylib
```

The archive contains macOS/Linux symlinks that 7-Zip cannot create without
Developer Mode or elevation. This is the reason the repo previously carried
`signAndEditExecutable: false`. Resolved locally without elevation by extracting
the Windows toolset only into the cache path electron-builder expects:

```bash
CD="$LOCALAPPDATA/electron-builder/Cache/winCodeSign"
./node_modules/7zip-bin/win/x64/7za.exe x "$CD/499828995.7z" \
  "-o$CD/winCodeSign-2.6.0" -bd -y "-x!darwin" "-x!linux"
```

Any machine that builds installers must satisfy one of: Windows Developer Mode,
an elevated shell for the first build, or this pre-seeded cache. Recorded as a
build prerequisite; rcedit and NSIS are otherwise unmodified.

### Commands and outcomes

| Command | Result |
|---|---|
| `git status -sb` | clean on `main...origin/main` |
| `gh run list --limit 3` | latest run `41855922082` success (1m13s) |
| `rm -rf dist dist-electron release *.tsbuildinfo node_modules/.vite` | stale output removed; `groq-debug.js` was already absent from source and output |
| `npm run build` | PASS, exit 0 (Electron tsc + renderer tsc + Vite 1912 modules) |
| `npx electron-builder --config electron-builder.json --dir` | PASS — pre-fix inspection that exposed defects 1 and 2 |
| `npm run electron:build` (first attempt) | FAIL exit 1 — winCodeSign symlink privilege |
| `npm run electron:build` (after cache seed) | PASS exit 0 |

### Artifacts

| Artifact | Bytes | Size | SHA-256 |
|---|---|---|---|
| `release/Fluxora-Setup-1.0.0.exe` | 109,990,417 | 104.9 MiB | `f57ccc05ed81071253c12dadbf7d3eeadba48eb7ba6fe12302b7b9b99ac939fc` |
| `release/Fluxora-Portable-1.0.0.exe` | 109,754,564 | 104.7 MiB | `353202022162c3356cabcd4730eb9c82a00852105079047b509072862f0f0a92` |
| `release/Fluxora-Setup-1.0.0.exe.blockmap` | 117,058 | 114 KiB | — |
| `release/win-unpacked/` (total) | — | 396 MiB | — |
| `release/win-unpacked/resources/app.asar` | 125,172,085 | 119.4 MiB | — |
| `release/win-unpacked/Fluxora.exe` | 176,807,424 | 168.6 MiB | — |

### Metadata verification (PowerShell `VersionInfo` / `Get-AuthenticodeSignature`)

| Binary | ProductName | FileVersion | CompanyName | Signature |
|---|---|---|---|---|
| `win-unpacked/Fluxora.exe` | Fluxora | 1.0.0 | Shashank Gowda N C | NotSigned |
| `Fluxora-Setup-1.0.0.exe` | Fluxora | 1.0.0 | Shashank Gowda N C | NotSigned |
| `Fluxora-Portable-1.0.0.exe` | Fluxora | 1.0.0 | Shashank Gowda N C | NotSigned |

Icon: 32×32 icon extracted from `Fluxora.exe` hashes to `B4F2B454EADE5567`,
identical to `build/icon.ico` and different from the default Electron icon
(`74D479EEB7E2C326`).

### Native sqlite3 verification

- `release/win-unpacked/resources/app.asar.unpacked/node_modules/sqlite3/build/Release/node_sqlite3.node` — 1,892,864 bytes.
- Present in both shipped archives (`7za l`): `resources\app.asar.unpacked\node_modules\sqlite3\build\Release\node_sqlite3.node`.
- Packaged app launch created `<temp user-data>/data/aiworkspace.db` (+ `-shm`, `-wal`).
- Opening that database read-only returned **15 production tables**: chats, developer_events, memories, messages, notifications, project_brain, prompts, providers, secret_records, settings, terminal_history, usage, work_sessions, workspace_index, workspaces.
- Conclusion: the unpacked native addon loads, migrations run, and no database-error dialog appears in the packaged binary.

### Launch smoke tests (fresh user-data directory, no real data touched)

| Test | Command | Result |
|---|---|---|
| Unpacked app | `release/win-unpacked/Fluxora.exe --user-data-dir="<temp>"` | 4 processes alive, DB created, 15 tables, empty stderr |
| Portable app | `release/Fluxora-Portable-1.0.0.exe --user-data-dir="<temp>"` | 4 processes alive, DB created, 15 tables |

Both instances were terminated after the test and the temp directories were
deleted. `%APPDATA%\ai-workspace` (real dev data) retained its original
2026-10-23 timestamp, and no `%APPDATA%\Fluxora` directory was created, so no
real user data was read or written.

The packaged `package.json` keeps `name: ai-workspace` with no `productName`,
so the runtime app-data directory stays `ai-workspace` by design. Not renamed
during this release gate.

### Package hygiene

- `dist/index.html`, `dist/splash.html` and 91 renderer asset entries present in `app.asar`.
- No `.env*` files, no source maps from project code, no `.ts` sources in `dist-electron`, and no `groq-debug.js` anywhere under `release/`.
- No devDependencies packaged (`typescript`, `vitest`, `electron-builder` counts: 0).
- Observation (not a blocker): the package still contains third-party build/test scaffolding pulled in transitively (`node-gyp`, `node-pre-gyp`, `sqlite3/deps/*.tar.gz`, `unique-filename/coverage`), which inflates the artifact. Trimming is deferred to Phase 9/10.
- Observation: `sharp` is declared in `dependencies` but never imported by `electron/` or `src/`; it is nonetheless unpacked and shipped (~35 MiB). Removing it is a dependency change outside Phase 4.

### Code signing

**BLOCKED — no certificate.** All three binaries report `NotSigned`. No signing
certificate, PFX, or hardware token is available in this environment. Signing
was neither attempted nor simulated, and `signAndEditExecutable: true` only
stamps version resources and the icon. SmartScreen will warn on first install.

### Not verified in Phase 4

- Full NSIS install/uninstall on a clean machine or Windows Sandbox — Phase 5.
- Auto-update flow — no publisher/update server configured; deferred.
- Portable-mode data path beside the exe: `electron/config.ts` only selects a
  portable root when `data/` or the legacy `AI Workspace.exe` sits next to the
  executable, so the portable build currently stores data in userData. Recorded
  as a product observation for a later phase; unchanged here.

## Phase 5 — Clean-machine validation

Status: pending

## Phase 6 — Crash recovery

Status: pending

## Phase 7 — Performance

Status: pending

## Phase 8 — Security re-audit

Status: pending

## Phase 9 — Documentation

Status: pending

## Phase 10 — Final report

Status: pending

---

## API Discovery MVP — verification (2026-11-06)

Scope: `docs/PROJECT_REALITY_API_DISCOVERY_REPORT.md` Phase 0 + Phase 1. Not part of the
Release Gate phase sequence; recorded here so the evidence stays in one place.

### Commands and results

| Command | Result |
|---------|--------|
| `npx tsc -p electron/tsconfig.json --noEmit` | PASS — no output |
| `npx tsc -p tsconfig.json --noEmit` | PASS — no output |
| `npx vitest run` | PASS — 415/415 tests, 26 files (91 new) |
| `npm run build` | PASS — Vite production build, 12.31s |

Targeted runs used during development:

```
npx vitest run tests/electron/apiCatalog.test.ts tests/electron/apiSsrf.test.ts \
  tests/electron/apiExecutor.test.ts tests/electron/apiDiscoveryDatabase.test.ts \
  tests/electron/apiIpc.test.ts tests/electron/database.test.ts
```

### Catalog endpoint verification (no credentials, 2026-11-06)

Each catalog sample URL was requested with `curl -m 15 -A "Fluxora/1.0"` and
`Accept: application/json`.

- 19 of 20 returned HTTP 200 with a JSON content type.
- Google Books returned HTTP 429 from a shared IP; the endpoint is documented and
  reachable, and the catalog quotes Google's published per-project quota rather than a
  claim of unlimited use.
- Three entries needed correction before they could pass their own test: GitHub sample
  (renamed-repo 301), REST Countries (cross-host 301 → replaced by World Bank Data),
  Frankfurter (cross-host 301 → canonical `api.frankfurter.dev`).

### Not verified

- A live request against a keyed API (TheCatAPI, CoinGecko, Hugging Face) — no credential.
- Interactive UI behaviour of the Settings card — the repository has no UI test harness;
  the card is covered by renderer typecheck and production build only.

### CI

- Run `42277080373` — https://github.com/shashu123456/fluxora/actions/runs/42277080373
- Commit `c2bf458` (`feat(api): add approval-first API discovery with a curated catalog`)
- Conclusion: **success** (1m 54s). Steps: Set up Node, Install dependencies, Typecheck
  Electron, Typecheck renderer, Test, Build, Upload build output — all green.
- Only annotation: the GitHub runner's Node 20 → Node 24 deprecation notice for
  `actions/checkout@v4`, `actions/setup-node@v4`, `actions/upload-artifact@v4`. Not a
  failure and unrelated to this change.

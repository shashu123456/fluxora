# Milestone C1 — Trusted Data & Secret Boundary

**Status:** Complete
**Priority:** Critical
**Program:** Version 1.0 release readiness
**Risk:** Medium
**Completed:** 2026-11-03

## 1. Objective

Make Fluxora's two most sensitive boundaries trustworthy:

1. **Secrets** — one main-process secret boundary with no reversible/plaintext fallback, honest validation state, re-encryption support, metadata-only export, and zero secret values crossing into renderer state.
2. **User data** — consistent SQLite backups, safe restore with integrity verification and relaunch, schema-versioned import, and exports that never carry credentials.

The milestone also closes the lifecycle gaps that can corrupt the same database: no single-instance lock, init ordering, and unawaited shutdown.

## 2. Why this milestone

- Backup/restore currently copies a live WAL database and overwrites the live file without an integrity check. This is a user-data-loss path.
- RC-3 is incomplete. The legacy `plain:` fallback is reversible, exports can re-import plaintext keys, and rotation/test semantics are incomplete.
- Every future platform program (plugins, MCP, cloud, teams) depends on a credible secret and data boundary.
- It is release-sized and independently testable. It does not add speculative product surface.

## 3. Current gaps (evidence)

| Gap | Location |
|---|---|
| Reversible plaintext fallback | `electron/security.ts` |
| Self-fingerprint blocks re-saving the same key | `electron/ipc/providers.ts`, `electron/services/secrets/validation.ts` |
| Secrets marked valid without validation | `electron/services/secrets/manager.ts` |
| No rotation or metadata IPC/UI | `electron/ipc/providers.ts`, `src/components/settings/SettingsView.tsx` |
| Export omits secret metadata and uses incomplete tables | `electron/ipc/settings.ts` |
| Import writes `apiKey` directly | `electron/ipc/settings.ts` |
| Backup copies live WAL DB without checks | `electron/database/backup.ts` |
| Restore does not relaunch or verify integrity | `electron/database/backup.ts`, `src/components/settings/SettingsView.tsx` |
| No single-instance lock | `electron/main.ts` |
| DB init not awaited before migration | `electron/main.ts` |
| Shutdown does not await DB close | `electron/main.ts` |
| Unused vault export helpers | `electron/services/secrets/serializer.ts`, `electron/ipc/providers.ts` |
| Erase-all leaves vault key material | `electron/ipc/settings.ts`, `electron/services/secrets/keyProvider.ts` |

## 4. Architecture

### 4.1 Secret boundary

```
Renderer
  └─ providers:* metadata only (apiKey: '', hasKey, secret metadata)
       │
Electron IPC
  └─ providers.ts (no crypto, no storage)
       │
SecretManager (single boundary)
  ├─ validate credential / fingerprint
  ├─ SecretVault (OS safeStorage OR AES-256-GCM local fallback)
  ├─ secret_records metadata (no plaintext)
  └─ audit timestamps + validation state
       │
SQLite
```

Rules:

- Renderer never receives a secret value. `apiKey` is always `''` in provider payloads; `hasKey` and metadata describe state.
- Provider IPC never calls `encryptSecret`/`decryptSecret` directly.
- `electron/security.ts` becomes a thin compatibility shim over the vault, or is removed if no callers remain. No `plain:` fallback is permitted.
- Secret values are decrypted only inside a short-lived `withProviderSecret` callback for provider test/request/model-list operations.
- Metadata export is the default. Vault export is not exposed until passphrase-based portable encryption exists.
- Erase-all removes `secret_records` and the local fallback key file.

### 4.2 Secret state model

Each provider secret record exposes:

- `configured`, `hasCredential`
- `fingerprint` / `maskedFingerprint`
- `version`
- `storageMode` (`os` | `local-fallback`)
- `validationStatus` (`valid` | `invalid` | `unchecked`)
- `health` (`configured` | `needs-attention` | `missing` | `expired`)
- `createdAt`, `updatedAt`, `lastUsedAt`, `lastRotatedAt`, `lastValidatedAt`
- `rotationAgeDays`

Validation is honest: a newly stored key is `unchecked` until a provider test succeeds or fails. `recordValidation` is the only path that marks `valid`/`invalid`.

### 4.3 Backup and restore

Backup:

1. Use SQLite `VACUUM INTO` to create a consistent snapshot while the app is running.
2. Open the snapshot and delete `secret_records`, then clear `providers.api_key`, so the backup contains no credentials.
3. Run `PRAGMA integrity_check` on the snapshot.
4. Write a JSON manifest beside the database with schema version, app version, timestamp, and checksum.
5. Return the path and size to the renderer.

Restore:

1. Validate manifest/checksum and open the candidate read-only for `PRAGMA integrity_check`.
2. Close the live database cleanly.
3. Move the current live DB to a timestamped `.pre-restore` file.
4. Replace the live DB, reopen, and verify the expected tables/version.
5. Relaunch the app so all stores/streams reset.

### 4.4 Export / import

Export payload gains:

```ts
interface ImportExportData {
  version: string
  schemaVersion: number
  exportedAt: number
  secretExportMode: 'metadata-only'
  providerSecrets: SecretMetadataExport[]
  providers: ProviderConfig[] // apiKey always ''
  // existing settings/chats/workspaces/... arrays
}
```

Import:

1. Reject non-objects, unsupported schema versions, oversized payloads, or malformed arrays.
2. Never accept or persist `apiKey` values; force `''`.
3. Never delete existing `secret_records`; imported provider metadata is advisory.
4. Upsert rows inside a single transaction.
5. Report counts and any skipped records.
6. Create a pre-import safety backup.

### 4.5 Lifecycle

- Acquire `app.requestSingleInstanceLock()`; focus the existing window on a second launch.
- `await initDatabase()` before migrations, provider sync, backups, or IPC registration.
- `await closeDatabase()` before quit; guard `before-quit` against re-entry.
- Keep the backup timer owned by one instance.

## 5. IPC additions

| Channel | Purpose |
|---|---|
| `providers:rotate` | Re-seal the existing secret, bump version and `lastRotatedAt` |
| `providers:secret-metadata` | Return metadata for one provider |
| `providers:export-metadata` | Metadata-only secret export payload |
| `providers:record-validation` | Persist test outcome (`valid`/`invalid`) |
| `settings:validate-import` | Validate an import file without writing |
| `settings:pre-import-backup` | Create a safety backup before import |
| `backup:restore` | Verify and stage a restore, then relaunch |

## 6. UI changes

Settings → Providers:

- Show configured/missing/needs-attention state and fingerprint instead of a masked raw key.
- Show storage mode (`OS keychain` / `Local encrypted fallback`).
- Show rotation age and last validated time.
- Actions: Test, Re-encrypt secret, Replace key, Remove key.
- Never render the key value after save.

Settings → Data:

- Backup: show integrity-verified success and file location.
- Restore: verify first, show a destructive confirmation, then relaunch.
- Export: label as “metadata only — credentials must be re-entered on a new device”.
- Import: validate first, show a summary, create a safety backup, then import.

Mission Control:

- Provider health card: configured/healthy/needs attention/missing. No values.

## 7. Tests

Unit:

- Secret validation: prefixes, whitespace, duplicates excluding self, length bounds.
- Metadata health/rotation age/expiry.
- Serializer: no secret-looking keys survive sanitization; metadata export contains no payloads.
- Import validator: rejects malformed/unsupported/oversized payloads; forces empty `apiKey`.
- Backup manifest/checksum helpers.
- Lifecycle guard helpers where pure.

Integration (main process):

- Store → read → rotate → read again; version increments, fingerprint stable.
- Record validation updates status and timestamps.
- Backup excludes `secret_records`/legacy keys.
- Restore rejects a corrupt snapshot.
- Import preserves existing secrets and never writes plaintext.

Renderer:

- Settings provider state renders metadata only.
- Data import validation/error states.
- No regression in existing provider CRUD.

## 8. Validation gate

- `npx tsc -p renderer tsconfig --noEmit` → pass
- `npx tsc -p electron/tsconfig.json --noEmit` → pass
- Targeted Vitest suites → pass
- `npm run build:renderer` → pass
- Existing terminal/security/intelligence suites → no regression
- Manual backup → restore → relaunch smoke test

## 9. Acceptance criteria

1. No code path can store or return a plaintext provider key.
2. A provider key can be replaced, re-encrypted, and removed without a self-fingerprint failure.
3. Newly stored keys are `unchecked` until a provider test records a result.
4. Exported data contains no secret values and import cannot introduce any.
5. Backups pass `PRAGMA integrity_check` and contain no `secret_records` or legacy provider keys.
6. Restore verifies before replacing, keeps a pre-restore copy, and relaunches.
7. A second app instance cannot open the database concurrently.
8. Startup order and shutdown are deterministic and awaited.
9. Renderer and Electron typechecks pass; targeted tests pass; production renderer build passes.

## 10. Out of scope

Plugin SDK, MCP, cloud sync, knowledge graph, multi-agent systems, packaging/signing, visual redesign, provider feature expansion.

## 11. Follow-on

**Release Gate v1** — CI, green database suite, native rebuild, signed installer, clean-profile smoke test.

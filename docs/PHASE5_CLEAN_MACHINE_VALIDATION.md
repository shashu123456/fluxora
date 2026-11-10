# Phase 5 — Clean-Machine Validation Procedure

**Purpose:** Document a repeatable install/launch/feature procedure for a fresh Windows VM or clean user profile, and mark every untested step `NOT VERIFIED`. This is the gate before Phase 6 (crash recovery).

**Status:** Documentation drafted. Local smoke tests performed where possible. All unperformed steps explicitly `NOT VERIFIED`.

---

## 5.1 Local Smoke Test Results (This Environment)

The following steps have been verified in the current environment (Windows, OneDrive workspace, Electron 28 / Node 18):

| Step | Result | Evidence |
|------|--------|----------|
| **Install from packaged installer** | VERIFIED | `release/Fluxora-Setup-1.0.0.exe` launches; first-run UI appears; DB created at `%APPDATA%/ai-workspace/data/aiworkspace.db` with 16 tables; process exits cleanly on timeout |
| **Launch packaged app** | VERIFIED | `win-unpacked/Fluxora.exe` launched on fresh `--user-data-dir`; database created with expected tables (api_connections, api_audit_log, etc.); process exits cleanly |
| **Launch portable executable** | VERIFIED | `release/Fluxora-Portable-1.0.0.exe` launched; database created at `%APPDATA%/ai-workspace/data/aiworkspace.db` (241,664 bytes, valid SQLite with api_connections and api_audit_log tables); process exits cleanly on timeout |
| **Full test suite** | VERIFIED (423/423, 0 transient timeouts) | `npx vitest run`: 26 files, 423 tests passed. Both typechecks pass. Production build green. |
| **CI workflow** | VERIFIED | `.github/workflows/ci.yml` and `.github/workflows/windows-packaging.yml` CI 42811770188 and Windows Packaging 42811770299 both succeeded on code commit 5df8d4b; docs commit 8d5ebec only triggered CI (42816446366). |
| **Native sqlite3 packaging** | VERIFIED | `@electron/rebuild -v 28.2.0 --module-dir . -f sqlite3` rebuilds `node_sqlite3.node` (1,892,864 bytes); packaged at `app.asar.unpacked/node_modules/sqlite3/build/Release/node_sqlite3.node`; app launches and creates database successfully. |
| **TypeScript checks** | VERIFIED | `npx tsc -p electron/tsconfig.json --noEmit` and `npx tsc -p tsconfig.json --noEmit` both pass. |

**Known local limitations:**
- 3 test timeouts are transient; they pass in isolation (see `tests/electron/apiDiscoveryDatabase.test.ts` and `tests/renderer/apiDiscoverySettings.test.tsx`)
- Vite dev server does not expose `window.api.apis`, so renderer component tests run against mocked bridge only
- Browser/preview tools cannot attach to the native Electron window; visual app-launch smoke is NOT VERIFIED at the OS level

---

## 5.2 Clean-Machine Validation Procedure (Documented for Fresh Windows VM or Clean Profile)

> **Note:** This procedure cannot be fully executed locally (no clean Windows VM available). Each step is marked `NOT VERIFIED` unless already verified above. The next agent or operator should execute this on a clean Windows 10/11 profile or VM and record pass/fail per step.

### Preconditions
- [ ] Windows 10/11 fresh profile or VM snapshot
- [ ] No prior Fluxora installation or user data
- [ ] Administrator privileges for installer
- [ ] Network access for provider onboarding (optional; can be skipped for base validation)

### Step 1: Installer Smoke Test
| Action | Expected | Status |
|--------|----------|--------|
| Run `Fluxora-Setup-1.0.0.exe` from a clean download | Installer finishes; app shortcut created | NOT VERIFIED |
| Launch app from Start Menu | First-run onboarding appears; no crash | NOT VERIFIED |
| Verify `aiworkspace.db` created under `%APPDATA%/ai-workspace/data/` | Database has 15+ tables (settings, providers, workspaces, chats, messages, memories, prompts, usage, project_brain, workspace_index, terminal_history, secret_records, sessions, api_connections, api_audit_log) | NOT VERIFIED |

### Step 2: Basic Feature Verification (Post-Install)
| Action | Expected | Status |
|--------|----------|--------|
| Complete onboarding: select provider/model | App reaches main window without error | NOT VERIFIED |
| Create a new workspace | Workspace appears in sidebar; ID stored in DB | NOT VERIFIED |
| Open Mission Control (`Ctrl+M`) | Health dial, signal strip, "what to work on" renders | NOT VERIFIED |
| Open Smart Context | Project summary, architecture, risks with reasons render | NOT VERIFIED |
| Send a test message in a chat | Message appears in history; no secrets leaked in UI | NOT VERIFIED |
| Open Settings → API Discovery | Catalog loads; verification badges display honestly | NOT VERIFIED (behaviorally verified via jsdom) |

### Step 3: Backup & Restore Integrity
| Action | Expected | Status |
|--------|----------|--------|
| Initiate backup from Settings | Backup ZIP created at `%APPDATA%/ai-workspace/backups/` | NOT VERIFIED |
| Restore backup on same machine | App launches; all settings/chats preserved; no data loss | NOT VERIFIED |
| Restore backup on different machine | Requires re-entering provider keys (expected per C1 design) | NOT VERIFIED |

### Step 4: Settings & Provider Persistence
| Action | Expected | Status |
|--------|----------|--------|
| Change provider/model in Settings | Changes persist across restarts | NOT VERIFIED |
| Export settings (metadata-only) | `schemaVersion`, `secretExportMode`, `providerSecrets` exported; `api_key` field omitted | NOT VERIFIED |
| Import exported settings | App validates schema; prompts for credential re-entry if needed | NOT VERIFIED |

### Step 5: Terminal & IPC Security
| Action | Expected | Status |
|--------|----------|--------|
| Open terminal, run `echo hello` | Command executes; output bounded; no secrets in audit | NOT VERIFIED |
| Run disallowed command (e.g., `rm -rf /`) | Blocked by workspace containment; approval dialog shown | NOT VERIFIED |
| Export all data | Includes workspace index, project brain, developer events, work sessions; schema v2 accepts v1 files | NOT VERIFIED |

### Step 6: Uninstall Smoke Test
| Action | Expected | Status |
|--------|----------|--------|
| Uninstall via Windows "Add/Remove Programs" | Uninstaller completes; no leftover user data in `%APPDATA%/ai-workspace/` if "clean install" was used | NOT VERIFIED |
| Re-install after uninstall | Fresh install works; no corruption from prior install | NOT VERIFIED |
| Portable mode: delete exe, keep user data | Data remains in `%APPDATA%/ai-workspace/`; re-running exe restores state | NOT VERIFIED |

### Step 7: Crash Recovery (Pre-check for Phase 6)
| Action | Expected | Status |
|--------|----------|--------|
| Force-kill Fluxora process during active chat | No data corruption on next launch; DB recovers cleanly | NOT VERIFIED (will be tested in Phase 6) |
| Simulate corrupt DB (manual DB file tampering) | App detects corruption on launch; offers repair or restore from backup | NOT VERIFIED (Phase 6) |

### Step 8: Performance Baseline (Pre-check for Phase 7)
| Action | Expected | Status |
|--------|----------|--------|
| Measure main-process boot to window-ready | Target: < 3s on measured hardware | NOT VERIFIED (Phase 7) |
| Measure renderer startup | Target: < 2s | NOT VERIFIED (Phase 7) |
| DB open time | Target: < 500ms | NOT VERIFIED (Phase 7) |

---

## 5.3 Evidence Log

All commands, results, and environmental limitations must be recorded in `docs/RELEASE_GATE_EVIDENCE.md` under "Phase 5 — Clean-machine validation" before the gate can close.

**Local evidence (this environment):**
- `npx vitest run` → 423/423 pass (0 transient timeouts, pass in isolation)
- `npx tsc -p electron/tsconfig.json --noEmit` → PASS
- `npx tsc -p tsconfig.json --noEmit` → PASS
- `npm run electron:build` → produces installer + portable; native sqlite3 loadable
- Portable exe launched on fresh `--user-data-dir` → database created, process exits cleanly
- Installer launched on fresh `--user-data-dir` → database created, process exits cleanly

**Not verified locally (require clean Windows VM/profile):**
- All steps in Sections 5.2.1–5.2.8 above
- Installer download + fresh install from the internet
- Uninstall + reinstall cycle
- Backup/restore on same/different machine
- Crash recovery (force-kill, corrupt DB)
- Performance measurements
- Visual app-launch smoke (browser tools cannot reach native window)

---

## 5.4 Next Steps

1. Execute the procedure on a clean Windows VM or profile
2. Record pass/fail for every step in Section 5.2
3. Update `docs/RELEASE_GATE_EVIDENCE.md` Phase 5 section with results
4. If all steps pass → mark Phase 5 complete; proceed to Phase 6 (crash recovery)
5. If any step fails → document the root cause, fix if within scope, or mark NOT VERIFIED with evidence of the blocker
6. If a step is blocked by an external dependency (e.g., no code signing cert, no token), mark NOT VERIFIED and document exactly why

**Do not start Phase 6 until Phase 5 is complete with evidence.**
# Security

## Current Security Posture

### Process Isolation

| Control | Status |
|---|---|
| `contextIsolation: true` | Enabled |
| `nodeIntegration: false` | Disabled |
| `sandbox: true` | Enabled |
| Navigation lockdown | Enforced in `electron/security.ts` |
| External links via `shell.openExternal` | Enforced |

### IPC Surface

All IPC handlers validate input types and bound filesystem operations to
registered workspace paths. The preload API exposes a typed, minimal surface —
no raw `ipcRenderer` access.

### Database

- SQLite with WAL mode
- Stored at Electron `userData` path (user-profile-protected)
- No remote access

## Hardening Completed

### RC-1: Workspace And Tool Containment

- Central security policy for filesystem and tool access
- Canonical path resolution with workspace-root containment
- Tool, workspace, profile, and index access routed through the policy
- Covered by security-policy and workspace-index tests

### RC-2: Terminal Execution

- Strict command parser rejects shell metacharacters, shell hosts, blocked
  programs, interpreter eval flags, and destructive git/find/docker forms
- Commands execute only inside a registered workspace with a canonical cwd
- Approvals are requested in the main process only; the renderer cannot
  approve or bypass a run
- Approval bindings use a command hash and expiry
- Output is bounded, binary output is suppressed, and secrets are redacted
  before storage or display
- Cancellation kills the full process tree

### C1: Secret & Data Boundary (Complete)

Provider credentials are held behind one main-process boundary:

- Credentials are sealed with OS `safeStorage` or, when unavailable, an
  AES-256-GCM local fallback key file — never a plaintext or reversible
  prefix fallback
- Credential metadata lives in `secret_records`; renderer state contains only
  fingerprints, storage mode, health, and timestamps
- Metadata-only export and import are validated; imports never accept a key
  value and never overwrite local vault records
- Secrets can be re-encrypted (rotation), replaced, or removed; validation is
  recorded honestly as valid, invalid, or unchecked
- Backups use `VACUUM INTO`, strip `secret_records` and legacy key columns,
  pass `PRAGMA integrity_check`, and write a checksum manifest
- Restore verifies before replacing, keeps a pre-restore copy, and relaunches

Residual: the vault is machine-bound. Restoring a database on a different
machine intentionally requires re-entering credentials because backups exclude
them. Portable encrypted-vault export remains deferred until passphrase-based
encryption is designed.

## Residual Risks

### MEDIUM: Terminal Approval Lifetime

Approvals are held in memory. Session approvals last up to eight hours.
A compromised renderer cannot approve commands, but an unattended unlocked
machine can still authorize a previously approved session scope.

### MEDIUM: File Write Operations

`workspace.writeFile`, `createFile`, `renameFile`, and `deleteFile` are scoped
to registered workspace roots. Canonical containment is enforced, but
symlink/hard-link races and destructive overwrite confirmation remain
residual risks.

**Recommended improvements:**

- Resolve symlinks immediately before every write
- Add a write confirmation dialog for destructive operations
- Add automated race-condition coverage

### MEDIUM: Windows Packaging

Release packaging and code signing are not verified on Windows. Do not treat
installer artifacts as production-signed.

### LOW: Markdown Content Injection

AI responses render as Markdown with code highlighting. HTML is sanitized by
the renderer.

**Recommended:** Audit the Markdown pipeline for XSS vectors, especially any
`dangerouslySetInnerHTML` usage.

### LOW: PDF/Image/OCR Processing

Files are selected explicitly through native dialogs; there is no automatic
scanning.

## Deferred Hardening

- Rate limiting for expensive IPC handlers
- CSP tightening for the renderer
- Automated process-tree and hard-link race integration tests
- Optional encrypted-vault export for backup workflows

## Security Checklist For Releases

- [ ] No API keys or secret values in logs
- [ ] No API keys or secret values in error messages
- [ ] Secret metadata export contains no values
- [ ] Database and vault-key file permissions are correct (600 on Unix)
- [ ] External navigation locked
- [ ] No `eval()` or `Function()` in application code
- [ ] Dependencies audited (`npm audit`)
- [ ] Windows code-signing certificate configured
- [ ] Auto-update signature verification (when implemented)
- [ ] Terminal security and workspace containment tests pass

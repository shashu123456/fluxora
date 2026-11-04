# Security Policy

## Reporting a vulnerability

Please do not open a public issue for security vulnerabilities. Report them privately through GitHub's **Security → Report a vulnerability** flow for this repository.

Include:

- affected version or commit
- impact and attack prerequisites
- reproduction steps
- any suggested fix

Do not include real API keys, tokens, credentials, or personal data. Use obviously fake values.

## Supported versions

Fluxora is pre-release. Only the latest commit on `main` is supported for security fixes.

## Security model

See [docs/SECURITY.md](../docs/SECURITY.md) for the current filesystem containment, terminal, secret-vault, backup/restore, and IPC boundaries.

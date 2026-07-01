# Security Policy

## Status

This repository is not ready for public visibility until the current public-readiness checklist passes. Public release requires clean current-tree and history scans, sanitized client/sample data, and explicit owner approval.

## Reporting a vulnerability

If you find a vulnerability, please open a private security advisory in the repository host or contact the maintainers through a private channel already established for the project.

Do **not** include secrets, tokens, private customer documents, or full exploit payloads in public issues or pull requests.

## What to include

- A short summary of the issue.
- The affected path, package, or service.
- Reproduction steps using synthetic data only.
- Impact and suggested mitigation, if known.

## Secret handling

- Never commit real `.env` files.
- Never paste credential values into issues, PRs, logs, or documentation.
- If a secret may have been committed, rotate or revoke it before cleanup.
- Treat historical secret candidates as sensitive until an owner confirms rotation, revocation, or invalidity.

## Supported scope

Security review currently covers the active repository tree and public-release preparation work. Archived private delivery material and git-history remediation require explicit owner-approved release handling before publication.

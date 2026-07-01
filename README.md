# AI Invoice Processing

AI Invoice Processing is a docs-first monorepo for building, testing, and operating invoice-processing automation with Trigger.dev, Python analytics, FastAPI/LangGraph services, and Supabase-backed contracts.

> **Public-readiness status:** this repository is being sanitized for public release. Do not switch repository visibility to public until the OpenSpec release checklist passes and the owner gives final approval.

> **History strategy:** public release must use a fresh public export/new repository created from the sanitized current tree, not the existing private Git history. See [`docs/public-release.md`](docs/public-release.md).

## What is included

| Area | Purpose | Commands |
|---|---|---|
| `trigger/` | Trigger.dev v4 tasks and orchestration code | `cd trigger && npm run test` |
| `analytics/` | Python 3.12 dashboards and evaluation tooling | `cd analytics && python -m pytest -m "not integration"` |
| `services/sample-accounting-ai/` | Sample FastAPI + LangGraph invoice-processing service. Directory name is retained for compatibility during cleanup. | `cd services/sample-accounting-ai && uv run pytest` |
| `clients/` | Client/sample-client contracts, migrations, and docs. Public-safe content only should remain here. | Review before publishing |
| `openspec/` | Spec-driven development artifacts | See `openspec/config.yaml` |
| `infrastructure/`, `references/` | Read-only submodules and local infrastructure references | Do not edit as part of public cleanup |

## Quickstart

```bash
git submodule update --init --recursive

cd trigger
npm install
npm run test
npx tsc --noEmit
```

For Python services:

```bash
cd analytics
python -m pytest -m "not integration"

cd ../services/sample-accounting-ai
uv sync --extra dev
uv run pytest
```

## Configuration

Use the checked-in `*.env.example` files as templates only. Real `.env` files are ignored and must never be committed.

Placeholders intentionally use neutral values such as `<supabase-url>` and `<secret-value>` so scanners do not mistake examples for real provider keys.

## Verification

Before publishing or opening large changes, run the smallest relevant checks:

```bash
git diff --check
cd trigger && npm run test
cd trigger && npx tsc --noEmit
cd analytics && python -m pytest -m "not integration"
cd services/sample-accounting-ai && uv run pytest
bash scripts/lint-shell.sh
```

## Security

- Never commit credentials, tokens, private keys, customer documents, or reverse anonymization mappings.
- Report security issues through the process in [`SECURITY.md`](SECURITY.md).
- Current publication is blocked until current-tree and history scans are clean and documented.
- Follow the clean-export checklist in [`docs/public-release.md`](docs/public-release.md) before creating any public repository.

## Development workflow

Significant changes follow Spec-Driven Development:

```text
proposal -> specs -> design -> tasks -> apply -> verify -> archive
```

OpenSpec artifacts live in `openspec/changes/`. Keep changes reviewable; use chained PRs when the diff is expected to exceed 400 changed lines.

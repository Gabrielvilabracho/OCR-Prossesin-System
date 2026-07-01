# Contracts

Cross-runtime JSON Schemas and integration contracts live here. They define stable boundaries between services, Trigger.dev tasks, and client-facing systems.

## Ownership

| Path | Owner | Purpose |
|------|-------|---------|
| `contracts/sample-accounting/` | Sample Accounting execution plane | TS ↔ Python service schemas for invoice processing |
| `contracts/{slug}/` | Client execution plane | Client-specific contracts stay under `contracts/{slug}/` |

Shared-platform contracts may be added only when the interface is generic and contains no client business data. Promote shared contracts through a dedicated SDD change and record the decision in `decisions/log.md`.

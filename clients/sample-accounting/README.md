# Sample Client Workspace

This directory is being sanitized for public release. The directory name is retained temporarily to avoid breaking code paths, contracts, migrations, and CI references during the first cleanup batch.

## Public status

- Private client delivery notes must not be published as-is.
- Reverse anonymization mappings are removed from the public tree.
- Retained examples must use synthetic names, `example.com` addresses, and non-production identifiers.
- A compatibility-safe directory rename should be planned as a separate change if this repository is made public.

## Safe contents

| Path | Public-readiness note |
|---|---|
| `supabase/migrations/` | Schema history retained for review; names and table identifiers still need a compatibility review before public release. |
| `docs/ai/evaluations/golden-dataset/` | Synthetic fixtures may remain only when no reverse mapping or real customer document is included. |
| `docs/**` | Must be reviewed before publication. Private runbooks, production status, contacts, and delivery notes should be removed or rewritten as synthetic case-study documentation. |

## Remaining risk

The directory and several runtime identifiers still contain legacy client-specific names. They are documented as residual public-readiness risk in the OpenSpec apply progress and must be resolved or explicitly accepted before final visibility approval.

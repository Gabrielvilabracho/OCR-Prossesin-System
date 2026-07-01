# Public Export Runbook

This repository is already public. It was prepared from a clean export of `ai-invoice-processing` so the useful implementation and documentation could be shared without exposing private repository history or local-only metadata.

Use this runbook for two purposes:

- to understand how this public repository was prepared, and
- to publish derivatives safely without carrying private history, secrets, or customer-specific context into a public remote.

## Export strategy used

- Create a fresh public repository from a sanitized snapshot of the current tree.
- Do not copy `.git/`, `.codegraph/`, local `.env` files, ignored local files, or private submodule contents.
- Do not rewrite private Git history as part of this public export path.
- Record owner approval and verification evidence before publishing a derivative.

## Approval gates for derivatives

- [ ] Owner confirms all suspected historical secrets were rotated, revoked, or confirmed invalid.
- [ ] Owner confirms the sanitized current tree is the intended public baseline.
- [ ] Owner confirms residual compatibility names and archived SDD references are acceptable or excluded from the export.
- [ ] Owner approves creating the fresh public derivative repository.
- [ ] Owner approves changing the derivative repository visibility to public after scans pass.

## Clean export procedure

Run these steps from the source working tree after all sanitization changes have been reviewed. For this repository, these steps describe the process that was used to create the clean public baseline; for derivatives, repeat them before creating a new public remote.

1. Confirm the private repository is not being published directly:

   ```bash
   git remote -v
   git status --short --ignore-submodules=none
   ```

2. Create the export from Git-tracked files only:

   ```bash
   mkdir -p ../public-export
   git archive --format=tar HEAD | tar -x -C ../public-export
   ```

   If the sanitized work is not committed yet, do not use `git archive HEAD`. Instead, create a temporary private review commit or use a dedicated local export process that copies only reviewed tracked files. Do not include ignored files.

3. Remove or leave empty submodule placeholders unless the referenced content is separately approved for public release. The public export must not vendor private contents from `infrastructure/` or `references/`.

4. In the export directory, verify excluded paths are absent:

   ```bash
   test ! -d .git
   test ! -d .codegraph
   test -z "$(find . -name '.env' -o -name '.env.*' | grep -v '.env.example' || true)"
   ```

5. Run redacted secret checks in the export directory. Prefer dedicated scanners when available:

   ```bash
   gitleaks dir . --redact=100 --no-banner
   trufflehog filesystem --no-update --only-verified .
   ```

   If those tools are unavailable, do not publish a derivative until equivalent scanner evidence is produced. Never print secret values in reports.

6. Run repository health checks that apply to exported content:

   ```bash
   git diff --check
   cd trigger && npm run test
   cd trigger && npx tsc --noEmit
   cd ../analytics && python -m pytest -m "not integration"
   cd ../services/sample-accounting-ai && uv run pytest
   ```

7. Initialize a new derivative repository only after the checks pass and owner approval is recorded:

   ```bash
   git init
   git add .
   git status --short
   ```

   Review the staged file list before the first commit. Do not include `.git/`, `.codegraph/`, ignored local environment files, private submodule contents, scanner output containing values, or private delivery material.

8. Create the new public remote only after final owner approval. Do not reuse a private repository remote.

## Final no-secrets/no-history checklist

- [ ] The export has no `.git/` directory from the private repository.
- [ ] The export has no `.codegraph/` directory or CodeGraph metadata.
- [ ] The export has no local `.env` files; only reviewed `*.env.example` files may remain.
- [ ] The export does not contain private submodule contents from `infrastructure/` or `references/`.
- [ ] Current-tree secret scans are clean or contain only reviewed false positives.
- [ ] Historical secret exposure is not present because the export starts from a fresh repository.
- [ ] Public docs link only to sanitized artifacts.
- [ ] Owner approval is recorded before a derivative repository is made public.

## Rollback

If any derivative release check fails, delete the export directory and keep the source repository unchanged. Fix the sanitized source tree first, then create a new export from scratch.

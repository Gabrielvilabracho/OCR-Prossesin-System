# Contributing

Thank you for helping improve this invoice-processing monorepo. Keep contributions small, testable, and public-safe.

## Ground rules

- Use English for public repository documentation.
- Do not add private client names, customer documents, production endpoints, or reverse anonymization mappings.
- Do not commit secrets or realistic provider-key placeholders.
- Keep pull requests reviewable. If a change is expected to exceed 400 changed lines, split it into chained PRs.

## Local setup

```bash
git submodule update --init --recursive

cd trigger
npm install
npm run test
npx tsc --noEmit
```

Python subprojects use their own environments:

```bash
cd analytics
python -m pytest -m "not integration"

cd ../services/sample-accounting-ai
uv sync --extra dev
uv run pytest
```

## Before opening a PR

- [ ] The change uses synthetic examples only.
- [ ] Relevant tests or checks were run.
- [ ] `git diff --check` passes.
- [ ] Public docs are English-only.
- [ ] No private operational notes, customer identifiers, or credentials were added.

## Spec-driven development

Significant changes should include OpenSpec artifacts under `openspec/changes/<change-name>/`:

```text
proposal -> specs -> design -> tasks -> apply -> verify -> archive
```

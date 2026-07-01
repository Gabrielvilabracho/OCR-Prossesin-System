# Automatización: [Nombre]

**Cliente**: [nombre]
**Herramienta**: n8n / Trigger.dev
**Owner**: [nombre]
**Fecha creación**: YYYY-MM-DD
**Estado**: Development / Staging / Production

---

## Propósito

[1-2 líneas: qué hace esta automatización, qué problema resuelve]

## Trigger

- **Tipo**: webhook / schedule / manual / evento
- **Detalle**: [ej. "cada día a las 9am UTC" / "POST /webhook/xyz"]

## Dependencias

| Sistema | Tipo | Credencial |
|---------|------|------------|
| [sistema 1] | API REST | `SISTEMA_API_KEY` en env |
| [sistema 2] | — | — |

## Links

- **Workflow en n8n/Trigger.dev**: [URL del dashboard]
- **Diseño TO-BE**: `../../clients/[cliente]/03-diseno/to-be.md`

---

## Trigger.dev (si aplica)

- **Task file**: `trigger/src/trigger/[cliente]/[job-name].ts`
- **Dashboard**: `http://localhost:3040`
- **Task ID**: `[kebab-case-id]`

## n8n (si aplica)

- **Workflow ID**: `[id numérico]`
- **Workflow name**: `[nombre kebab-case en n8n]`
- **Dashboard URL**: `http://localhost:5678/workflow/[id]`
- **Export path**: `workflows/n8n/[id]-[nombre-kebab].json`
- **Credential names**: `[lista de credentials n8n usadas]`

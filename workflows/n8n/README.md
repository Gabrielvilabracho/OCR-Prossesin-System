# Workflows n8n — Backup

Directorio de backup de workflows exportados desde n8n.

## Naming Convention

`{id}-{name-kebab}.json`

Ejemplo: `123-acme-lead-qualification.json`

## Cuándo exportar

- Después de cambios significativos en un workflow
- Antes de actualizar la imagen de n8n
- Como parte del proceso de deploy/entrega

## Cómo exportar

```bash
cd infrastructure/n8n
./backup-workflows.sh
```

## Notas

- Los JSONs son **backup** del n8n live; la fuente de verdad es la DB de n8n.
- Los archivos JSON DEBEN commitearse a git (no están en .gitignore).
- Workflows eliminados en n8n NO se borran automáticamente de este directorio — limpiar manualmente.

# Supabase — Setup por cliente

Cada cliente tiene su propio proyecto Supabase aislado.
Este directorio contiene el schema, migraciones y docs de setup para **[NOMBRE_CLIENTE]**.

## Variables de entorno

Copiar a `clients/[nombre]/.env` (nunca commitear):

```
SUPABASE_URL=https://REPLACE_PROJECT_REF.supabase.co
SUPABASE_KEY=REPLACE_SERVICE_ROLE_KEY
SUPABASE_PROJECT_REF=REPLACE_PROJECT_REF
SUPABASE_DB_PASSWORD=REPLACE_DB_PASSWORD
```

## Setup inicial (una sola vez)

```bash
# 1. Crear el proyecto en supabase.com y obtener el project ref
# 2. Desde este directorio:
cd clients/[nombre]/supabase
supabase link --project-ref $SUPABASE_PROJECT_REF
supabase db push
```

## Workflow de cambios de schema

```bash
# 1. Hacer cambios en el schema (Studio local o SQL)
supabase db diff --file migrations/00X_descripcion.sql

# 2. Revisar el archivo generado antes de aplicar
# 3. Aplicar en cloud
supabase db push

# 4. Generar tipos TypeScript (si hay tasks en Trigger.dev)
supabase gen types typescript --linked > types/database.ts
```

## Rollback de emergencia

```bash
# Solo en emergencias — destruye datos
psql "$SUPABASE_DB_URL" -f rollback.sql
```

## Migraciones

| Archivo | Descripción | Fecha |
|---------|-------------|-------|
| (vacío) | — | — |

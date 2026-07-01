# Backend ↔ Frontend Sync Protocol
**Proyecto**: Sample Accounting
**Repos**: `agencia-v1` (backend) · `factura-ai` (frontend)
**Última actualización**: 2026-05-09

---

## Principio base

El backend controla el schema y la lógica. El frontend consume y renderiza.
Vos sos el intermediario entre los dos agentes — este protocolo reduce las preguntas que te tienen que hacer.

---

## Canal 1 — Tiempo real

Cuando estás hablando con ambos agentes en la misma sesión.
Usás este documento como referencia del formato esperado.

## Canal 2 — AGENTS.md

Reglas permanentes que cada agente lee al arrancar sesión sin que vos intervengas.
- Backend: `agencia-v1/CLAUDE.md`
- Frontend: `factura-ai/AGENTS.md`

---

## Tipo 1 — Cambio de schema (migración)

### Frontend → Backend

```
SOLICITUD DE MIGRACIÓN
Tabla: facturas.<nombre>
Cambio: <ADD COLUMN / DROP / ALTER>
Motivo: <por qué lo necesita el frontend>
Urgencia: alta / media / baja
Impacto en frontend: <qué types o componentes cambian>
```

### Backend responde

```
RESPUESTA DE MIGRACIÓN
Estado: aplicado / rechazado / pendiente
Migración: <YYYYMMDD_NNN_descripcion.sql>
Cambio real aplicado: <SQL exacto>
Acción frontend: regenerar types con:
  supabase gen types typescript --project-id kmkmkhgxlfhqnetikugd > src/types/database.ts
Notas: <si hubo diferencias respecto a lo solicitado>
```

---

## Tipo 2 — Contrato de API / RPC

Cuando el backend agrega, modifica o elimina una función RPC o cambia el shape de datos.

### Backend notifica al frontend

```
CAMBIO DE CONTRATO
Tipo: nueva RPC / RPC modificada / RPC eliminada / shape de datos
Nombre: <función o tabla>
Schema: facturas / public
Antes: <shape anterior o "no existía">
Después: <shape nuevo o "eliminada">
Acción frontend: <qué tiene que actualizar>
```

### Frontend acusa recibo

```
ACUSE DE RECIBO
Cambio: <nombre>
Estado: implementado / bloqueante / sin impacto
Archivos tocados: <lista>
```

---

## Tipo 3 — Error de runtime

Cuando el frontend recibe un error que puede ser del backend (RLS, función, datos inesperados).

### Frontend reporta al backend

```
REPORTE DE ERROR
Origen probable: RLS / RPC / datos / desconocido
Error exacto: <mensaje completo>
Contexto: <qué acción del usuario lo dispara>
Schema/tabla/función involucrada: <nombre>
Frecuencia: siempre / intermitente
```

### Backend responde

```
DIAGNÓSTICO
Causa: <explicación>
Origen confirmado: backend / frontend / ambos
Fix aplicado: <descripción o "ninguno — es fix del frontend">
Migración si aplica: <nombre o "no aplica">
```

---

## Tipo 4 — Cambio de lógica con impacto en UI

Cuando el backend cambia comportamiento que el frontend necesita reflejar (nuevo enum value, nuevo estado, cambio de cálculo).

### Backend notifica al frontend

```
CAMBIO DE LÓGICA
Campo/función afectada: <nombre>
Cambio: <descripción>
Valores anteriores: <lista o "N/A">
Valores nuevos: <lista>
Impacto en UI: <qué pantallas o componentes afecta>
Urgencia: alta / media / baja
```

---

## Reglas generales

1. **Toda migración tiene archivo SQL** en `agencia-v1/clients/sample-accounting/supabase/migrations/` antes de aplicarse
2. **El frontend nunca ejecuta DDL** — solo regenera types
3. **Convención de nombres**: `YYYYMMDD_NNN_descripcion_corta.sql`
4. **Ruta de migraciones**: `/Users/gabrielvilabracho/projects/agencia-v1/clients/sample-accounting/supabase/migrations/`
5. **Ante duda de origen de un error** — el frontend reporta, el backend diagnostica

---

## Referencia rápida

| Situación | Quién actúa primero | Formato |
|-----------|-------------------|---------|
| Frontend necesita columna nueva | Frontend solicita | Tipo 1 |
| Backend elimina función | Backend notifica | Tipo 2 |
| Error en producción | Frontend reporta | Tipo 3 |
| Backend cambia enum | Backend notifica | Tipo 4 |
| Types desactualizados | Frontend regenera solo | — |

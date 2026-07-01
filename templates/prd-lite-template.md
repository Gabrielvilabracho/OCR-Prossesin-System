# PRD Lite: [Nombre de la Automatización]

**Alias interno**: `PDR` (si el equipo lo usa)
**Cliente**: [nombre]
**Owner delivery**: [nombre]
**Fecha**: YYYY-MM-DD
**Estado**: `Draft` | `En revisión` | `Aprobado` | `En ejecución` | `Cerrado`
**Fase actual**: `F0` | `F1` | `F2` | `F3` | `F4` | `F5` | `F6`

---

## 1) Problema de Negocio (AS-IS)

- Dolor principal: [qué pasa hoy]
- Impacto: [tiempo / errores / costo / experiencia]
- Quién lo sufre: [rol/área]

**Baseline actual**

| Métrica | Valor actual | Fuente | Fecha de medición |
|---------|--------------|--------|-------------------|
| Horas/mes invertidas | [X] | [planilla/Supabase/etc.] | [YYYY-MM-DD] |
| % error del proceso | [Y%] | [fuente] | [YYYY-MM-DD] |
| Tiempo de respuesta | [Z min] | [fuente] | [YYYY-MM-DD] |

---

## 2) Objetivo y KPI Target (TO-BE)

- Objetivo de negocio: [resultado esperado en una línea]

| Métrica | Baseline | Target | Plazo |
|---------|----------|--------|-------|
| Horas ahorradas/mes | [X] | [Y] | [30/60/90 días] |
| Reducción de errores | [X%] | [Y%] | [30/60/90 días] |
| Tiempo de respuesta | [X min] | [Y min] | [inmediato/30 días] |

---

## 3) Alcance

### IN
- [automatización A]
- [integración B]

### OUT
- [lo que NO se hará]
- [límite explícito]

---

## 4) Flujo Principal

1. [Trigger/evento de entrada]
2. [Procesamiento/reglas]
3. [Salida/acción final]

**Stack**: [n8n | Trigger.dev | ambos]
**Integraciones**: [Slack, Gmail, CRM, etc.]

---

## 5) Requisitos Mínimos

### Funcionales
- [RF-01] [descripción]
- [RF-02] [descripción]

### No funcionales
- Seguridad: [secretos fuera del repo, permisos mínimos]
- Observabilidad: [logs + alertas mínimas]
- Confiabilidad: [reintentos/cola/idempotencia si aplica]

---

## 6) Riesgos y Supuestos

| Riesgo | Prob. | Impacto | Mitigación |
|--------|-------|---------|------------|
| [riesgo] | Alta/Media/Baja | Alto/Medio/Bajo | [acción] |

- Supuesto 1: [ej. API disponible en F1]
- Supuesto 2: [ej. acceso del cliente en tiempo y forma]

---

## 7) Plan de Validación

- [ ] Caso feliz probado con evidencia
- [ ] Caso de error probado (fallback/alerta)
- [ ] KPI medible desde go-live

**Evidencia**: [links a logs, capturas, reporte, run IDs]

---

## 8) Roadmap F0 → F6 (compacto)

| Fase | Entregable | Owner | Estado |
|------|------------|-------|--------|
| F0 Intake | Brief aprobado | [nombre] | [ ] |
| F1 Diagnóstico | AS-IS + oportunidades | [nombre] | [ ] |
| F2 Diseño | TO-BE + KPI + plan | [nombre] | [ ] |
| F3 Build | Implementación + tests | [nombre] | [ ] |
| F4 Seguridad/QA | Checklist + Go/No-Go | [nombre] | [ ] |
| F5 Go-live/Handoff | Runbook + training | [nombre] | [ ] |
| F6 Operación | KPIs activos + mejora | [nombre] | [ ] |

---

## 9) Go-live y Rollback

- Fecha objetivo go-live: [YYYY-MM-DD]
- Criterio Go/No-Go: [checklist mínimo]
- Plan rollback: [pasos + owner + ETA]

---

## 10) Aprobaciones

| Rol | Nombre | Fecha | OK |
|-----|--------|-------|----|
| Cliente | [ ] | [ ] | [ ] |
| Owner delivery | [ ] | [ ] | [ ] |
| Responsable técnico | [ ] | [ ] | [ ] |

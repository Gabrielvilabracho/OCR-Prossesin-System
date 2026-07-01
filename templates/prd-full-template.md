# PRD Full: [Nombre del Proyecto de Automatización/AI]

**Alias interno**: `PDR` (si el equipo lo usa)
**Cliente**: [nombre]
**Sponsor negocio**: [nombre]
**Product/Delivery Owner**: [nombre]
**Owner técnico**: [nombre]
**Fecha**: YYYY-MM-DD
**Versión**: 1.0
**Estado**: `Draft` | `En revisión` | `Aprobado` | `En ejecución` | `Cerrado`
**Fase actual**: `F0` | `F1` | `F2` | `F3` | `F4` | `F5` | `F6`

---

## 1) Resumen Ejecutivo

- Qué se construye: [1-2 líneas]
- Por qué importa ahora: [driver de negocio]
- Resultado esperado: [impacto tangible]

---

## 2) Contexto y Problema (AS-IS)

### 2.1 Situación actual
- Proceso actual: [describir flujo manual/actual]
- Fricciones principales: [cuellos de botella, errores, retrabajo]
- Stakeholders afectados: [roles/áreas]

### 2.2 Línea base de métricas

| Métrica | Baseline | Fuente | Método de medición | Fecha |
|---------|----------|--------|--------------------|-------|
| Horas operativas/mes | [X] | [fuente] | [cómo se calculó] | [YYYY-MM-DD] |
| Error rate | [Y%] | [fuente] | [cómo se calculó] | [YYYY-MM-DD] |
| SLA/tiempo de respuesta | [Z] | [fuente] | [cómo se calculó] | [YYYY-MM-DD] |
| Costo operativo mensual | [$] | [fuente] | [cómo se calculó] | [YYYY-MM-DD] |

### 2.3 Evidencia del problema
- [link evidencia 1]
- [link evidencia 2]

---

## 3) Objetivos, KPIs y Criterios de Éxito (TO-BE)

### 3.1 Objetivos de negocio
- OBJ-01: [resultado concreto]
- OBJ-02: [resultado concreto]

### 3.2 KPIs (baseline → target)

| KPI | Baseline | Target | Horizonte | Owner |
|-----|----------|--------|-----------|-------|
| Horas ahorradas/mes | [X] | [Y] | [30/60/90 días] | [rol] |
| Reducción de errores | [X%] | [Y%] | [30/60/90 días] | [rol] |
| Tiempo de respuesta | [X] | [Y] | [inmediato/30 días] | [rol] |
| Cumplimiento SLA | [X%] | [Y%] | [mensual] | [rol] |

### 3.3 Criterio de éxito del proyecto
- [ ] Cumple objetivos críticos de negocio
- [ ] KPI trazable con fuente de datos válida
- [ ] Operación estable por [N] semanas sin incidentes severos

---

## 4) Alcance

### 4.1 IN (incluye)
- [capacidad/automatización 1]
- [integración 2]
- [dashboard/reporte 3]

### 4.2 OUT (no incluye)
- [límite 1]
- [límite 2]

### 4.3 Dependencias externas
- [API/proveedor/equipo]
- [acceso/credenciales/permisos]

---

## 5) Actores y Casos de Uso

| Actor | Objetivo | Frecuencia | Nivel de criticidad |
|-------|----------|------------|---------------------|
| [rol] | [qué necesita lograr] | [diario/semanal] | [alto/medio/bajo] |

### Casos de uso principales
- CU-01: Como [actor], quiero [acción], para [resultado]
- CU-02: Como [actor], quiero [acción], para [resultado]

---

## 6) Flujo TO-BE (alto nivel)

1. Trigger: [evento]
2. Validación y enriquecimiento: [reglas]
3. Decisión/ramificación: [condiciones]
4. Acción principal: [integración/sistema]
5. Notificación y cierre: [canal]

**Stack principal**: [n8n | Trigger.dev | ambos]
**Razonamiento de elección**: [por qué esta herramienta y no la otra]
**Integraciones**: [lista]

---

## 7) Requisitos Funcionales

| ID | Requisito | Prioridad | Criterio de aceptación |
|----|-----------|-----------|------------------------|
| RF-01 | [descripción] | Must/Should/Could | [dado/cuando/entonces] |
| RF-02 | [descripción] | Must/Should/Could | [dado/cuando/entonces] |

---

## 8) Requisitos No Funcionales

### 8.1 Seguridad
- Secretos fuera de repo (`.env` en entorno seguro)
- Principio de mínimo privilegio en integraciones
- Checklist F4 completo antes de prod

### 8.2 Confiabilidad
- Estrategia de retry/backoff: [definir]
- Idempotencia: [clave/estrategia]
- Timeouts y manejo de fallos: [definir]

### 8.3 Observabilidad
- Logs estructurados por ejecución
- Alertas por falla crítica
- KPIs visibles en dashboard

### 8.4 Performance y costos
- Volumen esperado: [N eventos/día]
- Latencia objetivo: [X seg]
- Límite de costo operativo mensual: [$]

---

## 9) Datos e Integraciones

| Sistema | Tipo de dato | Dirección | Método | Riesgo |
|--------|--------------|-----------|--------|--------|
| [CRM] | [lead/status] | entrada/salida | API/Webhook | [alto/medio/bajo] |

### Calidad de datos
- Validaciones obligatorias: [campos/reglas]
- Estrategia de fallback cuando faltan datos: [definir]

---

## 10) Riesgos, Supuestos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación | Owner |
|--------|--------------|---------|------------|-------|
| [riesgo 1] | Alta/Media/Baja | Alto/Medio/Bajo | [plan] | [rol] |

### Supuestos
- [supuesto 1]
- [supuesto 2]

### Decisiones abiertas
- [tema] — responsable [rol] — fecha límite [YYYY-MM-DD]

---

## 11) Plan por Fases (F0 → F6)

| Fase | Output requerido (gate) | Owner | Fecha objetivo | Estado |
|------|--------------------------|-------|----------------|--------|
| F0 Intake | Brief estructurado aprobado | [rol] | [fecha] | [ ] |
| F1 Diagnóstico | AS-IS + oportunidades priorizadas | [rol] | [fecha] | [ ] |
| F2 Diseño/Plan | TO-BE + KPI baseline/target + roadmap | [rol] | [fecha] | [ ] |
| F3 Build | Incremental + evidencia de tests | [rol] | [fecha] | [ ] |
| F4 Seguridad + QA | Checklist accesos/secretos + Go/No-Go | [rol] | [fecha] | [ ] |
| F5 Go-live + Handoff | Runbook + ownership + training | [rol] | [fecha] | [ ] |
| F6 Operación + Mejora | KPIs activos + optimización continua | [rol] | [fecha] | [ ] |

---

## 12) Plan de QA y Validación

### 12.1 Casos de prueba
- [ ] Caso feliz end-to-end
- [ ] Errores de integración y fallback
- [ ] Reintentos/idempotencia
- [ ] Seguridad/permisos mínimos

### 12.2 Evidencia requerida
- [links a logs, runs, reportes, capturas]

### 12.3 Go/No-Go
- Criterios Go: [lista]
- Criterios No-Go: [lista]

---

## 13) Operación, Soporte y Handoff

- Runbook: [link]
- On-call / escalamiento: [tabla o link]
- Capacitación al cliente: [fecha + material]
- Ownership post go-live: [roles]

---

## 14) Rollback y Continuidad

- Condición que dispara rollback: [definir]
- Paso a paso de rollback: [definir]
- RTO/RPO esperados: [definir]
- Responsable de ejecutar rollback: [rol]

---

## 15) Aprobaciones

| Rol | Nombre | Fecha | Aprobación |
|-----|--------|-------|------------|
| Sponsor negocio | [ ] | [ ] | [ ] |
| Cliente / Stakeholder principal | [ ] | [ ] | [ ] |
| Owner delivery | [ ] | [ ] | [ ] |
| Owner técnico | [ ] | [ ] | [ ] |

---

## 16) Historial de Cambios

| Versión | Fecha | Cambio | Autor |
|---------|-------|--------|-------|
| 1.0 | YYYY-MM-DD | Versión inicial | [nombre] |

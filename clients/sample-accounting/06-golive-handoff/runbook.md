# Runbook — [Cliente] / [Nombre del Workflow]

**Versión**: 1.0
**Fecha go-live**: YYYY-MM-DD
**Owner operación**: [nombre]
**Contacto agencia (soporte)**: [email/Slack]

---

## Descripción del Sistema

[1 párrafo: qué hace este workflow, cuándo se ejecuta, qué impacto tiene]

**URL dashboard**: [n8n instance o Trigger.dev dashboard]
**Frecuencia de ejecución**: [cada X horas / por webhook / manual]
**Sistemas conectados**: [lista]

---

## Operación Normal

### ¿Cómo verificar que está funcionando?

1. [paso 1: ej. "ir al dashboard de n8n y verificar último run exitoso"]
2. [paso 2: ej. "revisar email de reporte diario"]
3. [paso 3: ej. "verificar en [sistema destino] que los datos llegaron"]

**Indicadores de salud**:
- ✅ Normal: [descripción de estado sano]
- ⚠️ Degradado: [señales de problema]
- ❌ Caído: [señales de fallo total]

---

## Incidentes y Resolución

### Incidente: [nombre del problema más probable]

**Síntoma**: [cómo se detecta]
**Causa más común**: [descripción]
**Resolución**:
1. [paso 1]
2. [paso 2]
**Tiempo estimado de resolución**: X minutos
**Escalamiento**: si no resuelve en X min → contactar [nombre] a [contacto]

---

### Incidente: Workflow detenido / en error

**Síntoma**: no hay runs en los últimos X minutos
**Verificar**:
1. [ ] Estado del servicio n8n/Trigger.dev
2. [ ] Credenciales expiradas
3. [ ] Cambio en API del sistema fuente/destino
**Resolución**: [pasos]
**Escalamiento**: [a quién y cuándo]

---

## Procedimientos de Mantenimiento

### Actualizar credenciales
1. [dónde están las credenciales]
2. [cómo actualizarlas en n8n/Trigger.dev]
3. [cómo verificar que funcionan]

### Pausa planificada del workflow
1. [cómo pausarlo]
2. [cómo reanudarlo]
3. [qué verificar post-reactivación]

---

## Rollback

**Cuándo hacer rollback**: [criterio]

**Pasos**:
1. [paso 1]
2. [paso 2]

**Tiempo estimado**: X minutos
**Owner**: [nombre]

---

## Escalamiento

| Nivel | Cuándo | A quién | Canal | SLA respuesta |
|-------|--------|---------|-------|---------------|
| L1 | Problema que resuelve el runbook | [owner cliente] | [canal] | 15 min |
| L2 | Problema no cubierto por runbook | [contacto agencia] | [canal] | 2 h |
| L3 | Incidente crítico / pérdida de datos | [contacto agencia senior] | [canal] | 30 min |

---

## Ownership Post Go-live

| Responsabilidad | Owner | Contacto |
|-----------------|-------|----------|
| Operación diaria | [cliente/agencia] | — |
| Cambios de configuración | [agencia] | — |
| Renovación de credenciales | [cliente] | — |
| Monitoreo de KPIs | [cliente] | — |

---

## Historial de Cambios

| Fecha | Cambio | Autor |
|-------|--------|-------|
| YYYY-MM-DD | Go-live inicial | [nombre] |

# Observabilidad — [Nombre Automatización]

## Logs

| Nivel | Dónde verlos | Qué buscar |
|-------|--------------|------------|
| Info | [n8n execution log / Trigger.dev dashboard] | Runs exitosos |
| Warning | [mismo] | Retries, timeouts |
| Error | [mismo] + alerta activa | Fallos, excepciones |

## Alertas Configuradas

| Condición | Canal | Owner |
|-----------|-------|-------|
| Fallo de ejecución | Slack #alertas / Email | [nombre] |
| Sin runs en X horas | [canal] | [nombre] |
| [condición específica] | [canal] | [nombre] |

## KPIs del Workflow

| Métrica | Frecuencia de medición | Target | Actual |
|---------|----------------------|--------|--------|
| Tasa de éxito | diario | >99% | — |
| Tiempo de ejecución promedio | por run | <X min | — |
| Volumen procesado | diario | X items | — |

## Dashboard

**URL**: [link al dashboard de n8n o Trigger.dev]
**Acceso**: [quién tiene acceso]

## Revisión periódica

- [ ] Semanal: revisar tasa de éxito y errores
- [ ] Mensual: revisar KPIs vs target del cliente
- [ ] Trimestral: revisar si el workflow necesita optimización

# Diseño TO-BE — [Cliente]

**Fecha**: YYYY-MM-DD
**Elaborado por**: [nombre]
**Aprobado por**: [nombre cliente] — [ ] Pendiente / [ ] Aprobado

---

## Flujo TO-BE

```
[Diagrama del flujo automatizado]
Trigger → Step 1 (automatizado) → Step 2 → ... → Output
```

**Stack definido**: n8n / Trigger.dev / ambos
**Integraciones**: [lista de sistemas conectados]

---

## KPIs: Baseline → Target

| Métrica | Baseline | Target | Plazo | Cómo medir |
|---------|----------|--------|-------|------------|
| Horas manuales/mes | X h | Y h | 1 mes | reporte manual |
| Tasa de error | X% | Y% | 2 semanas | logs del workflow |
| Tiempo de respuesta | X h | Y min | inmediato | timestamp logs |
| [métrica específica] | — | — | — | — |

---

## Arquitectura de la Solución

### Componentes
| Componente | Tipo | Herramienta | Descripción |
|------------|------|-------------|-------------|
| [comp 1] | Trigger / Workflow / Agent | n8n/Trigger.dev | [qué hace] |

### Diagrama de dependencias
```
[Sistema A] → [Workflow 1] → [Sistema B]
                    ↓
              [Notificación]
```

---

## Plan de Implementación por Fases

| Fase | Alcance | Duración | Owner | Gate |
|------|---------|----------|-------|------|
| MVP | [qué incluye el mínimo viable] | X días | [nombre] | Demo funcional |
| Fase 2 | [mejoras] | X días | [nombre] | Tests pasando |
| Full | [feature completa] | X días | [nombre] | Go-live aprobado |

---

## Roadmap

```
Semana 1: [descripción]
Semana 2: [descripción]
Semana 3: [descripción]
```

---

## Owners

| Responsabilidad | Owner | Contacto |
|-----------------|-------|----------|
| Implementación | [nombre agencia] | — |
| Validación negocio | [nombre cliente] | — |
| Accesos/IT | [nombre cliente] | — |

---

## Supuestos del Diseño

- [supuesto 1: ej. "APIs del CRM están documentadas y disponibles"]
- [supuesto 2]

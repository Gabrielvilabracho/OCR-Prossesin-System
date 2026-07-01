# Weekly Ritual — Agencia AI

Cadencia semanal no negociable. Sin output = no está hecho.

---

## Lunes — Prioridades y Planificación

**Objetivo**: arrancar la semana con claridad total.

### Checklist
- [ ] Revisar todos los proyectos activos en `clients/`
- [ ] Identificar bloqueos o dependencias externas
- [ ] Revisar intake pendiente (¿hay briefs sin diagnosticar?)
- [ ] Definir las 3 prioridades de la semana
- [ ] Actualizar `decisions/log.md` si hay decisiones estratégicas

### Output esperado
Un bloque de texto en `decisions/log.md` o Notion con:
```
## Semana YYYY-WXX
### Prioridades
1. [Cliente/Proyecto] — [Tarea específica]
2. ...
3. ...
### Bloqueos activos
- ...
```

---

## Miércoles — Calidad Técnica

**Objetivo**: mantener la deuda técnica bajo control.

### Checklist
- [ ] Revisar workflows/automations recién deployados
- [ ] ¿Hay alertas sin resolver en observabilidad?
- [ ] Code review pendiente de la semana
- [ ] ¿Algún patrón repetido que debería ser template o SOP?
- [ ] Deuda técnica: documentar en `decisions/log.md` si aplica

### Output esperado
- Patterns detectados → crear template en `templates/` o SOP
- Deuda técnica documentada con owner y estimación
- Workflows revisados con evidencia en `automations/<cliente>/tests.md`

---

## Viernes — KPIs, Decisiones y Cleanup

**Objetivo**: cerrar la semana con evidencia y visibilidad.

### Checklist
- [ ] Actualizar métricas en `templates/metrics-dashboard.md`
- [ ] Registrar decisiones de la semana en `decisions/log.md`
- [ ] Proyectos inactivos 90+ días → mover a `archives/`
- [ ] ¿Hay algo en `automations/` sin tests documentados?
- [ ] Retrospectiva: ¿qué funcionó? ¿qué no? ¿qué cambiar?

### Output esperado
```
## Viernes YYYY-MM-DD
### KPIs semana
- [Cliente A]: X horas ahorradas, Y errores reducidos
- ...
### Decisiones registradas
- ADR-XXX: [título]
### Cleanup
- Movido a archives/: [lista]
### Retrospectiva
- Funcionó: ...
- No funcionó: ...
- Acción: ...
```

---

## Regla de oro

> Si no hay output escrito, no pasó.
> El ritual no es una reunión — es evidencia.

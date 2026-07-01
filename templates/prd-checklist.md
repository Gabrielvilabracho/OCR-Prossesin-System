# Checklist PRD/PDR — Revisión Quincenal

**Objetivo**: asegurar que cada proyecto use el nivel correcto (`Lite` vs `Full`), mantener calidad documental y eliminar burocracia.

**Cadencia recomendada**: cada 2 semanas (quincenal)
**Owner**: Delivery Owner + Owner técnico
**Entrada**: PRD activo (`templates/prd-lite-template.md` o `templates/prd-full-template.md`)
**Salida**: decisión de mantener, promover o simplificar

---

## 1) Gating rápido: ¿Lite o Full?

Marcá cada condición que aplique:

- [ ] Impacto alto en operación/ingresos
- [ ] 3 o más stakeholders con necesidades distintas
- [ ] Integraciones críticas o dependencias externas inestables
- [ ] Requisitos fuertes de seguridad/compliance
- [ ] Riesgo alto de rollback complejo
- [ ] Proyecto con horizonte > 6 semanas

**Regla de decisión**

- `0-1` checks: mantener **Lite**
- `2-3` checks: evaluar migración a **Full**
- `4+` checks: usar **Full** obligatorio

---

## 2) Calidad mínima del documento (DoD de PRD)

- [ ] Problema de negocio está claro y con evidencia
- [ ] KPIs tienen baseline, target, plazo y owner
- [ ] Alcance IN/OUT está explícito
- [ ] Riesgos y supuestos están actualizados
- [ ] Plan de validación tiene evidencia verificable
- [ ] Go-live y rollback definidos
- [ ] Fase actual F0→F6 marcada y coherente con avances

---

## 3) Salud del alcance (anti-scope-creep)

- [ ] No entraron requerimientos fuera de IN sin aprobación
- [ ] Todo cambio de alcance tiene impacto en fecha/costo/KPI
- [ ] Se registraron decisiones abiertas con responsable y fecha

Si hay scope creep:
- Acción: [re-baseline de KPIs / ajuste de roadmap / renegociación de alcance]
- Owner: [nombre]
- Fecha compromiso: [YYYY-MM-DD]

---

## 4) Promoción Lite → Full (si aplica)

Promover a **Full** cuando ocurra al menos una:

- [ ] Nuevo riesgo alto no contemplado
- [ ] Aumento de stakeholders o áreas impactadas
- [ ] Requisitos no funcionales más estrictos
- [ ] Se agregan integraciones críticas
- [ ] Cliente exige trazabilidad formal de QA/Go-No-Go

**Plan de promoción**

- Fecha de promoción: [YYYY-MM-DD]
- Responsable: [nombre]
- Secciones mínimas a completar en Full: [RF/RNF, datos/integraciones, QA, handoff]

---

## 5) Simplificación de template (cada 4–6 semanas)

Evaluar campos del PRD y decidir:

- [ ] Campo usado y aporta decisión → **mantener**
- [ ] Campo repetido con otra sección → **fusionar**
- [ ] Campo nunca usado en 3+ proyectos → **eliminar**

**Cambios acordados al template**

| Campo/Sección | Decisión | Motivo | Fecha | Owner |
|---------------|----------|--------|-------|-------|
| [campo] | Mantener/Fusionar/Eliminar | [razón] | [YYYY-MM-DD] | [nombre] |

---

## 6) Cierre de revisión

- Tipo actual: `Lite` | `Full`
- Decisión: `Sin cambios` | `Promover a Full` | `Simplificar`
- Próxima revisión: [YYYY-MM-DD]
- Aprobadores: [Delivery Owner] + [Owner técnico] + [Stakeholder principal]

---

## Registro de revisiones

| Fecha | Proyecto | Tipo anterior | Tipo nuevo | Resultado | Owner |
|-------|----------|---------------|-----------|-----------|-------|
| YYYY-MM-DD | [nombre] | Lite/Full | Lite/Full | [resumen corto] | [nombre] |

# QA + Seguridad Checklist — [Cliente]

**Fecha**: YYYY-MM-DD
**Revisado por**: [nombre]
**Estado**: En revisión / Aprobado / Bloqueado

---

## Seguridad y Accesos

### Secrets y Credenciales
- [ ] Todas las credenciales están en vault/env (NUNCA en el código)
- [ ] `.env` está en `.gitignore` y no fue committeado
- [ ] API keys tienen el scope mínimo necesario (principle of least privilege)
- [ ] Credenciales de prod son distintas a las de dev/staging

### Permisos
- [ ] El workflow solo tiene acceso a los sistemas que necesita
- [ ] Accesos auditados y aprobados por el cliente
- [ ] No hay credenciales compartidas entre proyectos

### Datos
- [ ] Datos sensibles del cliente no se loguean en texto plano
- [ ] Datos PII manejados según regulación aplicable (GDPR/HIPAA/etc.)
- [ ] Retención de datos definida y configurada

---

## Pruebas Funcionales

| Caso de prueba | Input | Output esperado | Resultado | Fecha |
|----------------|-------|-----------------|-----------|-------|
| Happy path | [descripción] | [resultado esperado] | ✅ / ❌ | — |
| Edge case 1 | [descripción] | [resultado esperado] | ✅ / ❌ | — |
| Error handling | [descripción] | [manejo de error] | ✅ / ❌ | — |

---

## Pruebas de Regresión

- [ ] Funcionalidades existentes no afectadas
- [ ] Integraciones externas funcionando post-cambio
- [ ] Performance dentro de límites aceptables

---

## Observabilidad

- [ ] Logs activos y accesibles
- [ ] Alertas configuradas para errores críticos
- [ ] Dashboard de monitoreo funcional
- [ ] Notificación de fallos a owner definida

---

## Contingencia / Rollback

**Plan de rollback**:
[Describir cómo revertir si algo falla en prod]

**Tiempo estimado de rollback**: X minutos

**Owner del rollback**: [nombre]

---

## Gate Go / No-Go

| Criterio | Estado |
|----------|--------|
| Todos los casos de prueba pasando | ✅ / ❌ |
| Checklist de seguridad completo | ✅ / ❌ |
| Observabilidad activa | ✅ / ❌ |
| Rollback documentado | ✅ / ❌ |
| Aprobación cliente | ✅ / ❌ |

**Decisión final**:
- [ ] **GO** — proceder a F5 Go-live
- [ ] **NO-GO** — bloqueado por: [razón]

**Firmado por**: [nombre] — [fecha]

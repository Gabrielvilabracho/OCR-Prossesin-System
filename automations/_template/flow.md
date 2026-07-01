# Flujo — [Nombre Automatización]

## Diagrama

```
[Trigger] → [Step 1] → [Step 2] → [Step 3] → [Output]
                           ↓ (error)
                      [Error handler] → [Notificación]
```

## Steps

### Step 1: [Nombre]
- **Nodo**: [tipo de nodo en n8n / nombre de task en Trigger.dev]
- **Input**: [qué recibe]
- **Output**: [qué produce]
- **Config clave**: [parámetros importantes]

### Step 2: [Nombre]
- **Nodo**: [...]
- **Input**: [...]
- **Output**: [...]

## Error Handling

| Error | Estrategia | Notificación |
|-------|-----------|--------------|
| [error 1] | Retry x3 / Skip / Stop | Slack / Email / Log |
| [error 2] | — | — |

## Variables de Entorno Necesarias

```
VARIABLE_1=
VARIABLE_2=
```

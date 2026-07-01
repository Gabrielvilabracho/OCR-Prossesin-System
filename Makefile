# =============================================================================
# Agencia AI — Makefile
# =============================================================================
# Uso:
#   make dev          → levanta toda la infra + worker de Trigger.dev
#   make infra-up     → solo Docker (Trigger.dev + n8n) en background
#   make infra-down   → baja toda la infra Docker
#   make trigger-dev  → solo el worker de Trigger.dev (requiere infra corriendo)
#   make trigger-up   → solo Docker de Trigger.dev en background
#   make n8n-up       → solo Docker de n8n en background
#   make status       → estado de todos los contenedores
#   make logs         → logs de Trigger.dev en tiempo real
# =============================================================================

TRIGGER_DIR     := infrastructure/trigger.dev
N8N_DIR         := infrastructure/n8n
WORKER_DIR      := trigger

# Docker socket — compatible con Docker Desktop en macOS
export DOCKER_HOST := unix:///$(HOME)/.docker/run/docker.sock

.PHONY: dev infra-up infra-down trigger-up trigger-down trigger-dev n8n-up n8n-down status logs help

# -----------------------------------------------------------------------------
# dev: levanta infra en background y arranca el worker en foreground
# -----------------------------------------------------------------------------
dev: infra-up
	@echo ""
	@echo "Esperando que Trigger.dev esté healthy..."
	@sleep 5
	@echo "Arrancando worker..."
	@cd $(WORKER_DIR) && npm run dev

# -----------------------------------------------------------------------------
# infra-up: levanta Trigger.dev + n8n en background (detached)
# -----------------------------------------------------------------------------
infra-up: trigger-up n8n-up
	@echo ""
	@echo "Infra levantada. Trigger.dev en http://localhost:3040 | n8n en http://localhost:5678"

# -----------------------------------------------------------------------------
# infra-down: baja toda la infra
# -----------------------------------------------------------------------------
infra-down: trigger-down n8n-down
	@echo "Infra detenida."

# -----------------------------------------------------------------------------
# Trigger.dev
# -----------------------------------------------------------------------------
trigger-up:
	@echo "Levantando Trigger.dev..."
	@cd $(TRIGGER_DIR) && docker compose -p trigger up -d

trigger-down:
	@echo "Bajando Trigger.dev..."
	@cd $(TRIGGER_DIR) && docker compose -p trigger down

trigger-dev:
	@cd $(WORKER_DIR) && npm run dev

# -----------------------------------------------------------------------------
# n8n
# -----------------------------------------------------------------------------
n8n-up:
	@echo "Levantando n8n..."
	@cd $(N8N_DIR) && docker compose up -d

n8n-down:
	@echo "Bajando n8n..."
	@cd $(N8N_DIR) && docker compose down

# -----------------------------------------------------------------------------
# Utilidades
# -----------------------------------------------------------------------------
status:
	@echo "=== Contenedores activos ==="
	@docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

logs:
	@cd $(TRIGGER_DIR) && docker compose -p trigger logs -f webapp

help:
	@echo ""
	@echo "Comandos disponibles:"
	@echo "  make dev          Levanta infra + worker (todo lo necesario para desarrollar)"
	@echo "  make infra-up     Solo Docker en background (Trigger.dev + n8n)"
	@echo "  make infra-down   Baja toda la infra Docker"
	@echo "  make trigger-up   Solo Docker de Trigger.dev"
	@echo "  make trigger-dev  Solo el worker de Trigger.dev"
	@echo "  make n8n-up       Solo Docker de n8n"
	@echo "  make status       Estado de contenedores"
	@echo "  make logs         Logs de Trigger.dev en tiempo real"
	@echo ""

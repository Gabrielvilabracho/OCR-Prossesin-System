#!/bin/sh
# Setup script for the analytics subproject.
# Follows POSIX sh conventions from infrastructure/n8n/lib.sh.

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

REQUIRED_PYTHON_MAJOR=3
REQUIRED_PYTHON_MINOR=12

# --- Helpers ---

log() {
    printf "[analytics] %s\n" "$1"
}

die() {
    printf "[analytics] ERROR: %s\n" "$1" >&2
    exit 1
}

check_python() {
    if command -v python3 >/dev/null 2>&1; then
        PYTHON_CMD="python3"
    elif command -v python >/dev/null 2>&1; then
        PYTHON_CMD="python"
    else
        die "Python not found. Install Python ${REQUIRED_PYTHON_MAJOR}.${REQUIRED_PYTHON_MINOR}+: brew install python@${REQUIRED_PYTHON_MAJOR}.${REQUIRED_PYTHON_MINOR}"
    fi

    PYTHON_VERSION=$($PYTHON_CMD -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
    MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
    MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)

    if [ "$MAJOR" -lt "$REQUIRED_PYTHON_MAJOR" ] || { [ "$MAJOR" -eq "$REQUIRED_PYTHON_MAJOR" ] && [ "$MINOR" -lt "$REQUIRED_PYTHON_MINOR" ]; }; then
        die "Python ${REQUIRED_PYTHON_MAJOR}.${REQUIRED_PYTHON_MINOR}+ required, found $PYTHON_VERSION"
    fi

    log "Found $PYTHON_CMD $PYTHON_VERSION"
}

create_venv() {
    if [ -d "$PROJECT_DIR/.venv" ]; then
        log "Virtual environment already exists at .venv"
    else
        log "Creating virtual environment..."
        $PYTHON_CMD -m venv "$PROJECT_DIR/.venv"
        log "Virtual environment created at .venv"
    fi
}

install_deps() {
    log "Installing dependencies (editable + dev)..."
    "$PROJECT_DIR/.venv/bin/pip" install --quiet --upgrade pip
    "$PROJECT_DIR/.venv/bin/pip" install --quiet -e ".[dev]"
    log "Dependencies installed"
}

create_env_file() {
    if [ ! -f "$PROJECT_DIR/.env" ]; then
        if [ -f "$PROJECT_DIR/.env.example" ]; then
            cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
            log "Created .env from .env.example — fill in your values"
        else
            log "No .env.example found, skipping .env creation"
        fi
    else
        log ".env already exists, skipping"
    fi
}

# --- Main ---

log "Setting up analytics subproject..."
cd "$PROJECT_DIR"

check_python
create_venv
install_deps
create_env_file

log "Setup complete!"
log ""
log "Activate the environment:  source .venv/bin/activate"
log "Run tests:                 pytest"
log "Run linter:                ruff check src tests"
log "Run type checker:          mypy"
log "Run dashboard:             streamlit run src/analytics/dashboards/example.py"

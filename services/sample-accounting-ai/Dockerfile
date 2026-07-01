FROM python:3.12-slim

WORKDIR /app

# Install uv
RUN pip install --no-cache-dir uv

# Copy lockfile and project metadata
COPY pyproject.toml uv.lock ./

# Install dependencies from lockfile (exact same resolution as dev)
RUN uv sync --frozen --no-dev --no-install-project

# Copy application source
COPY src/ ./src/

# Non-root user for security
RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8001

CMD uv run uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8001}

import os
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

import sentry_sdk
from fastapi import FastAPI
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.types import Event

from .api.routes import router
from .graph.invoice_graph import build_invoice_graph

_SENSITIVE_KEYS = {"raw_ocr_text", "document_bytes", "ocr_text"}


def _strip_keys(obj: dict[str, Any] | list[Any] | object, keys: set[str]) -> dict[str, Any] | list[Any] | object:
    """Recursively strip sensitive keys from a dict/list structure."""
    if isinstance(obj, dict):
        return {k: _strip_keys(v, keys) for k, v in obj.items() if k not in keys}
    if isinstance(obj, list):
        return [_strip_keys(item, keys) for item in obj]
    return obj


def _scrub_event(event: Event, hint: dict[str, Any]) -> Event | None:
    """Sentry before_send: strip sensitive invoice fields from event payload."""
    return _strip_keys(event, _SENSITIVE_KEYS)  # type: ignore[return-value]


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Build and cache the compiled graph at startup
    app.state.invoice_graph = build_invoice_graph()
    yield


def create_app() -> FastAPI:
    dsn = os.environ.get("SENTRY_DSN")
    if dsn:
        sentry_sdk.init(
            dsn=dsn,
            integrations=[FastApiIntegration()],
            before_send=_scrub_event,
            send_default_pii=False,
        )

    app = FastAPI(
        title="sample-accounting-ai",
        description="AI service for Sample Accounting invoice processing",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.include_router(router)
    return app


app = create_app()

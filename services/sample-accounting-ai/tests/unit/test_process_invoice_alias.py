"""Tests for POST /process-invoice — functional alias for /invoices/{id}/process.

FIX-1: The /process-invoice endpoint must not return status='stub'.
It must accept { storage_key, client_id, dry_run } and execute the pipeline.

For backward compatibility it calls run_invoice_pipeline internally.
"""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from src.main import app


INVOICE_ID = str(uuid4())
STORAGE_KEY = f"invoices/sample-accounting/2026/05/{INVOICE_ID}.pdf"
CLIENT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


class TestProcessInvoiceAlias:
    """POST /process-invoice must be a functional alias, not a stub."""

    def _pipeline_result(self) -> dict:  # type: ignore[type-arg]
        return {
            "status": "success",
            "invoice_id": INVOICE_ID,
            "extracted_fields": {"supplier_name": "TechSolutions Lda"},
            "math_valid": True,
            "errors": [],
            "audit_log": [],
        }

    def test_returns_200(self, client: TestClient):
        """POST /process-invoice must return 200."""
        with patch("src.api.routes.run_invoice_pipeline", new_callable=AsyncMock) as mock:
            mock.return_value = self._pipeline_result()
            resp = client.post(
                "/process-invoice",
                json={"storage_key": STORAGE_KEY, "client_id": CLIENT_ID},
            )
        assert resp.status_code == 200

    def test_does_not_return_stub_status(self, client: TestClient):
        """POST /process-invoice must NOT return status='stub'."""
        with patch("src.api.routes.run_invoice_pipeline", new_callable=AsyncMock) as mock:
            mock.return_value = self._pipeline_result()
            resp = client.post(
                "/process-invoice",
                json={"storage_key": STORAGE_KEY, "client_id": CLIENT_ID},
            )
        data = resp.json()
        assert data.get("status") != "stub", (
            "POST /process-invoice returned 'stub' — it must call the real pipeline"
        )

    def test_returns_invoice_id(self, client: TestClient):
        """POST /process-invoice response must include invoice_id."""
        with patch("src.api.routes.run_invoice_pipeline", new_callable=AsyncMock) as mock:
            mock.return_value = self._pipeline_result()
            resp = client.post(
                "/process-invoice",
                json={"storage_key": STORAGE_KEY, "client_id": CLIENT_ID},
            )
        data = resp.json()
        assert "invoice_id" in data

    def test_returns_status_field(self, client: TestClient):
        """POST /process-invoice response must include a real status field."""
        with patch("src.api.routes.run_invoice_pipeline", new_callable=AsyncMock) as mock:
            mock.return_value = self._pipeline_result()
            resp = client.post(
                "/process-invoice",
                json={"storage_key": STORAGE_KEY, "client_id": CLIENT_ID},
            )
        data = resp.json()
        assert data.get("status") in {"success", "failed", "dry_run", "processing"}

    def test_passes_storage_key_and_client_id_to_pipeline(self, client: TestClient):
        """POST /process-invoice must forward storage_key and client_id to the pipeline."""
        with patch("src.api.routes.run_invoice_pipeline", new_callable=AsyncMock) as mock:
            mock.return_value = self._pipeline_result()
            client.post(
                "/process-invoice",
                json={"storage_key": STORAGE_KEY, "client_id": CLIENT_ID, "dry_run": False},
            )
        call_kwargs = mock.call_args
        kwargs = call_kwargs.kwargs if call_kwargs.kwargs else {}
        assert kwargs.get("storage_key") == STORAGE_KEY
        assert kwargs.get("client_id") == CLIENT_ID

    def test_missing_storage_key_returns_422(self, client: TestClient):
        """POST /process-invoice without storage_key must return 422."""
        resp = client.post(
            "/process-invoice",
            json={"client_id": CLIENT_ID},
        )
        assert resp.status_code == 422

    def test_missing_client_id_returns_422(self, client: TestClient):
        """POST /process-invoice without client_id must return 422."""
        resp = client.post(
            "/process-invoice",
            json={"storage_key": STORAGE_KEY},
        )
        assert resp.status_code == 422

    def test_dry_run_is_forwarded(self, client: TestClient):
        """POST /process-invoice must forward dry_run=True to the pipeline."""
        with patch("src.api.routes.run_invoice_pipeline", new_callable=AsyncMock) as mock:
            dry_result = {**self._pipeline_result(), "status": "dry_run"}
            mock.return_value = dry_result
            resp = client.post(
                "/process-invoice",
                json={"storage_key": STORAGE_KEY, "client_id": CLIENT_ID, "dry_run": True},
            )
        call_kwargs = mock.call_args
        kwargs = call_kwargs.kwargs if call_kwargs.kwargs else {}
        assert kwargs.get("dry_run") is True

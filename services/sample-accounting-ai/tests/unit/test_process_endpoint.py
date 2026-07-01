"""Tests for POST /invoices/{id}/process endpoint.

Updated for sample-multiformat: covers image/xml happy paths,
conflict and unsupported format → 422 cases (SM0, SM3, SM4).
Uses FastAPI TestClient with mocked pipeline.
"""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from src.main import app


INVOICE_ID = str(uuid4())
STORAGE_KEY = f"invoices/sample-accounting/2026/05/{INVOICE_ID}.pdf"


class TestProcessInvoiceEndpoint:
    """Tests for POST /invoices/{id}/process."""

    def _make_success_result(self, invoice_id: str) -> dict:  # type: ignore[type-arg]
        return {
            "status": "success",
            "invoice_id": invoice_id,
            "extracted_fields": {
                "supplier_name": "TechSolutions Lda",
                "total": "1230.00",
            },
            "math_valid": True,
            "errors": [],
            "audit_log": [{"node": "persist", "status": "success"}],
        }

    def test_endpoint_exists_and_returns_200(self, client: TestClient):
        """POST /invoices/{id}/process must return 200."""
        with patch("src.api.routes.run_invoice_pipeline", new_callable=AsyncMock) as mock_pipeline:
            mock_pipeline.return_value = self._make_success_result(INVOICE_ID)

            resp = client.post(
                f"/invoices/{INVOICE_ID}/process",
                json={"storage_key": STORAGE_KEY, "client_id": "sample-client-001"},
            )

        assert resp.status_code == 200

    def test_response_has_invoice_id(self, client: TestClient):
        """Response must include invoice_id."""
        with patch("src.api.routes.run_invoice_pipeline", new_callable=AsyncMock) as mock_pipeline:
            mock_pipeline.return_value = self._make_success_result(INVOICE_ID)

            resp = client.post(
                f"/invoices/{INVOICE_ID}/process",
                json={"storage_key": STORAGE_KEY, "client_id": "sample-client-001"},
            )

        data = resp.json()
        assert "invoice_id" in data
        assert data["invoice_id"] == INVOICE_ID

    def test_response_has_status_field(self, client: TestClient):
        """Response must include a status field."""
        with patch("src.api.routes.run_invoice_pipeline", new_callable=AsyncMock) as mock_pipeline:
            mock_pipeline.return_value = self._make_success_result(INVOICE_ID)

            resp = client.post(
                f"/invoices/{INVOICE_ID}/process",
                json={"storage_key": STORAGE_KEY, "client_id": "sample-client-001"},
            )

        data = resp.json()
        assert "status" in data
        assert data["status"] in {"success", "failed", "dry_run", "processing"}

    def test_response_has_errors_field(self, client: TestClient):
        """Response must include an errors field (list)."""
        with patch("src.api.routes.run_invoice_pipeline", new_callable=AsyncMock) as mock_pipeline:
            mock_pipeline.return_value = self._make_success_result(INVOICE_ID)

            resp = client.post(
                f"/invoices/{INVOICE_ID}/process",
                json={"storage_key": STORAGE_KEY, "client_id": "sample-client-001"},
            )

        data = resp.json()
        assert "errors" in data
        assert isinstance(data["errors"], list)

    def test_missing_storage_key_returns_422(self, client: TestClient):
        """Request without storage_key must return 422 Unprocessable Entity."""
        resp = client.post(
            f"/invoices/{INVOICE_ID}/process",
            json={"client_id": "sample-client-001"},
        )
        assert resp.status_code == 422

    def test_missing_client_id_returns_422(self, client: TestClient):
        """Request without client_id must return 422 Unprocessable Entity."""
        resp = client.post(
            f"/invoices/{INVOICE_ID}/process",
            json={"storage_key": STORAGE_KEY},
        )
        assert resp.status_code == 422

    def test_dry_run_true_returns_dry_run_status(self, client: TestClient):
        """dry_run=True must return status='dry_run'."""
        dry_run_result = {
            "status": "dry_run",
            "invoice_id": INVOICE_ID,
            "extracted_fields": {},
            "math_valid": True,
            "errors": [],
            "audit_log": [],
        }

        with patch("src.api.routes.run_invoice_pipeline", new_callable=AsyncMock) as mock_pipeline:
            mock_pipeline.return_value = dry_run_result

            resp = client.post(
                f"/invoices/{INVOICE_ID}/process",
                json={"storage_key": STORAGE_KEY, "client_id": "sample-client-001", "dry_run": True},
            )

        assert resp.status_code == 200
        assert resp.json()["status"] == "dry_run"

    def test_pipeline_called_with_correct_invoice_id(self, client: TestClient):
        """run_invoice_pipeline must receive the invoice_id from the URL path."""
        with patch("src.api.routes.run_invoice_pipeline", new_callable=AsyncMock) as mock_pipeline:
            mock_pipeline.return_value = self._make_success_result(INVOICE_ID)

            client.post(
                f"/invoices/{INVOICE_ID}/process",
                json={"storage_key": STORAGE_KEY, "client_id": "sample-client-001"},
            )

        call_kwargs = mock_pipeline.call_args
        # invoice_id is the path parameter — verify it was passed to the pipeline
        args = call_kwargs.args if call_kwargs.args else ()
        kwargs = call_kwargs.kwargs if call_kwargs.kwargs else {}
        all_args = list(args) + list(kwargs.values())
        assert INVOICE_ID in all_args or any(
            INVOICE_ID in str(a) for a in all_args
        ), f"invoice_id {INVOICE_ID!r} not found in pipeline call: {call_kwargs}"

    def test_pipeline_exception_returns_500(self, client: TestClient):
        """If the pipeline raises an unexpected exception, return 500."""
        with patch("src.api.routes.run_invoice_pipeline", new_callable=AsyncMock) as mock_pipeline:
            mock_pipeline.side_effect = RuntimeError("Unexpected crash")

            resp = client.post(
                f"/invoices/{INVOICE_ID}/process",
                json={"storage_key": STORAGE_KEY, "client_id": "sample-client-001"},
            )

        assert resp.status_code == 500


class TestProcessEndpointMultiformat:
    """Tests for multi-format support (SM0, SM3, SM4) — sample-multiformat."""

    def _make_success_result(self, invoice_id: str) -> dict:  # type: ignore[type-arg]
        return {
            "status": "success",
            "invoice_id": invoice_id,
            "extracted_fields": {},
            "math_valid": True,
            "errors": [],
            "audit_log": [],
        }

    # ─── Happy paths ─────────────────────────────────────────────────────────

    def test_image_jpeg_request_returns_200(self, client: TestClient):
        """Valid JPEG storage_key must return 200 (SM2 happy path)."""
        jpeg_key = f"invoices/sample-accounting/2026/05/{INVOICE_ID}.jpg"

        with patch("src.api.routes.run_invoice_pipeline", new_callable=AsyncMock) as mock_pipeline:
            mock_pipeline.return_value = self._make_success_result(INVOICE_ID)

            resp = client.post(
                f"/invoices/{INVOICE_ID}/process",
                json={"storage_key": jpeg_key, "client_id": "sample-client-001"},
            )

        assert resp.status_code == 200

    def test_image_png_request_returns_200(self, client: TestClient):
        """Valid PNG storage_key must return 200 (SM2 happy path)."""
        png_key = f"invoices/sample-accounting/2026/05/{INVOICE_ID}.png"

        with patch("src.api.routes.run_invoice_pipeline", new_callable=AsyncMock) as mock_pipeline:
            mock_pipeline.return_value = self._make_success_result(INVOICE_ID)

            resp = client.post(
                f"/invoices/{INVOICE_ID}/process",
                json={"storage_key": png_key, "client_id": "sample-client-001"},
            )

        assert resp.status_code == 200

    def test_xml_request_returns_200(self, client: TestClient):
        """Valid XML storage_key must return 200 (SM3 happy path)."""
        xml_key = f"invoices/sample-accounting/2026/05/{INVOICE_ID}.xml"

        with patch("src.api.routes.run_invoice_pipeline", new_callable=AsyncMock) as mock_pipeline:
            mock_pipeline.return_value = self._make_success_result(INVOICE_ID)

            resp = client.post(
                f"/invoices/{INVOICE_ID}/process",
                json={"storage_key": xml_key, "client_id": "sample-client-001"},
            )

        assert resp.status_code == 200

    def test_valid_png_with_matching_mime_returns_200(self, client: TestClient):
        """Valid PNG key with matching image/png MIME must return 200 (SM0 acceptance)."""
        png_key = f"invoices/sample-accounting/2026/05/{INVOICE_ID}.png"

        with patch("src.api.routes.run_invoice_pipeline", new_callable=AsyncMock) as mock_pipeline:
            mock_pipeline.return_value = self._make_success_result(INVOICE_ID)

            resp = client.post(
                f"/invoices/{INVOICE_ID}/process",
                json={"storage_key": png_key, "client_id": "sample-client-001", "mime_type": "image/png"},
            )

        assert resp.status_code == 200

    # ─── Format rejection (SM4) ───────────────────────────────────────────────

    def test_unsupported_xlsx_returns_422(self, client: TestClient):
        """Unsupported .xlsx extension must return 422 (SM4)."""
        xlsx_key = f"invoices/sample-accounting/2026/05/{INVOICE_ID}.xlsx"

        resp = client.post(
            f"/invoices/{INVOICE_ID}/process",
            json={"storage_key": xlsx_key, "client_id": "sample-client-001"},
        )

        assert resp.status_code == 422

    def test_unsupported_docx_returns_422(self, client: TestClient):
        """Unsupported .docx extension must return 422 (SM4)."""
        docx_key = f"invoices/sample-accounting/2026/05/{INVOICE_ID}.docx"

        resp = client.post(
            f"/invoices/{INVOICE_ID}/process",
            json={"storage_key": docx_key, "client_id": "sample-client-001"},
        )

        assert resp.status_code == 422

    # ─── MIME/extension conflict (SM0) ───────────────────────────────────────

    def test_xml_extension_with_pdf_mime_returns_422(self, client: TestClient):
        """XML extension + application/pdf MIME conflict must return 422 (SM0)."""
        xml_key = f"invoices/sample-accounting/2026/05/{INVOICE_ID}.xml"

        resp = client.post(
            f"/invoices/{INVOICE_ID}/process",
            json={"storage_key": xml_key, "client_id": "sample-client-001", "mime_type": "application/pdf"},
        )

        assert resp.status_code == 422

    def test_png_extension_with_pdf_mime_returns_422(self, client: TestClient):
        """PNG extension + application/pdf MIME conflict must return 422 (SM0)."""
        png_key = f"invoices/sample-accounting/2026/05/{INVOICE_ID}.png"

        resp = client.post(
            f"/invoices/{INVOICE_ID}/process",
            json={"storage_key": png_key, "client_id": "sample-client-001", "mime_type": "application/pdf"},
        )

        assert resp.status_code == 422

    def test_graph_not_invoked_on_422(self, client: TestClient):
        """Pipeline must NOT be called when format validation fails with 422."""
        xlsx_key = f"invoices/sample-accounting/2026/05/{INVOICE_ID}.xlsx"

        with patch("src.api.routes.run_invoice_pipeline", new_callable=AsyncMock) as mock_pipeline:
            resp = client.post(
                f"/invoices/{INVOICE_ID}/process",
                json={"storage_key": xlsx_key, "client_id": "sample-client-001"},
            )

        assert resp.status_code == 422
        mock_pipeline.assert_not_called()

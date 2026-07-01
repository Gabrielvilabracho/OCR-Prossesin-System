"""Tests for Sentry integration — SO3 + SO4 + SO5.

TDD: RED tests before implementation.
"""

import os
from unittest.mock import MagicMock, call, patch


class TestSentryOptIn:
    """SO3: sentry_sdk.init() called when SENTRY_DSN set; skipped when absent."""

    def test_sentry_init_called_when_dsn_set(self) -> None:
        """SO3: sentry_sdk.init() is called with DSN when env var set."""
        with patch.dict(os.environ, {"SENTRY_DSN": "https://example.com/123"}):
            with patch("src.main.sentry_sdk") as mock_sentry:
                from src.main import create_app
                create_app()
                mock_sentry.init.assert_called_once()
                call_kwargs = mock_sentry.init.call_args[1]
                assert call_kwargs["dsn"] == "https://example.com/123"

    def test_sentry_init_skipped_when_dsn_absent(self) -> None:
        """SO3: sentry_sdk.init() NOT called when SENTRY_DSN is absent."""
        env_without_dsn = {k: v for k, v in os.environ.items() if k != "SENTRY_DSN"}
        with patch.dict(os.environ, env_without_dsn, clear=True):
            with patch("src.main.sentry_sdk") as mock_sentry:
                from src.main import create_app
                create_app()
                mock_sentry.init.assert_not_called()


class TestSentryCaptureOnError:
    """SO4: 500 errors call capture_exception with invoice_id + storage_key tags."""

    async def test_capture_exception_called_on_500(self, client: object) -> None:
        """SO4: when pipeline raises, capture_exception is called with context tags."""
        from fastapi.testclient import TestClient

        with patch("src.api.routes.sentry_sdk") as mock_sentry:
            mock_scope = MagicMock()
            mock_sentry.push_scope.return_value.__enter__ = MagicMock(return_value=mock_scope)
            mock_sentry.push_scope.return_value.__exit__ = MagicMock(return_value=False)

            with patch("src.api.routes.run_invoice_pipeline", side_effect=RuntimeError("boom")):
                from src.main import create_app
                app = create_app()
                test_client = TestClient(app, raise_server_exceptions=False)
                response = test_client.post(
                    "/invoices/inv-123/process",
                    json={"storage_key": "invoices/test.pdf", "client_id": "client-1"},
                )
                assert response.status_code == 500
                mock_sentry.capture_exception.assert_called_once()
                mock_scope.set_tag.assert_any_call("invoice_id", "inv-123")
                mock_scope.set_tag.assert_any_call("storage_key", "invoices/test.pdf")


class TestSentryPayloadScrubbing:
    """SO5: before_send strips sensitive keys from Sentry events."""

    def test_scrub_event_removes_raw_ocr_text(self) -> None:
        """SO5: raw_ocr_text is stripped from Sentry event data."""
        from src.main import _scrub_event
        event = {
            "extra": {
                "raw_ocr_text": "sensitive invoice text",
                "other_key": "keep this",
            }
        }
        result = _scrub_event(event, {})
        assert "raw_ocr_text" not in str(result)
        assert "keep this" in str(result)

    def test_scrub_event_removes_document_bytes(self) -> None:
        """SO5: document_bytes is stripped from Sentry event."""
        from src.main import _scrub_event
        event = {"extra": {"document_bytes": b"binary data", "invoice_id": "123"}}
        result = _scrub_event(event, {})
        assert "document_bytes" not in str(result)
        assert "invoice_id" in str(result)

    def test_scrub_event_removes_ocr_text(self) -> None:
        """SO5: ocr_text is stripped from Sentry event."""
        from src.main import _scrub_event
        event = {"breadcrumbs": {"values": [{"data": {"ocr_text": "secret"}}]}}
        result = _scrub_event(event, {})
        assert "ocr_text" not in str(result)

    def test_scrub_event_returns_event_unchanged_when_no_sensitive_keys(self) -> None:
        """SO5: event without sensitive keys passes through unchanged."""
        from src.main import _scrub_event
        event = {"message": "Invoice processed", "level": "info"}
        result = _scrub_event(event, {})
        assert result == event

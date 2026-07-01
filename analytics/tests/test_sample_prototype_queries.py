"""Tests for Sample Accounting prototype Supabase queries."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from analytics.db.sample_queries import (
    get_invoice_detail,
    get_invoices_by_status,
    get_invoices_summary,
    get_summary_stats,
    save_review,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_client() -> MagicMock:
    """Return a mock Supabase client."""
    return MagicMock()


def _make_response(data: list | dict | None) -> MagicMock:
    """Helper to create a mock Supabase response."""
    response = MagicMock()
    response.data = data
    return response


# ---------------------------------------------------------------------------
# get_invoices_summary
# ---------------------------------------------------------------------------

class TestGetInvoicesSummary:
    def test_returns_list_of_dicts(self, mock_client: MagicMock) -> None:
        expected = [
            {"id": "abc", "file_name": "fatura.pdf", "processing_status": "ok"},
        ]
        mock_client.table.return_value.select.return_value.order.return_value.execute.return_value = (
            _make_response(expected)
        )

        result = get_invoices_summary(mock_client)

        assert result == expected
        mock_client.table.assert_called_with("prototype_invoices")

    def test_returns_empty_list_when_no_data(self, mock_client: MagicMock) -> None:
        mock_client.table.return_value.select.return_value.order.return_value.execute.return_value = (
            _make_response(None)
        )

        result = get_invoices_summary(mock_client)

        assert result == []


# ---------------------------------------------------------------------------
# get_invoice_detail
# ---------------------------------------------------------------------------

class TestGetInvoiceDetail:
    def test_returns_dict_for_existing_invoice(self, mock_client: MagicMock) -> None:
        row = {"id": "abc-123", "invoice_number": "FT 2026/001", "issuer_nif": "123456789"}
        mock_client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = (
            _make_response([row])
        )

        result = get_invoice_detail(mock_client, "abc-123")

        assert result == row

    def test_returns_none_for_missing_invoice(self, mock_client: MagicMock) -> None:
        mock_client.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = (
            _make_response([])
        )

        result = get_invoice_detail(mock_client, "nonexistent")

        assert result is None


# ---------------------------------------------------------------------------
# get_invoices_by_status
# ---------------------------------------------------------------------------

class TestGetInvoicesByStatus:
    def test_filters_by_status(self, mock_client: MagicMock) -> None:
        expected = [{"id": "xyz", "processing_status": "requires_review"}]
        (
            mock_client.table.return_value
            .select.return_value
            .eq.return_value
            .order.return_value
            .execute.return_value
        ) = _make_response(expected)

        result = get_invoices_by_status(mock_client, "requires_review")

        assert result == expected
        mock_client.table.return_value.select.return_value.eq.assert_called_with(
            "processing_status", "requires_review"
        )

    def test_returns_empty_list_for_unknown_status(self, mock_client: MagicMock) -> None:
        (
            mock_client.table.return_value
            .select.return_value
            .eq.return_value
            .order.return_value
            .execute.return_value
        ) = _make_response(None)

        result = get_invoices_by_status(mock_client, "nonexistent_status")

        assert result == []


# ---------------------------------------------------------------------------
# save_review
# ---------------------------------------------------------------------------

class TestSaveReview:
    def test_returns_true_on_success(self, mock_client: MagicMock) -> None:
        mock_client.table.return_value.insert.return_value.execute.return_value = _make_response([])
        mock_client.table.return_value.update.return_value.eq.return_value.execute.return_value = (
            _make_response([])
        )

        result = save_review(mock_client, "inv-id", "approved", "looks good", "reviewer@example.com")

        assert result is True

    def test_returns_false_on_exception(self, mock_client: MagicMock) -> None:
        mock_client.table.return_value.insert.side_effect = Exception("DB error")

        result = save_review(mock_client, "inv-id", "approved", "", "reviewer@example.com")

        assert result is False

    def test_approved_maps_to_ok_status(self, mock_client: MagicMock) -> None:
        mock_client.table.return_value.insert.return_value.execute.return_value = _make_response([])
        update_mock = MagicMock()
        mock_client.table.return_value.update = update_mock
        update_mock.return_value.eq.return_value.execute.return_value = _make_response([])

        save_review(mock_client, "inv-id", "approved", "", "reviewer@example.com")

        update_mock.assert_called_with({"processing_status": "ok"})

    def test_rejected_maps_to_failed_status(self, mock_client: MagicMock) -> None:
        mock_client.table.return_value.insert.return_value.execute.return_value = _make_response([])
        update_mock = MagicMock()
        mock_client.table.return_value.update = update_mock
        update_mock.return_value.eq.return_value.execute.return_value = _make_response([])

        save_review(mock_client, "inv-id", "rejected", "wrong invoice", "reviewer@example.com")

        update_mock.assert_called_with({"processing_status": "failed"})


# ---------------------------------------------------------------------------
# get_summary_stats
# ---------------------------------------------------------------------------

class TestGetSummaryStats:
    def test_counts_by_status(self, mock_client: MagicMock) -> None:
        rows = [
            {"processing_status": "ok"},
            {"processing_status": "ok"},
            {"processing_status": "duplicado"},
            {"processing_status": "requires_review"},
            {"processing_status": "failed"},
        ]
        mock_client.table.return_value.select.return_value.execute.return_value = (
            _make_response(rows)
        )

        stats = get_summary_stats(mock_client)

        assert stats["total"] == 5
        assert stats["ok"] == 2
        assert stats["duplicado"] == 1
        assert stats["requires_review"] == 1
        assert stats["failed"] == 1

    def test_returns_zeros_when_empty(self, mock_client: MagicMock) -> None:
        mock_client.table.return_value.select.return_value.execute.return_value = (
            _make_response([])
        )

        stats = get_summary_stats(mock_client)

        assert stats["total"] == 0
        assert stats["ok"] == 0

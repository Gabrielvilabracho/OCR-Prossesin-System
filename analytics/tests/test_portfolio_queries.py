"""Tests for portfolio query helpers (T021).

All tests mock Supabase — no live connection required.
Uses TDD: tests written before implementation.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from analytics.db.portfolio_queries import (
    fetch_clients,
    fetch_portfolio_kpis,
    fetch_projects_by_client,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_response(data: list | None) -> MagicMock:
    """Create a mock Supabase response."""
    response = MagicMock()
    response.data = data
    return response


@pytest.fixture
def mock_client() -> MagicMock:
    """Bare mock Supabase client."""
    return MagicMock()


# ---------------------------------------------------------------------------
# fetch_clients
# ---------------------------------------------------------------------------


class TestFetchClients:
    def test_returns_list_of_client_dicts(self, mock_client: MagicMock) -> None:
        """Happy path: DB has two active clients."""
        rows = [
            {
                "id": "uuid-1",
                "slug": "sample-accounting",
                "name": "Sample Accounting",
                "status": "active",
                "owner": "gabi",
            },
            {
                "id": "uuid-2",
                "slug": "acme",
                "name": "ACME Corp",
                "status": "active",
                "owner": "gabi",
            },
        ]
        (
            mock_client.table.return_value.select.return_value.order.return_value.execute.return_value
        ) = _make_response(rows)

        result = fetch_clients(mock_client)

        assert len(result) == 2
        assert result[0]["slug"] == "sample-accounting"
        assert result[1]["slug"] == "acme"
        # Explicit column list — id must be present
        assert "id" in result[0]
        assert "name" in result[0]

    def test_returns_empty_list_when_no_clients(self, mock_client: MagicMock) -> None:
        """Empty state: table exists but has no rows."""
        (
            mock_client.table.return_value.select.return_value.order.return_value.execute.return_value
        ) = _make_response(None)

        result = fetch_clients(mock_client)

        assert result == []

    def test_queries_clients_table(self, mock_client: MagicMock) -> None:
        """Query targets the 'clients' table."""
        (
            mock_client.table.return_value.select.return_value.order.return_value.execute.return_value
        ) = _make_response([])

        fetch_clients(mock_client)

        mock_client.table.assert_called_with("clients")


# ---------------------------------------------------------------------------
# fetch_projects_by_client
# ---------------------------------------------------------------------------


class TestFetchProjectsByClient:
    def test_returns_projects_for_single_client(self, mock_client: MagicMock) -> None:
        """Happy path: client with two projects."""
        rows = [
            {
                "id": "proj-1",
                "client_id": "uuid-1",
                "name": "Invoice Automation",
                "current_phase": "F3",
                "status": "active",
                "kpi_baseline": {"hours_manual": 40},
                "kpi_target": {"hours_manual": 5},
                "owner": "gabi",
            },
            {
                "id": "proj-2",
                "client_id": "uuid-1",
                "name": "Email Triage",
                "current_phase": "F1",
                "status": "active",
                "kpi_baseline": None,
                "kpi_target": None,
                "owner": "gabi",
            },
        ]
        (
            mock_client.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value
        ) = _make_response(rows)

        result = fetch_projects_by_client(mock_client, "uuid-1")

        assert len(result) == 2
        assert result[0]["name"] == "Invoice Automation"
        assert result[0]["current_phase"] == "F3"

    def test_returns_empty_list_when_client_has_no_projects(
        self, mock_client: MagicMock
    ) -> None:
        """Client exists but has no projects yet."""
        (
            mock_client.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value
        ) = _make_response(None)

        result = fetch_projects_by_client(mock_client, "uuid-99")

        assert result == []

    def test_filters_by_client_id(self, mock_client: MagicMock) -> None:
        """Query applies eq filter on client_id."""
        (
            mock_client.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value
        ) = _make_response([])

        fetch_projects_by_client(mock_client, "uuid-42")

        mock_client.table.return_value.select.return_value.eq.assert_called_with(
            "client_id", "uuid-42"
        )

    def test_queries_projects_table(self, mock_client: MagicMock) -> None:
        """Query targets the 'projects' table."""
        (
            mock_client.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value
        ) = _make_response([])

        fetch_projects_by_client(mock_client, "uuid-1")

        mock_client.table.assert_called_with("projects")


# ---------------------------------------------------------------------------
# fetch_portfolio_kpis
# ---------------------------------------------------------------------------


class TestFetchPortfolioKpis:
    def test_returns_correct_aggregates_for_multiple_clients(
        self, mock_client: MagicMock
    ) -> None:
        """KPI aggregation: total_runs, completed, failed from agent_runs joined via project."""
        agent_runs_rows = [
            {"project_id": "proj-1", "status": "completed"},
            {"project_id": "proj-1", "status": "completed"},
            {"project_id": "proj-2", "status": "failed"},
            {"project_id": "proj-3", "status": "running"},
        ]
        (
            mock_client.table.return_value.select.return_value.execute.return_value
        ) = _make_response(agent_runs_rows)

        result = fetch_portfolio_kpis(mock_client)

        assert result["total_runs"] == 4
        assert result["completed"] == 2
        assert result["failed"] == 1

    def test_returns_zero_kpis_when_no_runs(self, mock_client: MagicMock) -> None:
        """Empty state: no agent runs at all."""
        (
            mock_client.table.return_value.select.return_value.execute.return_value
        ) = _make_response(None)

        result = fetch_portfolio_kpis(mock_client)

        assert result["total_runs"] == 0
        assert result["completed"] == 0
        assert result["failed"] == 0
        assert result["success_rate"] == 0.0

    def test_success_rate_calculation(self, mock_client: MagicMock) -> None:
        """success_rate = completed / total * 100, rounded to 1 decimal."""
        agent_runs_rows = [
            {"project_id": "proj-1", "status": "completed"},
            {"project_id": "proj-1", "status": "completed"},
            {"project_id": "proj-1", "status": "completed"},
            {"project_id": "proj-1", "status": "failed"},
        ]
        (
            mock_client.table.return_value.select.return_value.execute.return_value
        ) = _make_response(agent_runs_rows)

        result = fetch_portfolio_kpis(mock_client)

        assert result["success_rate"] == 75.0

    def test_queries_agent_runs_table(self, mock_client: MagicMock) -> None:
        """Query targets the 'agent_runs' table."""
        (
            mock_client.table.return_value.select.return_value.execute.return_value
        ) = _make_response([])

        fetch_portfolio_kpis(mock_client)

        mock_client.table.assert_called_with("agent_runs")

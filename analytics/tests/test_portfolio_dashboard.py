"""Tests for portfolio dashboard page (T024).

Tests rendering paths using mocked Streamlit calls and mocked query helpers.
No live Supabase connection required.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_kpis(
    total_runs: int = 0,
    completed: int = 0,
    failed: int = 0,
    success_rate: float = 0.0,
) -> dict:
    return {
        "total_runs": total_runs,
        "completed": completed,
        "failed": failed,
        "success_rate": success_rate,
    }


# ---------------------------------------------------------------------------
# build_client_summary  (pure function — unit testable without st.*)
# ---------------------------------------------------------------------------


class TestBuildClientSummary:
    """Test the pure data-transform helper that builds the summary table."""

    def test_merges_clients_and_projects(self) -> None:
        from analytics.dashboards.pages.portfolio import build_client_summary

        clients = [
            {"id": "c1", "slug": "sample-accounting", "name": "Sample Accounting", "status": "active"},
            {"id": "c2", "slug": "acme", "name": "ACME", "status": "active"},
        ]
        projects = [
            {
                "client_id": "c1",
                "name": "Invoice Automation",
                "current_phase": "F3",
                "status": "active",
            },
            {
                "client_id": "c1",
                "name": "Email Triage",
                "current_phase": "F1",
                "status": "active",
            },
            {
                "client_id": "c2",
                "name": "CRM Bot",
                "current_phase": "F0",
                "status": "active",
            },
        ]

        result = build_client_summary(clients, projects)

        assert len(result) == 2
        # Sample Accounting has 2 projects
        sample_row = next(r for r in result if r["slug"] == "sample-accounting")
        assert sample_row["project_count"] == 2
        # ACME has 1 project
        acme_row = next(r for r in result if r["slug"] == "acme")
        assert acme_row["project_count"] == 1

    def test_returns_empty_list_when_no_clients(self) -> None:
        from analytics.dashboards.pages.portfolio import build_client_summary

        result = build_client_summary([], [])

        assert result == []

    def test_client_with_no_projects_shows_zero(self) -> None:
        from analytics.dashboards.pages.portfolio import build_client_summary

        clients = [
            {"id": "c1", "slug": "orphan", "name": "Orphan Client", "status": "active"}
        ]
        projects: list = []

        result = build_client_summary(clients, projects)

        assert len(result) == 1
        assert result[0]["project_count"] == 0

    def test_includes_expected_columns(self) -> None:
        from analytics.dashboards.pages.portfolio import build_client_summary

        clients = [{"id": "c1", "slug": "sample-accounting", "name": "Sample Accounting", "status": "active"}]
        projects = [
            {
                "client_id": "c1",
                "name": "P1",
                "current_phase": "F2",
                "status": "active",
            },
        ]

        result = build_client_summary(clients, projects)

        row = result[0]
        assert "name" in row
        assert "slug" in row
        assert "status" in row
        assert "project_count" in row


# ---------------------------------------------------------------------------
# build_projects_dataframe  (pure function)
# ---------------------------------------------------------------------------


class TestBuildProjectsDataframe:
    def test_returns_dataframe_with_projects(self) -> None:
        from analytics.dashboards.pages.portfolio import build_projects_dataframe

        projects = [
            {
                "client_id": "c1",
                "name": "Invoice Automation",
                "current_phase": "F3",
                "status": "active",
                "owner": "gabi",
                "kpi_baseline": None,
                "kpi_target": None,
            },
            {
                "client_id": "c2",
                "name": "CRM Bot",
                "current_phase": "F0",
                "status": "active",
                "owner": "gabi",
                "kpi_baseline": None,
                "kpi_target": None,
            },
        ]

        df = build_projects_dataframe(projects)

        assert isinstance(df, pd.DataFrame)
        assert len(df) == 2
        assert "name" in df.columns
        assert "current_phase" in df.columns

    def test_returns_empty_dataframe_when_no_projects(self) -> None:
        from analytics.dashboards.pages.portfolio import build_projects_dataframe

        df = build_projects_dataframe([])

        assert isinstance(df, pd.DataFrame)
        assert df.empty

    def test_phase_breakdown_counts(self) -> None:
        from analytics.dashboards.pages.portfolio import count_phases

        projects = [
            {"current_phase": "F3"},
            {"current_phase": "F3"},
            {"current_phase": "F1"},
        ]

        counts = count_phases(projects)

        assert counts["F3"] == 2
        assert counts["F1"] == 1

    def test_phase_breakdown_empty(self) -> None:
        from analytics.dashboards.pages.portfolio import count_phases

        counts = count_phases([])

        assert counts == {}

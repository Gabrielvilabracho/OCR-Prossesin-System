"""Shared test fixtures for analytics tests."""

from __future__ import annotations

from unittest.mock import MagicMock

import pandas as pd
import pytest

from analytics.config import Settings


@pytest.fixture
def test_settings() -> Settings:
    """Settings instance with test values — no .env file needed."""
    return Settings(
        supabase_url="https://test-project.supabase.co",
        supabase_key="test-placeholder-value",
        supabase_project_id="test-project-id",
        debug=True,
    )


@pytest.fixture
def mock_supabase_client() -> MagicMock:
    """Mock Supabase client for unit tests.

    Usage:
        def test_something(mock_supabase_client):
            mock_supabase_client.table("metrics").select("*").execute.return_value = ...
    """
    client = MagicMock()
    # Chain-friendly mock: .table().select().execute() works
    select_chain = client.table.return_value.select.return_value
    select_chain.execute.return_value = MagicMock(data=[])
    insert_chain = client.table.return_value.insert.return_value
    insert_chain.execute.return_value = MagicMock(data=[])
    return client


@pytest.fixture
def sample_metrics_df() -> pd.DataFrame:
    """Sample metrics DataFrame for transform tests."""
    return pd.DataFrame({
        "created_at": pd.date_range("2026-01-01", periods=6, freq="ME"),
        "manual_minutes": [480, 460, 470, 450, 440, 430],
        "automated_minutes": [120, 110, 100, 95, 90, 85],
        "value": [100, 120, 110, 130, 140, 135],
    })


@pytest.fixture
def empty_df() -> pd.DataFrame:
    """Empty DataFrame with expected columns."""
    return pd.DataFrame(
        columns=["created_at", "manual_minutes", "automated_minutes", "value"]
    )

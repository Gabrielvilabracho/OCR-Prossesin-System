"""Tests for analytics.processing.transforms."""

from __future__ import annotations

import pandas as pd

from analytics.processing.transforms import (
    aggregate_metrics_by_period,
    calculate_hours_saved,
    compute_error_reduction,
)


class TestCalculateHoursSaved:
    """Tests for calculate_hours_saved."""

    def test_adds_hours_saved_column(self, sample_metrics_df: pd.DataFrame) -> None:
        result = calculate_hours_saved(sample_metrics_df)
        assert "hours_saved" in result.columns
        assert "savings_pct" in result.columns

    def test_hours_saved_calculation(self, sample_metrics_df: pd.DataFrame) -> None:
        result = calculate_hours_saved(sample_metrics_df)
        # First row: (480 - 120) / 60 = 6.0 hours
        assert result["hours_saved"].iloc[0] == 6.0

    def test_savings_percentage(self, sample_metrics_df: pd.DataFrame) -> None:
        result = calculate_hours_saved(sample_metrics_df)
        # First row: (480 - 120) / 480 * 100 = 75.0%
        assert result["savings_pct"].iloc[0] == 75.0

    def test_does_not_mutate_input(self, sample_metrics_df: pd.DataFrame) -> None:
        original_cols = list(sample_metrics_df.columns)
        calculate_hours_saved(sample_metrics_df)
        assert list(sample_metrics_df.columns) == original_cols

    def test_custom_column_names(self) -> None:
        df = pd.DataFrame({"time_before": [120], "time_after": [30]})
        result = calculate_hours_saved(
            df, manual_col="time_before", automated_col="time_after",
        )
        assert result["hours_saved"].iloc[0] == 1.5


class TestAggregateMetricsByPeriod:
    """Tests for aggregate_metrics_by_period."""

    def test_returns_sum_mean_count(self, sample_metrics_df: pd.DataFrame) -> None:
        result = aggregate_metrics_by_period(sample_metrics_df)
        assert set(result.columns) == {"sum", "mean", "count"}

    def test_monthly_aggregation(self, sample_metrics_df: pd.DataFrame) -> None:
        result = aggregate_metrics_by_period(sample_metrics_df, period="ME")
        # 6 months of data, each month has 1 row
        assert len(result) == 6

    def test_quarterly_aggregation(self, sample_metrics_df: pd.DataFrame) -> None:
        result = aggregate_metrics_by_period(sample_metrics_df, period="QE")
        # 6 months = 2 quarters
        assert len(result) == 2

    def test_count_is_integer(self, sample_metrics_df: pd.DataFrame) -> None:
        result = aggregate_metrics_by_period(sample_metrics_df)
        assert all(result["count"] >= 1)


class TestComputeErrorReduction:
    """Tests for compute_error_reduction."""

    def test_basic_reduction(self) -> None:
        result = compute_error_reduction(before_count=100, after_count=25)
        assert result["reduction_pct"] == 75.0
        assert result["absolute_change"] == 75.0

    def test_no_change(self) -> None:
        result = compute_error_reduction(before_count=50, after_count=50)
        assert result["reduction_pct"] == 0.0
        assert result["absolute_change"] == 0.0

    def test_increase_in_errors(self) -> None:
        result = compute_error_reduction(before_count=10, after_count=20)
        assert result["reduction_pct"] == -100.0
        assert result["absolute_change"] == -10.0

    def test_zero_before(self) -> None:
        result = compute_error_reduction(before_count=0, after_count=5)
        assert result["reduction_pct"] == 0.0
        assert result["absolute_change"] == -5.0

    def test_complete_elimination(self) -> None:
        result = compute_error_reduction(before_count=30, after_count=0)
        assert result["reduction_pct"] == 100.0
        assert result["absolute_change"] == 30.0

    def test_return_type(self) -> None:
        result = compute_error_reduction(before_count=10, after_count=3)
        assert isinstance(result, dict)
        assert all(isinstance(v, float) for v in result.values())

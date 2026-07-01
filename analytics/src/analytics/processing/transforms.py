"""Data transformation utilities for client metrics.

These functions operate on pandas DataFrames representing
client KPI data from Supabase tables.
"""

from __future__ import annotations

from typing import Literal

import pandas as pd


def calculate_hours_saved(
    df: pd.DataFrame,
    manual_col: str = "manual_minutes",
    automated_col: str = "automated_minutes",
) -> pd.DataFrame:
    """Calculate hours saved per row and add summary columns.

    Expects a DataFrame with columns for manual and automated time in minutes.
    Adds: `hours_saved` (per row) and `savings_pct` (percentage reduction).

    Args:
        df: Input DataFrame with time columns.
        manual_col: Column name for manual time in minutes.
        automated_col: Column name for automated time in minutes.

    Returns:
        DataFrame with added `hours_saved` and `savings_pct` columns.
    """
    result = df.copy()
    result["hours_saved"] = (result[manual_col] - result[automated_col]) / 60
    result["savings_pct"] = (
        (result[manual_col] - result[automated_col]) / result[manual_col] * 100
    ).round(1)
    return result


def aggregate_metrics_by_period(
    df: pd.DataFrame,
    date_col: str = "created_at",
    value_col: str = "value",
    period: Literal["W", "ME", "QE"] = "ME",
) -> pd.DataFrame:
    """Aggregate metric values by time period.

    Groups by the specified period and calculates sum, mean, and count.

    Args:
        df: Input DataFrame with a date column and a value column.
        date_col: Name of the datetime column.
        value_col: Name of the numeric value column.
        period: Pandas frequency alias — 'W' (week),
            'ME' (month-end), 'QE' (quarter-end).

    Returns:
        DataFrame indexed by period with `sum`, `mean`, and `count` columns.
    """
    result = df.copy()
    result[date_col] = pd.to_datetime(result[date_col])
    grouped = result.set_index(date_col).resample(period)[value_col]
    return pd.DataFrame({
        "sum": grouped.sum(),
        "mean": grouped.mean().round(2),
        "count": grouped.count(),
    })


def compute_error_reduction(
    before_count: int,
    after_count: int,
) -> dict[str, float]:
    """Compute error reduction percentage and absolute change.

    Used for before/after KPI comparisons.

    Args:
        before_count: Number of errors before automation.
        after_count: Number of errors after automation.

    Returns:
        Dict with `reduction_pct`, `absolute_change`, `before`, `after`.
    """
    if before_count == 0:
        return {
            "reduction_pct": 0.0,
            "absolute_change": float(-after_count),
            "before": 0.0,
            "after": float(after_count),
        }

    reduction_pct = round((before_count - after_count) / before_count * 100, 1)
    return {
        "reduction_pct": reduction_pct,
        "absolute_change": float(before_count - after_count),
        "before": float(before_count),
        "after": float(after_count),
    }

"""Supabase query functions for agent analytics.

All functions return DataFrames or dicts ready for Streamlit/Plotly.
Empty results return empty DataFrames — callers handle the empty state.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pandas as pd
from supabase import Client


def fetch_agent_runs(client: Client, limit: int = 200) -> pd.DataFrame:
    """Fetch recent agent runs ordered by start time.

    Returns columns: id, agent_id, status, token_usage,
    started_at, completed_at, created_at, error.
    """
    response = (
        client.table("agent_runs")
        .select("id,agent_id,status,token_usage,started_at,completed_at,created_at,error")
        .order("started_at", desc=True)
        .limit(limit)
        .execute()
    )
    if not response.data:
        return pd.DataFrame()

    df = pd.DataFrame(response.data)
    df["started_at"] = pd.to_datetime(df["started_at"], utc=True)
    df["completed_at"] = pd.to_datetime(df["completed_at"], utc=True)
    df["created_at"] = pd.to_datetime(df["created_at"], utc=True)
    df["total_tokens"] = df["token_usage"].apply(
        lambda x: x.get("totalTokens", 0) if isinstance(x, dict) else 0
    )
    df["duration_s"] = (
        (df["completed_at"] - df["started_at"]).dt.total_seconds().round(1)
    )
    return df


def fetch_runs_by_status(client: Client) -> pd.DataFrame:
    """Count agent runs grouped by status."""
    response = client.table("agent_runs").select("status").execute()
    if not response.data:
        return pd.DataFrame({"status": [], "count": []})

    df = pd.DataFrame(response.data)
    return (
        df["status"]
        .value_counts()
        .reset_index()
        .rename(columns={"index": "status", "count": "count", "status": "status"})
    )


def fetch_token_usage_by_day(client: Client, days: int = 30) -> pd.DataFrame:
    """Aggregate total token usage per day for the last N days."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    response = (
        client.table("agent_runs")
        .select("started_at,token_usage")
        .gte("started_at", cutoff)
        .execute()
    )
    if not response.data:
        return pd.DataFrame({"date": [], "total_tokens": []})

    df = pd.DataFrame(response.data)
    df["started_at"] = pd.to_datetime(df["started_at"], utc=True)
    df["total_tokens"] = df["token_usage"].apply(
        lambda x: x.get("totalTokens", 0) if isinstance(x, dict) else 0
    )
    df["date"] = df["started_at"].dt.date
    return df.groupby("date")["total_tokens"].sum().reset_index()


def fetch_pending_approvals(client: Client) -> pd.DataFrame:
    """Fetch all pending human-in-the-loop approvals."""
    response = (
        client.table("approvals")
        .select("id,agent_id,step_name,reason,created_at")
        .eq("status", "pending")
        .order("created_at", desc=True)
        .execute()
    )
    if not response.data:
        return pd.DataFrame()

    df = pd.DataFrame(response.data)
    df["created_at"] = pd.to_datetime(df["created_at"], utc=True)
    return df


def fetch_summary_stats(client: Client) -> dict[str, int | float]:
    """Compute high-level summary stats for the KPI header row."""
    runs_resp = client.table("agent_runs").select("status,token_usage").execute()
    approvals_resp = (
        client.table("approvals").select("status").eq("status", "pending").execute()
    )

    if not runs_resp.data:
        return {
            "total_runs": 0,
            "completed": 0,
            "failed": 0,
            "success_rate": 0.0,
            "total_tokens": 0,
            "pending_approvals": 0,
        }

    df = pd.DataFrame(runs_resp.data)
    total = len(df)
    completed = int((df["status"] == "completed").sum())
    failed = int((df["status"] == "failed").sum())
    total_tokens = int(
        df["token_usage"]
        .apply(lambda x: x.get("totalTokens", 0) if isinstance(x, dict) else 0)
        .sum()
    )
    success_rate = round(completed / total * 100, 1) if total > 0 else 0.0

    return {
        "total_runs": total,
        "completed": completed,
        "failed": failed,
        "success_rate": success_rate,
        "total_tokens": total_tokens,
        "pending_approvals": len(approvals_resp.data) if approvals_resp.data else 0,
    }

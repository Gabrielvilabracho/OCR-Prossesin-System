"""Portfolio query helpers for cross-client KPI views.

All queries use explicit column lists — no SELECT *.
All functions accept a Supabase Client parameter for testability.
Empty results return [] or zero-filled dicts — callers handle the empty state.
"""

from __future__ import annotations

from typing import Any

from supabase import Client


def fetch_clients(client: Client) -> list[dict[str, Any]]:
    """Return all clients ordered by name.

    Returns columns: id, slug, name, status, owner, created_at, updated_at.
    """
    response = (
        client.table("clients")
        .select("id,slug,name,status,owner,created_at,updated_at")
        .order("name")
        .execute()
    )
    return response.data or []


def fetch_projects_by_client(client: Client, client_id: str) -> list[dict[str, Any]]:
    """Return all projects for a given client_id ordered by name.

    Returns columns: id, client_id, name, current_phase, status,
    kpi_baseline, kpi_target, owner, created_at, updated_at.
    """
    response = (
        client.table("projects")
        .select(
            "id,client_id,name,current_phase,status,"
            "kpi_baseline,kpi_target,owner,created_at,updated_at"
        )
        .eq("client_id", client_id)
        .order("name")
        .execute()
    )
    return response.data or []


def fetch_portfolio_kpis(client: Client) -> dict[str, int | float]:
    """Aggregate KPIs from agent_runs across all projects.

    Counts total_runs, completed, failed, and computes success_rate.
    Returns columns: project_id, status (used for aggregation only).
    """
    response = client.table("agent_runs").select("project_id,status").execute()
    rows: list[dict[str, Any]] = response.data or []

    if not rows:
        return {
            "total_runs": 0,
            "completed": 0,
            "failed": 0,
            "success_rate": 0.0,
        }

    total = len(rows)
    completed = sum(1 for r in rows if r.get("status") == "completed")
    failed = sum(1 for r in rows if r.get("status") == "failed")
    success_rate = round(completed / total * 100, 1) if total > 0 else 0.0

    return {
        "total_runs": total,
        "completed": completed,
        "failed": failed,
        "success_rate": success_rate,
    }

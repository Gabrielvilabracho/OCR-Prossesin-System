"""Portfolio View — Cross-client KPI dashboard.

Shows KPI summary cards, phase breakdown, and a project-level table.
Run from analytics/: streamlit run src/analytics/dashboards/pages/portfolio.py

Pure helper functions (build_client_summary, build_projects_dataframe,
count_phases) are extracted for testability without Streamlit.
"""

from __future__ import annotations

from collections import Counter
from typing import Any

import pandas as pd
import streamlit as st

from analytics.db.client import create_supabase_client
from analytics.db.portfolio_queries import (
    fetch_clients,
    fetch_portfolio_kpis,
    fetch_projects_by_client,
)

# ---------------------------------------------------------------------------
# Pure helper functions — no Streamlit, fully testable
# ---------------------------------------------------------------------------


def build_client_summary(
    clients: list[dict[str, Any]],
    projects: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Merge clients with their project counts.

    Returns a list of dicts with: id, slug, name, status, project_count.
    """
    if not clients:
        return []

    # Group projects by client_id
    count_by_client: Counter[str] = Counter(
        p["client_id"] for p in projects if "client_id" in p
    )

    return [
        {
            "id": c.get("id", ""),
            "slug": c.get("slug", ""),
            "name": c.get("name", ""),
            "status": c.get("status", ""),
            "project_count": count_by_client.get(c.get("id", ""), 0),
        }
        for c in clients
    ]


def build_projects_dataframe(projects: list[dict[str, Any]]) -> pd.DataFrame:
    """Convert a list of project dicts into a display DataFrame.

    Selects and renames columns relevant for the portfolio table.
    Returns an empty DataFrame if projects is empty.
    """
    if not projects:
        return pd.DataFrame(
            columns=["name", "current_phase", "status", "owner", "client_id"]
        )

    df = pd.DataFrame(projects)
    keep = [
        c
        for c in ["name", "current_phase", "status", "owner", "client_id"]
        if c in df.columns
    ]
    return df[keep].copy()


def count_phases(projects: list[dict[str, Any]]) -> dict[str, int]:
    """Count projects per phase.

    Returns a dict mapping phase (e.g. 'F3') to count.
    Returns an empty dict for empty input.
    """
    if not projects:
        return {}
    counter: Counter[str] = Counter(
        p["current_phase"] for p in projects if "current_phase" in p
    )
    return dict(counter)


# ---------------------------------------------------------------------------
# Streamlit page (runs when executed directly or via multipage app)
# ---------------------------------------------------------------------------


def render_portfolio_page() -> None:
    """Render the full portfolio Streamlit page."""
    st.title("Portfolio — Resumen por Cliente")
    st.caption("Vista consolidada de todos los clientes y proyectos activos.")
    st.markdown("---")

    # --- Supabase client ---
    @st.cache_resource
    def get_client():  # type: ignore[return]
        return create_supabase_client()

    supabase = get_client()

    # --- Load data with TTL ---
    @st.cache_data(ttl=60)
    def load_kpis() -> dict:  # type: ignore[type-arg]
        return fetch_portfolio_kpis(supabase)

    @st.cache_data(ttl=60)
    def load_clients() -> list:  # type: ignore[type-arg]
        return fetch_clients(supabase)

    kpis = load_kpis()
    clients = load_clients()

    # --- KPI cards row ---
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total Runs", kpis["total_runs"])
    col2.metric("Completados", kpis["completed"])
    col3.metric("Fallidos", kpis["failed"])
    col4.metric("Success Rate", f"{kpis['success_rate']}%")

    st.markdown("---")

    # --- Empty state ---
    if not clients:
        st.info(
            "No hay clientes registrados aún. "
            "Agregá clientes a la tabla 'clients' en Supabase para comenzar."
        )
        return

    # --- Load all projects for all clients ---
    all_projects: list[dict[str, Any]] = []
    for c in clients:
        all_projects.extend(fetch_projects_by_client(supabase, c["id"]))

    # --- Phase breakdown ---
    st.subheader("Proyectos por Fase")
    phase_counts = count_phases(all_projects)
    if phase_counts:
        phase_df = pd.DataFrame(
            [
                {"Fase": phase, "Proyectos": count}
                for phase, count in sorted(phase_counts.items())
            ]
        )
        st.bar_chart(phase_df.set_index("Fase"))
    else:
        st.info("No hay proyectos registrados aún.")

    st.markdown("---")

    # --- Client summary table ---
    st.subheader("Clientes")
    summary = build_client_summary(clients, all_projects)
    if summary:
        summary_df = pd.DataFrame(summary)
        display_cols = {
            "name": "Cliente",
            "slug": "Slug",
            "status": "Estado",
            "project_count": "Proyectos",
        }
        available = [c for c in display_cols if c in summary_df.columns]
        st.dataframe(
            summary_df[available].rename(columns=display_cols),
            use_container_width=True,
        )

    st.markdown("---")

    # --- Project-level table ---
    st.subheader("Todos los Proyectos")
    if all_projects:
        projects_df = build_projects_dataframe(all_projects)
        col_rename = {
            "name": "Proyecto",
            "current_phase": "Fase",
            "status": "Estado",
            "owner": "Owner",
        }
        available_cols = [c for c in col_rename if c in projects_df.columns]
        st.dataframe(
            projects_df[available_cols].rename(columns=col_rename),
            use_container_width=True,
        )
    else:
        st.info("No hay proyectos aún.")

    # --- Refresh ---
    st.markdown("---")
    if st.button("Actualizar datos"):
        st.cache_data.clear()
        st.rerun()


# ---------------------------------------------------------------------------
# Entry point when run directly (standalone page)
# ---------------------------------------------------------------------------

if __name__ == "__main__" or "streamlit" in __name__:
    st.set_page_config(
        page_title="Portfolio — Agencia AI",
        layout="wide",
        initial_sidebar_state="collapsed",
    )
    render_portfolio_page()

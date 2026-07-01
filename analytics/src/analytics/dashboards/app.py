"""Agencia AI — Agent Analytics Dashboard.

Conectado a Supabase en tiempo real.
Run with: streamlit run src/analytics/dashboards/app.py
"""

from __future__ import annotations

import pandas as pd
import plotly.express as px
import streamlit as st

from analytics.dashboards.pages.sample_review_queue import render_review_queue_page
from analytics.dashboards.pages.portfolio import render_portfolio_page
from analytics.db.client import create_supabase_client
from analytics.db.queries import (
    fetch_agent_runs,
    fetch_pending_approvals,
    fetch_runs_by_status,
    fetch_summary_stats,
    fetch_token_usage_by_day,
)

st.set_page_config(
    page_title="Agencia AI — Analytics",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ---------------------------------------------------------------------------
# Navigation
# ---------------------------------------------------------------------------

PAGES = {
    "Agent Analytics": "agent_analytics",
    "Portfolio": "portfolio",
    "Sample Accounting — Review Queue": "sample_review_queue",
}

with st.sidebar:
    st.title("Agencia AI")
    selected_page = st.radio("Navegación", list(PAGES.keys()), index=0)

# ---------------------------------------------------------------------------
# Portfolio page
# ---------------------------------------------------------------------------

if selected_page == "Portfolio":
    render_portfolio_page()
    st.stop()

if selected_page == "Sample Accounting — Review Queue":
    render_review_queue_page()
    st.stop()

# ---------------------------------------------------------------------------
# Agent Analytics page (original dashboard — unchanged)
# ---------------------------------------------------------------------------

st.title("Agencia AI — Agent Analytics")
st.markdown("---")


# --- Conexión ---
@st.cache_resource
def get_client():  # type: ignore[return]
    return create_supabase_client()


client = get_client()


# --- Datos con TTL de 60s para no saturar Supabase ---
@st.cache_data(ttl=60)
def load_stats() -> dict:  # type: ignore[type-arg]
    return fetch_summary_stats(client)


@st.cache_data(ttl=60)
def load_runs() -> pd.DataFrame:
    return fetch_agent_runs(client)


@st.cache_data(ttl=60)
def load_status_counts() -> pd.DataFrame:
    return fetch_runs_by_status(client)


@st.cache_data(ttl=60)
def load_token_trend() -> pd.DataFrame:
    return fetch_token_usage_by_day(client, days=30)


@st.cache_data(ttl=60)
def load_approvals() -> pd.DataFrame:
    return fetch_pending_approvals(client)


stats = load_stats()
runs_df = load_runs()
status_df = load_status_counts()
token_df = load_token_trend()
approvals_df = load_approvals()

# --- KPI Header ---
col1, col2, col3, col4, col5 = st.columns(5)
col1.metric("Total Runs", stats["total_runs"])
col2.metric("Completed", stats["completed"])
col3.metric("Failed", stats["failed"])
col4.metric("Success Rate", f"{stats['success_rate']}%")
col5.metric("Total Tokens", f"{stats['total_tokens']:,}")

if stats["pending_approvals"] > 0:
    st.warning(f"{stats['pending_approvals']} approval(s) pending human review.")

st.markdown("---")

# --- Sin datos aún ---
if runs_df.empty:
    st.info(
        "No agent runs yet. Once your Trigger.dev tasks start executing, "
        "the data will appear here automatically."
    )
    st.stop()

# --- Charts row 1 ---
col_left, col_right = st.columns(2)

with col_left:
    st.subheader("Runs by Status")
    if not status_df.empty:
        fig_status = px.pie(
            status_df,
            names="status",
            values="count",
            color="status",
            color_discrete_map={
                "completed": "#22c55e",
                "failed": "#ef4444",
                "running": "#3b82f6",
                "awaiting_approval": "#f59e0b",
            },
        )
        fig_status.update_traces(textinfo="percent+label")
        st.plotly_chart(fig_status, use_container_width=True)

with col_right:
    st.subheader("Token Usage — Last 30 Days")
    if not token_df.empty:
        fig_tokens = px.bar(
            token_df,
            x="date",
            y="total_tokens",
            labels={"date": "Date", "total_tokens": "Total Tokens"},
        )
        st.plotly_chart(fig_tokens, use_container_width=True)
    else:
        st.info("No token data for the last 30 days.")

st.markdown("---")

# --- Recent Runs Table ---
st.subheader("Recent Agent Runs")
display_cols = [
    "agent_id",
    "status",
    "total_tokens",
    "duration_s",
    "started_at",
    "error",
]
available = [c for c in display_cols if c in runs_df.columns]
st.dataframe(
    runs_df[available].head(50),
    use_container_width=True,
    column_config={
        "agent_id": "Agent",
        "status": "Status",
        "total_tokens": st.column_config.NumberColumn("Tokens", format="%d"),
        "duration_s": st.column_config.NumberColumn("Duration (s)", format="%.1f"),
        "started_at": st.column_config.DatetimeColumn(
            "Started", format="DD/MM/YY HH:mm"
        ),
        "error": "Error",
    },
)

# --- Pending Approvals ---
if not approvals_df.empty:
    st.markdown("---")
    st.subheader("Pending Approvals")
    st.dataframe(approvals_df, use_container_width=True)

# --- Refresh ---
st.markdown("---")
if st.button("Refresh data"):
    st.cache_data.clear()
    st.rerun()

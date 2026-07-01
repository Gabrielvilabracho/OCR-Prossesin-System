"""Sample Accounting — Human Review Queue.

Muestra todas las facturas pendientes de revisión y permite aprobar/rechazar.
Run from analytics/: streamlit run src/analytics/dashboards/app.py → navegar a "Cola de Revisión"
"""

from __future__ import annotations

import pandas as pd
import streamlit as st

from analytics.db.client import create_supabase_client
from analytics.db.sample_review_queries import (
    get_pending_review_queue,
    get_review_queue_stats,
    group_queue_by_invoice,
    resolve_invoice,
)

# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------

REASON_LABELS: dict[str, str] = {
    "first_time_supplier": "Proveedor nuevo",
    "low_confidence": "Confianza baja",
    "math_mismatch": "Error matematico",
    "vat_invalid": "IVA invalido",
    "supplier_unresolved": "Proveedor no resuelto",
    "amount_above_threshold": "Monto elevado",
}

REASON_COLORS: dict[str, str] = {
    "first_time_supplier": "blue",
    "low_confidence": "orange",
    "math_mismatch": "red",
    "vat_invalid": "red",
    "supplier_unresolved": "orange",
    "amount_above_threshold": "orange",
}


def _reason_badge(code: str) -> str:
    label = REASON_LABELS.get(code, code)
    return f"**{label}**"


# ---------------------------------------------------------------------------
# Client
# ---------------------------------------------------------------------------


@st.cache_resource
def _get_client():  # type: ignore[return]
    return create_supabase_client()


# ---------------------------------------------------------------------------
# Render
# ---------------------------------------------------------------------------


def render_review_queue_page() -> None:
    st.title("Sample Accounting — Review Queue")
    st.caption("Facturas que requieren aprobacion humana antes de ser contabilizadas.")
    st.markdown("---")

    client = _get_client()

    # --- Stats ---
    @st.cache_data(ttl=15)
    def load_stats() -> dict:  # type: ignore[type-arg]
        return get_review_queue_stats(client)

    @st.cache_data(ttl=15)
    def load_queue() -> list:  # type: ignore[type-arg]
        return get_pending_review_queue(client)

    stats = load_stats()
    queue_items = load_queue()
    grouped = group_queue_by_invoice(queue_items)

    # KPI row
    col1, col2, col3, col4, col5 = st.columns(5)
    col1.metric("Pendientes", stats["total_pending"])
    col2.metric("Resueltas", stats["total_resolved"])

    by_reason = stats.get("by_reason", {})
    col3.metric("Proveedor nuevo", by_reason.get("first_time_supplier", 0))
    col4.metric("Confianza baja", by_reason.get("low_confidence", 0))
    col5.metric("Otros", sum(v for k, v in by_reason.items() if k not in ("first_time_supplier", "low_confidence")))

    if stats["total_pending"] == 0:
        st.success("No hay facturas pendientes de revision. Todo al dia.")
        if st.button("Actualizar"):
            st.cache_data.clear()
            st.rerun()
        return

    st.markdown(f"**{len(grouped)} factura(s) pendientes** de revision.")
    st.markdown("---")

    # --- Reviewer name (persistent via session state) ---
    if "reviewer_name" not in st.session_state:
        st.session_state.reviewer_name = ""

    with st.sidebar:
        st.markdown("### Configuracion")
        reviewer = st.text_input(
            "Tu nombre (revisado por)",
            value=st.session_state.reviewer_name,
            key="reviewer_input",
        )
        st.session_state.reviewer_name = reviewer
        if not reviewer:
            st.warning("Ingresa tu nombre para poder revisar facturas.")

    # --- Invoice cards ---
    for entry in grouped:
        invoice = entry["invoice"]
        invoice_id = entry["invoice_id"]
        queue_ids = entry["queue_ids"]
        reason_codes = entry["reason_codes"]

        file_name = invoice.get("file_name") or "Sin nombre"
        issuer = invoice.get("issuer_name") or "Desconocido"
        inv_number = invoice.get("invoice_number") or "—"
        issue_date = invoice.get("issue_date") or "—"
        total = invoice.get("total_with_vat")
        confidence = invoice.get("llm_confidence") or 0.0
        total_str = f"€{float(total):.2f}" if total is not None else "—"
        conf_str = f"{float(confidence):.0%}"

        ocr_doc = invoice.get("ocr_documents") or {}
        mime_type = ocr_doc.get("mime_type") if isinstance(ocr_doc, dict) else "application/pdf"
        file_icon = "PDF" if mime_type == "application/pdf" else "IMG"

        reasons_str = " | ".join(REASON_LABELS.get(r, r) for r in reason_codes)

        expander_label = f"[{file_icon}] {file_name} — {issuer} — {total_str} — [{reasons_str}]"

        with st.expander(expander_label, expanded=False):
            col_left, col_right = st.columns([2, 1])

            with col_left:
                st.markdown("**Datos de la factura**")
                rows_data = [
                    ("Archivo", file_name),
                    ("Emisor", issuer),
                    ("NIF Emisor", invoice.get("issuer_nif") or "—"),
                    ("Numero de factura", inv_number),
                    ("Fecha emision", issue_date),
                    ("Total c/IVA", total_str),
                    ("Total s/IVA", f"€{float(invoice['total_without_vat']):.2f}" if invoice.get("total_without_vat") else "—"),
                    ("IVA", f"€{float(invoice['vat_total']):.2f}" if invoice.get("vat_total") else "—"),
                ]
                for label, val in rows_data:
                    st.text(f"{label}: {val}")

            with col_right:
                st.markdown("**Motivos de revision**")
                for code in reason_codes:
                    label = REASON_LABELS.get(code, code)
                    if code in ("math_mismatch", "vat_invalid"):
                        st.error(label)
                    elif code in ("low_confidence", "supplier_unresolved", "amount_above_threshold"):
                        st.warning(label)
                    else:
                        st.info(label)

                st.markdown("**Confianza AI**")
                if float(confidence) >= 0.85:
                    st.success(conf_str)
                elif float(confidence) >= 0.5:
                    st.warning(conf_str)
                else:
                    st.error(conf_str)

            # Review form
            st.markdown("---")
            if not st.session_state.reviewer_name:
                st.warning("Ingresa tu nombre en el panel lateral para habilitar la revision.")
            else:
                with st.form(key=f"form_{invoice_id}"):
                    st.markdown("**Decision**")
                    decision = st.radio(
                        "Accion",
                        ["approved", "rejected"],
                        format_func=lambda d: "Aprobar" if d == "approved" else "Rechazar",
                        horizontal=True,
                        label_visibility="collapsed",
                    )
                    reason = st.text_area(
                        "Comentario / motivo (opcional)",
                        placeholder="Ej: Proveedor verificado manualmente — OK para contabilizar",
                        height=80,
                    )
                    submitted = st.form_submit_button(
                        "Guardar decision",
                        type="primary" if decision == "approved" else "secondary",
                    )

                    if submitted:
                        ok = resolve_invoice(
                            client,
                            invoice_id,
                            queue_ids,
                            decision,
                            reason,
                            st.session_state.reviewer_name,
                        )
                        if ok:
                            action_label = "aprobada" if decision == "approved" else "rechazada"
                            st.success(f"Factura {action_label} correctamente.")
                            st.cache_data.clear()
                            st.rerun()
                        else:
                            st.error("Error al guardar. Verifica la conexion a Supabase.")

    # --- Summary table ---
    st.markdown("---")
    st.subheader("Resumen del queue")

    if grouped:
        summary_rows = []
        for entry in grouped:
            inv = entry["invoice"]
            summary_rows.append({
                "Archivo": inv.get("file_name") or "—",
                "Emisor": inv.get("issuer_name") or "—",
                "N. Factura": inv.get("invoice_number") or "—",
                "Total": inv.get("total_with_vat"),
                "Confianza": inv.get("llm_confidence"),
                "Motivos": " | ".join(REASON_LABELS.get(r, r) for r in entry["reason_codes"]),
            })
        df = pd.DataFrame(summary_rows)
        st.dataframe(
            df,
            use_container_width=True,
            column_config={
                "Total": st.column_config.NumberColumn("Total c/IVA", format="€%.2f"),
                "Confianza": st.column_config.ProgressColumn(
                    "Confianza AI", min_value=0, max_value=1, format="%.0%%"
                ),
            },
        )

    st.markdown("---")
    if st.button("Actualizar datos"):
        st.cache_data.clear()
        st.rerun()

"""Sample Accounting — Prototipo de Automatización de Facturas.

Demo dashboard para mostrar al cliente el pipeline de procesamiento de facturas.
Run from analytics/: streamlit run src/analytics/dashboards/pages/sample_prototype.py
"""

from __future__ import annotations

import json

import pandas as pd
import streamlit as st

from analytics.db.client import create_supabase_client
from analytics.db.sample_queries import (
    get_invoice_detail,
    get_invoices_by_status,
    get_invoices_summary,
    get_summary_stats,
    save_review,
)

st.set_page_config(
    page_title="Sample Accounting — Invoice Prototype",
    page_icon="📄",
    layout="wide",
)

st.title("Sample Accounting — Prototipo de Facturas")
st.caption("Pipeline automatizado con AI: extracción · validación eFactura · detección de duplicados")
st.markdown("---")

# ---------------------------------------------------------------------------
# Supabase client
# ---------------------------------------------------------------------------

@st.cache_resource
def get_client():  # type: ignore[return]
    return create_supabase_client()


client = get_client()

# ---------------------------------------------------------------------------
# Load data
# ---------------------------------------------------------------------------

@st.cache_data(ttl=30)
def load_stats() -> dict[str, int]:  # type: ignore[type-arg]
    return get_summary_stats(client)


@st.cache_data(ttl=30)
def load_invoices(status_filter: str) -> list[dict]:  # type: ignore[type-arg]
    if status_filter == "Todos":
        return get_invoices_summary(client)
    status_map = {
        "OK": "ok",
        "Duplicado": "duplicado",
        "Revisión requerida": "requires_review",
        "Fallido": "failed",
    }
    return get_invoices_by_status(client, status_map[status_filter])


stats = load_stats()

# ---------------------------------------------------------------------------
# Métricas
# ---------------------------------------------------------------------------

col1, col2, col3, col4, col5 = st.columns(5)
col1.metric("Total procesadas", stats["total"])
col2.metric("✓ OK", stats["ok"])
col3.metric("⟳ Duplicadas", stats["duplicado"])
col4.metric("⚠ Revisión", stats["requires_review"])
col5.metric("✗ Fallidas", stats["failed"])

st.markdown("---")

# ---------------------------------------------------------------------------
# Filtro y tabla
# ---------------------------------------------------------------------------

status_options = ["Todos", "OK", "Duplicado", "Revisión requerida", "Fallido"]
selected_status = st.selectbox("Filtrar por estado", status_options)

invoices = load_invoices(selected_status)

if not invoices:
    st.info("No hay facturas procesadas aún. Ejecuta el pipeline de Trigger.dev para comenzar.")
    st.stop()

df = pd.DataFrame(invoices)

STATUS_ICONS = {
    "ok": "✓ OK",
    "duplicado": "⟳ Duplicado",
    "requires_review": "⚠ Revisión",
    "failed": "✗ Fallido",
    "processing": "⏳ Procesando",
}

if "processing_status" in df.columns:
    df["Estado"] = df["processing_status"].map(lambda s: STATUS_ICONS.get(s, s))

DISPLAY_COLS = {
    "file_name": "Archivo",
    "source_type": "Fuente",
    "invoice_number": "Nº Factura",
    "issuer_name": "Emisor",
    "issue_date": "Fecha",
    "total_with_vat": "Total c/IVA",
    "llm_confidence": "Confianza AI",
    "Estado": "Estado",
}

available = [c for c in DISPLAY_COLS if c in df.columns]
display_df = df[available].rename(columns=DISPLAY_COLS)

st.dataframe(
    display_df,
    use_container_width=True,
    column_config={
        "Total c/IVA": st.column_config.NumberColumn("Total c/IVA", format="€%.2f"),
        "Confianza AI": st.column_config.ProgressColumn(
            "Confianza AI", min_value=0, max_value=1, format="%.0%%"
        ),
        "Fecha": st.column_config.DateColumn("Fecha", format="DD/MM/YYYY"),
    },
)

st.markdown("---")

# ---------------------------------------------------------------------------
# Detalle de factura seleccionada
# ---------------------------------------------------------------------------

st.subheader("Detalle de factura")

invoice_options = {
    f"{r.get('file_name', 'Sin nombre')} — {STATUS_ICONS.get(r.get('processing_status',''), '')}": r["id"]
    for r in invoices
}

selected_label = st.selectbox("Seleccionar factura", list(invoice_options.keys()))
selected_id = invoice_options[selected_label]

detail = get_invoice_detail(client, selected_id)

if detail:
    col_a, col_b = st.columns(2)

    with col_a:
        st.markdown("**Campos extraídos**")
        fields_display = {
            "Nº Factura": detail.get("invoice_number"),
            "NIF Emisor": detail.get("issuer_nif"),
            "NIF Receptor": detail.get("receiver_nif"),
            "Nombre Emisor": detail.get("issuer_name"),
            "Fecha Emisión": detail.get("issue_date"),
            "Total c/IVA": f"€{detail.get('total_with_vat', 0):.2f}" if detail.get("total_with_vat") else None,
            "Total s/IVA": f"€{detail.get('total_without_vat', 0):.2f}" if detail.get("total_without_vat") else None,
            "Total IVA": f"€{detail.get('vat_total', 0):.2f}" if detail.get("vat_total") else None,
        }
        for label, value in fields_display.items():
            st.text(f"{label}: {value or '—'}")

        # Confidence con color
        conf = detail.get("llm_confidence") or 0
        if conf >= 0.85:
            st.success(f"Confianza AI: {conf:.0%}")
        elif conf >= 0.5:
            st.warning(f"Confianza AI: {conf:.0%}")
        else:
            st.error(f"Confianza AI: {conf:.0%}")

    with col_b:
        st.markdown("**Resultado eFactura (mock sandbox)**")
        efactura = detail.get("efactura_mock_result")
        if efactura:
            status = efactura.get("status", "")
            if status == "matched":
                st.success(f"Estado: {status.upper()}")
            elif status == "mismatch":
                st.warning(f"Estado: {status.upper()}")
            else:
                st.error(f"Estado: {status.upper()}")

            st.json({
                "check_id": efactura.get("check_id"),
                "provider": efactura.get("provider"),
                "matched_fields": efactura.get("matched_fields", []),
                "mismatch_reasons": efactura.get("mismatch_reasons", []),
                "next_step": efactura.get("next_step"),
                "checked_at": efactura.get("checked_at"),
            })

    # -------------------------------------------------------------------------
    # Human-in-the-loop — solo si requires_review
    # -------------------------------------------------------------------------

    if detail.get("processing_status") == "requires_review":
        st.markdown("---")
        st.subheader("Revisión humana requerida")

        if detail.get("review_reason"):
            st.warning(f"Motivo: {detail['review_reason']}")

        with st.form(f"review_form_{selected_id}"):
            decision = st.selectbox(
                "Decisión",
                ["approved", "rejected", "edited"],
                format_func=lambda d: {"approved": "✓ Aprobar", "rejected": "✗ Rechazar", "edited": "✎ Editar y aprobar"}[d],
            )
            reason = st.text_input("Motivo / comentario")
            reviewed_by = st.text_input("Revisado por")

            submitted = st.form_submit_button("Guardar revisión")

            if submitted:
                if not reviewed_by:
                    st.error("El campo 'Revisado por' es obligatorio.")
                else:
                    ok = save_review(client, selected_id, decision, reason, reviewed_by)
                    if ok:
                        st.success("Revisión guardada correctamente.")
                        st.cache_data.clear()
                        st.rerun()
                    else:
                        st.error("Error al guardar la revisión. Verifica la conexión a Supabase.")

# ---------------------------------------------------------------------------
# Refresh
# ---------------------------------------------------------------------------

st.markdown("---")
if st.button("Actualizar datos"):
    st.cache_data.clear()
    st.rerun()

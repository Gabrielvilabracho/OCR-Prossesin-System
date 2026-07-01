from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from ..models.document import DocumentFormat
from .nodes.extract import extract_node
from .nodes.fetch_document import fetch_document_node
from .nodes.ocr import ocr_node
from .nodes.parse_xml import parse_xml_node
from .nodes.persist import persist_node
from .nodes.validate import validate_node
from .state import InvoiceState


def route_after_fetch(state: InvoiceState) -> str:
    """Route to parse_xml for XML documents, ocr for PDF and image."""
    if state.get("errors"):
        # Errors accumulated in fetch_document — short-circuit to extract
        # (extract will handle empty raw_ocr_text gracefully)
        return "extract"
    if state.get("document_format") == DocumentFormat.XML:
        return "parse_xml"
    return "ocr"


def build_invoice_graph() -> CompiledStateGraph[InvoiceState, None, InvoiceState, InvoiceState]:
    """Build and compile the invoice processing graph.

    Called ONCE at application startup. The compiled graph is reused
    for every invocation — never rebuild per request.

    Graph topology (post sample-multiformat):
      fetch_document → (conditional) → parse_xml ──┐
                                    → ocr          ──┤
                                                     ▼
                                                  extract → validate → persist
    """
    graph = StateGraph(InvoiceState)

    # Register nodes
    graph.add_node("fetch_document", fetch_document_node)
    graph.add_node("parse_xml", parse_xml_node)
    graph.add_node("ocr", ocr_node)
    graph.add_node("extract", extract_node)
    graph.add_node("validate", validate_node)
    graph.add_node("persist", persist_node)

    # Entry point
    graph.add_edge(START, "fetch_document")

    # Conditional routing after fetch
    graph.add_conditional_edges(
        "fetch_document",
        route_after_fetch,
        {"parse_xml": "parse_xml", "ocr": "ocr", "extract": "extract"},
    )

    # Both parse_xml and ocr converge at extract
    graph.add_edge("parse_xml", "extract")
    graph.add_edge("ocr", "extract")

    # Linear tail
    graph.add_edge("extract", "validate")
    graph.add_edge("validate", "persist")
    graph.add_edge("persist", END)

    return graph.compile()

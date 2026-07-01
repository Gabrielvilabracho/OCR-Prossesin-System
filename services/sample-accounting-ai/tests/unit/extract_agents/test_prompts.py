"""T2 RED — Prompt constants existence and structural shape check."""

from src.graph.nodes.extract_agents.prompts import (
    HEADER_SYSTEM,
    LINEAS_SYSTEM,
    TOTALES_SYSTEM,
    USER_TEMPLATE,
)


class TestPrompts:
    """Prompt constants must exist and be non-empty strings."""

    def test_header_system_is_non_empty_string(self):
        assert isinstance(HEADER_SYSTEM, str)
        assert len(HEADER_SYSTEM) > 50

    def test_lineas_system_is_non_empty_string(self):
        assert isinstance(LINEAS_SYSTEM, str)
        assert len(LINEAS_SYSTEM) > 50

    def test_totales_system_is_non_empty_string(self):
        assert isinstance(TOTALES_SYSTEM, str)
        assert len(TOTALES_SYSTEM) > 50

    def test_user_template_accepts_ocr_text(self):
        """USER_TEMPLATE must be formattable with ocr_text keyword."""
        rendered = USER_TEMPLATE.format(ocr_text="test invoice content")
        assert "test invoice content" in rendered

    def test_all_prompts_are_different(self):
        """Each sub-agent must have a distinct system prompt."""
        prompts = [HEADER_SYSTEM, LINEAS_SYSTEM, TOTALES_SYSTEM]
        assert len(set(prompts)) == 3, "All system prompts must be unique"

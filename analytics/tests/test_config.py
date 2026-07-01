"""Tests for analytics.config."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from analytics.config import Settings, get_settings


class IsolatedSettings(Settings):
    """Settings subclass that never reads from .env file — for testing only."""

    model_config = Settings.model_config.copy()

    def __init__(self, **data: object) -> None:
        # Override env_file to None so .env is not loaded during tests
        object.__setattr__(self, "__pydantic_fields_set__", set())
        super().__init__(_env_file=None, **data)  # type: ignore[call-arg]


class TestSettings:
    """Tests for Settings validation."""

    def test_missing_supabase_url_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("SUPABASE_URL", raising=False)
        monkeypatch.delenv("SUPABASE_KEY", raising=False)
        with pytest.raises(ValidationError):
            Settings(_env_file=None, supabase_key="some-key")  # type: ignore[call-arg]

    def test_missing_supabase_key_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("SUPABASE_URL", raising=False)
        monkeypatch.delenv("SUPABASE_KEY", raising=False)
        with pytest.raises(ValidationError):
            Settings(_env_file=None, supabase_url="https://project.supabase.co")  # type: ignore[call-arg]

    def test_reads_values_correctly(self) -> None:
        settings = Settings(
            _env_file=None,  # type: ignore[call-arg]
            supabase_url="https://myproject.supabase.co",
            supabase_key="my-key-123",
        )
        assert settings.supabase_url == "https://myproject.supabase.co"
        assert settings.supabase_key == "my-key-123"

    def test_defaults(self) -> None:
        settings = Settings(
            _env_file=None,  # type: ignore[call-arg]
            supabase_url="https://project.supabase.co",
            supabase_key="key",
        )
        assert settings.debug is False
        assert settings.log_level == "INFO"
        assert settings.supabase_project_id == ""

    def test_get_settings_with_overrides(self) -> None:
        settings = get_settings(
            supabase_url="https://override.supabase.co",
            supabase_key="override-key",
        )
        assert settings.supabase_url == "https://override.supabase.co"
        assert settings.supabase_key == "override-key"

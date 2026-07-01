"""Tests for analytics.db.client."""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import MagicMock, patch

from analytics.db.client import create_supabase_client

if TYPE_CHECKING:
    from analytics.config import Settings


class TestCreateSupabaseClient:
    """Tests for create_supabase_client factory."""

    def test_returns_client_given_settings(self, test_settings: Settings) -> None:
        with patch("analytics.db.client.create_client") as mock_create:
            mock_create.return_value = MagicMock()
            client = create_supabase_client(test_settings)
            mock_create.assert_called_once_with(
                test_settings.supabase_url,
                test_settings.supabase_key,
            )
            assert client is not None

    def test_mock_client_usable_without_live_connection(
        self, mock_supabase_client: MagicMock
    ) -> None:
        # Should not raise — mock works without any network
        result = mock_supabase_client.table("metrics").select("*").execute()
        assert result.data == []

    def test_uses_get_settings_when_none_passed(self) -> None:
        with (
            patch("analytics.db.client.get_settings") as mock_get_settings,
            patch("analytics.db.client.create_client") as mock_create,
        ):
            mock_settings = MagicMock()
            mock_settings.supabase_url = "https://env.supabase.co"
            mock_settings.supabase_key = "env-key"
            mock_get_settings.return_value = mock_settings
            mock_create.return_value = MagicMock()

            create_supabase_client()

            mock_get_settings.assert_called_once()
            mock_create.assert_called_once_with(
                mock_settings.supabase_url,
                mock_settings.supabase_key,
            )

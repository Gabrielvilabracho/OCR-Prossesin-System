"""Tests for src/services/mistral_client.py — Mistral AI SDK proxy boundary.

W2 fix: improves coverage of the mockable proxy that separates real SDK from tests.
All SDK import paths must raise MistralUnavailableError when no real SDK is installed.
"""

import importlib
import sys
from unittest.mock import MagicMock, patch

import pytest

from src.services.mistral_client import (
    MistralUnavailableError,
    _MistralClientProxy,
)


class TestMistralClientProxy:
    """Tests for the _MistralClientProxy class."""

    def test_proxy_initialises_without_error(self):
        """Proxy must initialise with an api_key without calling SDK."""
        proxy = _MistralClientProxy(api_key="test-key")
        assert proxy._api_key == "test-key"
        assert proxy._real_client is None  # not yet initialised

    def test_proxy_ocr_raises_unavailable_when_sdk_missing(self):
        """Accessing .ocr on proxy must raise MistralUnavailableError when SDK is absent."""
        proxy = _MistralClientProxy(api_key="test-key")

        # Patch importlib.import_module to fail for all known SDK names
        with patch("importlib.import_module", side_effect=ImportError("no module")):
            with pytest.raises(MistralUnavailableError, match="Mistral AI SDK not installed"):
                _ = proxy.ocr

    def test_proxy_chat_raises_unavailable_when_sdk_missing(self):
        """Accessing .chat on proxy must raise MistralUnavailableError when SDK is absent."""
        proxy = _MistralClientProxy(api_key="test-key")

        with patch("importlib.import_module", side_effect=ImportError("no module")):
            with pytest.raises(MistralUnavailableError):
                _ = proxy.chat

    def test_proxy_caches_real_client_after_first_access(self):
        """After successful SDK import, the real client must be cached."""
        proxy = _MistralClientProxy(api_key="test-key")

        mock_sdk_module = MagicMock()
        mock_client = MagicMock()
        mock_sdk_module.Mistral.return_value = mock_client

        with patch("importlib.import_module", return_value=mock_sdk_module):
            client1 = proxy._get_real()
            client2 = proxy._get_real()

        assert client1 is client2  # cached
        assert proxy._real_client is mock_client

    def test_proxy_ocr_returns_real_client_ocr_when_sdk_available(self):
        """Accessing .ocr on proxy returns real client's ocr when SDK is available."""
        proxy = _MistralClientProxy(api_key="test-key")

        mock_sdk_module = MagicMock()
        mock_client = MagicMock()
        mock_sdk_module.Mistral.return_value = mock_client

        with patch("importlib.import_module", return_value=mock_sdk_module):
            ocr = proxy.ocr

        assert ocr is mock_client.ocr

    def test_proxy_chat_returns_real_client_chat_when_sdk_available(self):
        """Accessing .chat on proxy returns real client's chat when SDK is available."""
        proxy = _MistralClientProxy(api_key="test-key")

        mock_sdk_module = MagicMock()
        mock_client = MagicMock()
        mock_sdk_module.Mistral.return_value = mock_client

        with patch("importlib.import_module", return_value=mock_sdk_module):
            chat = proxy.chat

        assert chat is mock_client.chat

    def test_unexpected_exception_raises_unavailable(self):
        """Non-ImportError exceptions during SDK load must also raise MistralUnavailableError."""
        proxy = _MistralClientProxy(api_key="test-key")

        with patch("importlib.import_module", side_effect=RuntimeError("unexpected")):
            with pytest.raises(MistralUnavailableError, match="Failed to initialize"):
                _ = proxy.ocr


class TestMistralFactory:
    """Tests for the Mistral() factory function."""

    def test_factory_returns_proxy_instance(self):
        """Mistral() factory must return a _MistralClientProxy."""
        from src.services.mistral_client import Mistral
        result = Mistral(api_key="test-key")
        assert isinstance(result, _MistralClientProxy)

    def test_factory_uses_settings_when_no_api_key(self):
        """Mistral() without api_key must read from Settings.mistral_api_key."""
        from src.services.mistral_client import Mistral
        with patch("src.services.mistral_client.get_settings") as mock_settings:
            mock_settings.return_value.mistral_api_key = "settings-key"
            result = Mistral()
        assert result._api_key == "settings-key"

    def test_factory_uses_provided_api_key(self):
        """Mistral(api_key=...) must use the provided key, not settings."""
        from src.services.mistral_client import Mistral
        result = Mistral(api_key="explicit-key")
        assert result._api_key == "explicit-key"

    def test_unavailable_error_is_subclass_of_runtime_error(self):
        """MistralUnavailableError must be a RuntimeError subclass."""
        assert issubclass(MistralUnavailableError, RuntimeError)

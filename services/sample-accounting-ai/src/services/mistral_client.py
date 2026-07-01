"""Mistral AI client factory — injectable boundary for testing.

Uses the official Mistral AI Python SDK: https://pypi.org/project/mistralai/

For tests: all callers patch src.services.mistral_client.Mistral — this module
provides the mockable import boundary.

If the real SDK is not available, MistralUnavailableError is raised at runtime
(not at import time) so tests can still patch successfully.
"""

from __future__ import annotations

import importlib

from src.config import get_settings


class MistralUnavailableError(RuntimeError):
    """Raised when the Mistral AI SDK cannot be imported at runtime."""


class _MistralClientProxy:
    """Thin proxy that defers real SDK import to first use.

    Allows tests to patch 'Mistral' without SDK installed.
    """

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key
        self._real_client = None

    def _get_real(self):  # type: ignore[return]
        if self._real_client is None:
            try:
                module = importlib.import_module("mistralai")
                _MistralSDK = module.Mistral
                self._real_client = _MistralSDK(api_key=self._api_key)
            except ImportError as e:
                raise MistralUnavailableError(
                    f"Mistral AI SDK not installed ({type(e).__name__}: {e}). Run: pip install mistralai"
                ) from e
            except Exception as e:
                raise MistralUnavailableError(f"Failed to initialize Mistral AI client: {e}") from e
        return self._real_client

    @property
    def ocr(self):  # type: ignore[return]
        return self._get_real().ocr

    @property
    def chat(self):  # type: ignore[return]
        return self._get_real().chat


def Mistral(api_key: str | None = None) -> _MistralClientProxy:  # noqa: N802
    """Factory function matching the Mistral AI SDK interface.

    Returns a proxy client. In tests, patch 'src.services.mistral_client.Mistral'
    to inject a MagicMock instead of instantiating the real SDK.
    """
    if api_key is None:
        settings = get_settings()
        api_key = settings.mistral_api_key
    return _MistralClientProxy(api_key=api_key)

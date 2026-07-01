"""Supabase client factory with dependency injection."""

from __future__ import annotations

from supabase import Client, create_client

from analytics.config import Settings, get_settings


def create_supabase_client(settings: Settings | None = None) -> Client:
    """Create a Supabase client from settings.

    Args:
        settings: Optional settings override. If None, loads from environment.

    Returns:
        Authenticated Supabase client.

    Example:
        # Default — reads from .env / environment
        client = create_supabase_client()

        # Multi-tenant — explicit credentials for a specific client project
        client = create_supabase_client(Settings(
            supabase_url="https://abc.supabase.co",
            supabase_key="eyJ...",
        ))

        # Testing — pass mock settings
        client = create_supabase_client(test_settings)
    """
    if settings is None:
        settings = get_settings()

    return create_client(settings.supabase_url, settings.supabase_key)

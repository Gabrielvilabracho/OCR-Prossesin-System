"""Supabase service — Supabase Storage client factory.

Used by fetch_pdf_node to download PDFs.
Service role key required — never use anon key for server-side operations.
"""

from supabase import Client, create_client

from src.config import get_settings

_client: Client | None = None


def get_supabase_client() -> Client:
    """Return a cached Supabase client using service role key.

    Singleton pattern — client is created once and reused.
    Must use SERVICE key (not anon key) for storage access.
    """
    global _client
    if _client is None:
        settings = get_settings()
        _client = create_client(settings.supabase_url, settings.supabase_service_key)
    return _client

"""Application configuration via environment variables."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Settings loaded from environment variables or .env file.

    For multi-tenant usage, create a Settings instance per client
    with different SUPABASE_URL / SUPABASE_KEY values.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    supabase_url: str
    supabase_key: str
    supabase_project_id: str = ""

    # Optional overrides
    debug: bool = False
    log_level: str = "INFO"


def get_settings(**overrides: str) -> Settings:
    """Create a Settings instance with optional overrides.

    Useful for testing (pass values directly) or multi-tenant
    scenarios (different Supabase project per client).
    """
    return Settings.model_validate(overrides)

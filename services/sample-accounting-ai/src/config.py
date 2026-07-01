from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str = ""
    supabase_service_key: str = ""
    mistral_api_key: str = ""

    service_host: str = "0.0.0.0"
    service_port: int = 8001
    log_level: str = "info"


def get_settings() -> Settings:
    return Settings()

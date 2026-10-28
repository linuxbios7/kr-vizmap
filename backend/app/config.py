from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="KRMAP_", extra="ignore")

    database_url: str = "sqlite:///./data/krmap.db"
    cors_origins: list[str] = ["http://localhost:3000"]
    # 장중 시세 재수집 주기(분)
    intraday_interval_min: int = 5
    scheduler_enabled: bool = False


settings = Settings()

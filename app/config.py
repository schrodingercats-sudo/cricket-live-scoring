import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    SQLITE_DB_PATH: str = os.getenv("SQLITE_DB_PATH", "data/cricket.db")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///data/cricket.db")

    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", 8000))
    DEBUG: bool = os.getenv("DEBUG", "true").lower() in ("true", "1", "yes")

    # Keep-alive: public URL to self-ping so free hosts (Render) never spin the service down.
    # On Render this is auto-set via RENDER_EXTERNAL_URL; KEEP_ALIVE_URL is a manual override.
    KEEP_ALIVE_URL: str = os.getenv("KEEP_ALIVE_URL", "")

    # Optional admin token; when set, enables GET /api/admin/backup-db?token=... (DB snapshot download)
    ADMIN_TOKEN: str = os.getenv("ADMIN_TOKEN", "")

    def get_database_url(self) -> str:
        if self.DATABASE_URL and self.DATABASE_URL.strip():
            return self.DATABASE_URL
        return f"sqlite:///{self.SQLITE_DB_PATH}"

settings = Settings()


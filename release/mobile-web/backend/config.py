from dataclasses import dataclass
from pathlib import Path
import os

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]


@dataclass
class Settings:
    database_url: str
    media_root: Path
    cookie_secure: bool = False
    allowed_hosts: tuple = ("127.0.0.1", "localhost", "testserver")
    openai_base_url: str = ""
    openai_api_key: str = ""
    vision_model: str = ""
    vision_enable_thinking: bool = False
    vision_timeout: float = 30
    vision_daily_limit: int = 50
    session_days: int = 14
    media_quota_bytes: int = 250 * 1024 * 1024

    @property
    def vision_enabled(self):
        return bool(self.openai_base_url and self.openai_api_key and self.vision_model)

    @classmethod
    def from_env(cls):
        load_dotenv(ROOT / ".env")
        data = ROOT / ".data"
        data.mkdir(mode=0o700, exist_ok=True)
        return cls(
            database_url=os.getenv("DATABASE_URL", "").strip() or f"sqlite:///{data / 'meals.sqlite3'}",
            media_root=Path(os.getenv("MEDIA_ROOT", "").strip() or data / "photos"),
            cookie_secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
            allowed_hosts=tuple(x.strip() for x in os.getenv("ALLOWED_HOSTS", "127.0.0.1,localhost").split(",") if x.strip()),
            openai_base_url=os.getenv("OPENAI_BASE_URL", "").strip(),
            openai_api_key=os.getenv("OPENAI_API_KEY", "").strip() or os.getenv("DASHSCOPE_API_KEY", "").strip(),
            vision_model=os.getenv("VISION_MODEL", "").strip(),
            vision_enable_thinking=os.getenv("VISION_ENABLE_THINKING", "false").lower() == "true",
            vision_timeout=float(os.getenv("VISION_TIMEOUT_SECONDS", "30")),
            vision_daily_limit=int(os.getenv("VISION_DAILY_LIMIT", "50")),
        )

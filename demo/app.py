"""FastAPI factory adding a one-time demo bootstrap to the frozen v4 app."""
from contextlib import asynccontextmanager
import logging
import os
from pathlib import Path
import sys

from dotenv import load_dotenv

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT / "release" / "mobile-web"))

from backend.app import create_app
from .bootstrap import seed_account


def configure_environment():
    load_dotenv(PROJECT / ".env.demo")
    data = PROJECT / ".demo-data"
    if not os.getenv("DATABASE_URL", "").strip():
        data.mkdir(parents=True, mode=0o700, exist_ok=True)
        os.environ["DATABASE_URL"] = f"sqlite:///{data / 'meals.sqlite3'}"
    if not os.getenv("MEDIA_ROOT", "").strip():
        os.environ["MEDIA_ROOT"] = str(data / "photos")


def create_demo_app(config=None, *, run_worker=True):
    if config is None:
        configure_environment()
    app = create_app(config, run_worker=run_worker)
    original_lifespan = app.router.lifespan_context

    @asynccontextmanager
    async def demo_lifespan(app):
        async with original_lifespan(app):
            outcome = seed_account(app.state.db)
            logging.getLogger("meal.demo").info(
                "demo_ready created=%s meals=%s", outcome["created"], outcome["mealCount"])
            yield

    app.router.lifespan_context = demo_lifespan
    return app

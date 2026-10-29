"""Create the public demo account once; preserve subsequent edits/deletions."""
import json
from pathlib import Path
import sys
import time
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT / "release" / "mobile-web"))

from backend.domain import UserSettings, normalize_record, profile_data
from backend.models import Meal, User
from backend.security import hash_password

ACCOUNT_FILE = Path(__file__).with_name("account.json")


def seed_account(factory, account_file=ACCOUNT_FILE):
    data = json.loads(Path(account_file).read_text(encoding="utf-8"))
    username = data["username"].lower()
    dataset = data["datasetId"]
    if data.get("schemaVersion") != 1 or username != "yunzhong":
        raise ValueError("Unsupported demo dataset")

    with factory() as db:
        existing = db.scalar(select(User).where(User.username == username))
        if existing:
            count = db.scalar(select(func.count()).select_from(Meal).where(Meal.user_id == existing.id))
            return {"created": False, "mealCount": count}

        user_id = str(uuid5(NAMESPACE_URL, f"{dataset}/user"))
        user = User(id=user_id, username=username, password_hash=hash_password(data["password"]),
                    profile=profile_data(data["profile"]),
                    settings=UserSettings.model_validate(data["settings"]).model_dump(),
                    knowledge_history={}, created_at=time.time())
        db.add(user)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            existing = db.scalar(select(User).where(User.username == username))
            if not existing:
                raise
            return {"created": False, "mealCount": db.scalar(
                select(func.count()).select_from(Meal).where(Meal.user_id == existing.id))}
        for item in data["meals"]:
            raw = item["record"]
            if raw.get("photos"):
                raise ValueError("Demo dataset must use bundled dish reference images")
            record, stamp = normalize_record(raw, allow_undated=True)
            identifier = str(uuid5(NAMESPACE_URL, f"{dataset}/{item['key']}"))
            record.update(id=identifier, revision=1,
                          createdAt=raw["createdAt"], updatedAt=raw["updatedAt"])
            db.add(Meal(id=identifier, user_id=user_id, record=record, eaten_at=stamp,
                        revision=1, import_key=f"{dataset}:{item['key']}"))
        try:
            db.commit()
        except IntegrityError:
            # Another worker may have completed the same one-time bootstrap.
            db.rollback()
            if not db.scalar(select(User).where(User.username == username)):
                raise
            return {"created": False, "mealCount": db.scalar(
                select(func.count()).select_from(Meal).where(Meal.user_id == user_id))}
        return {"created": True, "mealCount": len(data["meals"])}

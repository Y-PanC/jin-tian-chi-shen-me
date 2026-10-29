"""One-time initialization shared by every normal application entry point."""
import json
from pathlib import Path
import time
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from .domain import UserSettings, normalize_record, profile_data
from .models import DemoInitialization, Meal, User
from .security import hash_password

ACCOUNT_FILE = Path(__file__).with_name("data") / "demo-account.json"


def seed_account(factory, account_file=ACCOUNT_FILE):
    data = json.loads(Path(account_file).read_text(encoding="utf-8"))
    username = data["username"].lower()
    dataset = data["datasetId"]
    if data.get("schemaVersion") != 1 or username != "yunzhong":
        raise ValueError("Unsupported demo dataset")

    # A database marker survives deletion of all meals and concurrent workers.
    for attempt in range(2):
        with factory() as db:
            user = db.scalar(select(User).where(User.username == username))
            count = db.scalar(select(func.count()).select_from(Meal).where(Meal.user_id == user.id)) if user else 0
            if db.get(DemoInitialization, dataset):
                return {"created": False, "mealCount": count}
            try:
                created = user is None
                snapshot_user_id = str(uuid5(NAMESPACE_URL, f"{dataset}/user"))
                import_history = created or (count == 0 and user.id != snapshot_user_id)
                if created:
                    user = User(id=snapshot_user_id, username=username,
                                password_hash=hash_password(data["password"]),
                                profile=profile_data(data["profile"]),
                                settings=UserSettings.model_validate(data["settings"]).model_dump(),
                                knowledge_history={}, created_at=time.time())
                    db.add(user)
                    db.flush()
                elif import_history:
                    if user.profile is None:
                        user.profile = profile_data(data["profile"])
                    settings = dict(user.settings or {})
                    for key in ("nickname", "userId"):
                        if not settings.get(key):
                            settings[key] = data["settings"][key]
                    user.settings = settings
                if import_history:
                    for item in data["meals"]:
                        raw = item["record"]
                        if raw.get("photos"):
                            raise ValueError("Demo dataset must use bundled dish reference images")
                        record, stamp = normalize_record(raw, allow_undated=True)
                        identifier = str(uuid5(NAMESPACE_URL, f"{dataset}/{item['key']}"))
                        record.update(id=identifier, revision=1,
                                      createdAt=raw["createdAt"], updatedAt=raw["updatedAt"])
                        db.add(Meal(id=identifier, user_id=user.id, record=record, eaten_at=stamp,
                                    revision=1, import_key=f"{dataset}:{item['key']}"))
                    count = len(data["meals"])
                db.add(DemoInitialization(dataset_id=dataset, user_id=user.id, completed_at=time.time()))
                db.commit()
                return {"created": created, "mealCount": count}
            except IntegrityError:
                db.rollback()
                if attempt:
                    raise

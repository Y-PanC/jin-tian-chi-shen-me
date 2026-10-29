import copy
import json
from pathlib import Path

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import func, select

from backend.app import create_app
from backend.demo_seed import ACCOUNT_FILE, seed_account
from backend.config import Settings
from backend.domain import profile_data, statistics
from backend.models import DemoInitialization, Meal, User
from backend.security import hash_password

DATA = json.loads(ACCOUNT_FILE.read_text(encoding="utf-8"))
HEADERS = {"X-Meal-Request": "1"}


@pytest.fixture
def app(tmp_path):
    config = Settings(database_url=f"sqlite:///{tmp_path / 'demo.db'}", media_root=tmp_path / "photos")
    return create_app(config, run_worker=False)


def login(client):
    response = client.post("/api/v1/auth/login", json={
        "username": DATA["username"], "password": DATA["password"]})
    assert response.status_code == 200, response.text
    return response.json()["user"]


def test_fresh_deploy_login_history_stats_and_preferences(app):
    with TestClient(app, headers=HEADERS) as client:
        user = login(client)
        state = client.get("/api/v1/state").json()
        assert user["username"] == "yunzhong"
        assert state["settings"]["nickname"] == "Yunzhong"
        assert state["profile"] == profile_data(DATA["profile"])
        assert len(state["records"]) == 33
        assert state["stats"] == statistics([x["record"] for x in DATA["meals"]])
        assert client.get("/api/v1/meals?limit=5").json()["total"] == 33
        assert client.get("/api/v1/health").json()["photoRecognition"] is False
        for page in ["/page_login.html", "/page0_home_old_user.html", "/page4_log.html", "/page5_profile.html"]:
            assert client.get(page).status_code == 200


def test_restart_keeps_deletions_edits_and_new_records(app):
    with TestClient(app, headers=HEADERS) as client:
        login(client)
        records = client.get("/api/v1/state").json()["records"]
        removed, changed = records[:2]
        assert client.delete(f"/api/v1/meals/{removed['id']}?revision=1").status_code == 200
        changed["remarks"] = "演示中修改的备注"
        assert client.put(f"/api/v1/meals/{changed['id']}", json={
            "record": changed, "expectedRevision": 1}).status_code == 200
        fresh = {"dishes": ["演示新餐食"], "tags": ["清淡"], "photos": [],
                 "remarks": "", "eatenAt": "2026-10-28T04:00:00Z", "timeZone": "Asia/Shanghai"}
        assert client.post("/api/v1/meals", json={"record": fresh}).status_code == 200
    with TestClient(app, headers=HEADERS) as client:
        login(client)
        state = client.get("/api/v1/state").json()
        assert len(state["records"]) == 33
        assert removed["id"] not in {x["id"] for x in state["records"]}
        assert next(x for x in state["records"] if x["id"] == changed["id"])["remarks"] == "演示中修改的备注"
        assert any(x["dishes"] == ["演示新餐食"] for x in state["records"])


def test_other_accounts_start_empty_and_cannot_read_demo_meals(app):
    with TestClient(app, headers=HEADERS) as client:
        login(client)
        record = client.get("/api/v1/state").json()["records"][0]
        assert client.post("/api/v1/auth/register", json={
            "username": "new_tester", "password": "SeparateTest2026!"}).status_code == 200
        assert client.get("/api/v1/state").json()["records"] == []
        assert client.get(f"/api/v1/meals/{record['id']}").status_code == 404


def test_repeated_seed_does_not_duplicate_or_change_password(app):
    with TestClient(app, headers=HEADERS) as client:
        login(client)
        for _ in range(2):
            assert seed_account(app.state.db) == {"created": False, "mealCount": 33}
        with app.state.db() as db:
            assert db.scalar(select(func.count()).select_from(User)) == 1
            user = db.scalar(select(User))
            original_hash = user.password_hash
        seed_account(app.state.db)
        with app.state.db() as db:
            assert db.scalar(select(User)).password_hash == original_hash


def test_preexisting_account_is_not_overwritten(app):
    with TestClient(app, headers=HEADERS):
        with app.state.db() as db:
            user = db.scalar(select(User).where(User.username == "yunzhong"))
            original_hash = user.password_hash
            user.settings = {**user.settings, "nickname": "演示中改名"}
            db.commit()
        seed_account(app.state.db)
        with app.state.db() as db:
            user = db.scalar(select(User).where(User.username == "yunzhong"))
            assert user.settings["nickname"] == "演示中改名"
            assert user.password_hash == original_hash


def test_invalid_dataset_rolls_back_the_whole_import(app, tmp_path):
    with TestClient(app, headers=HEADERS):
        with app.state.db() as db:
            for row in db.scalars(select(Meal)):
                db.delete(row)
            user = db.scalar(select(User))
            user.username = "existing_account"
            db.commit()
        broken = copy.deepcopy(DATA)
        broken["datasetId"] = "invalid-dataset"
        broken["meals"][1]["record"]["tags"] = ["x" * 100]
        path = tmp_path / "invalid.json"
        path.write_text(json.dumps(broken), encoding="utf-8")
        with pytest.raises(Exception):
            seed_account(app.state.db, path)
        with app.state.db() as db:
            assert db.scalar(select(func.count()).select_from(Meal)) == 0
            assert not db.scalar(select(User).where(User.username == "yunzhong"))


def test_public_payload_has_no_local_ids_sessions_or_provider_keys():
    assert DATA["username"] == "Yunzhong"
    assert len(DATA["meals"]) == 33
    assert len({x["key"] for x in DATA["meals"]}) == 33
    assert not ({"password_hash", "token_hash", "sessions", "api_key"} & set(DATA))
    for item in DATA["meals"]:
        assert "id" not in item["record"]
        assert item["record"]["photos"] == []


def test_deleting_all_meals_does_not_restore_the_snapshot_on_restart(app):
    with TestClient(app, headers=HEADERS):
        with app.state.db() as db:
            for row in db.scalars(select(Meal)):
                db.delete(row)
            db.commit()
    with TestClient(app, headers=HEADERS) as client:
        login(client)
        assert client.get("/api/v1/state").json()["records"] == []
        with app.state.db() as db:
            assert db.scalar(select(func.count()).select_from(DemoInitialization)) == 1


def test_upgrade_adds_yunzhong_without_changing_the_existing_xxx_account(app):
    app.state.config.seed_demo_account = False
    with TestClient(app, headers=HEADERS) as client:
        client.post("/api/v1/auth/register", json={"username": "xxx", "password": "ExistingPass123"})
        original = client.get("/api/v1/state").json()["user"]
    app.state.config.seed_demo_account = True
    with TestClient(app, headers=HEADERS) as client:
        login(client)
        assert len(client.get("/api/v1/state").json()["records"]) == 33
        client.post("/api/v1/auth/login", json={"username": "xxx", "password": "ExistingPass123"})
        state = client.get("/api/v1/state").json()
        assert state["user"] == original and state["records"] == []


def test_existing_empty_yunzhong_receives_history_without_password_reset(app):
    app.state.config.seed_demo_account = False
    with TestClient(app, headers=HEADERS) as client:
        client.post("/api/v1/auth/register", json={"username": "Yunzhong", "password": "ExistingPass123"})
        with app.state.db() as db:
            user = db.scalar(select(User))
            password_hash = user.password_hash
            user.settings = {**user.settings, "nickname": "原昵称"}
            db.commit()
    app.state.config.seed_demo_account = True
    with TestClient(app, headers=HEADERS) as client:
        assert client.post("/api/v1/auth/login", json={"username": "Yunzhong", "password": "ExistingPass123"}).status_code == 200
        state = client.get("/api/v1/state").json()
        assert len(state["records"]) == 33 and state["profile"]["onboardingCompleted"]
        assert state["settings"]["nickname"] == "原昵称"
        with app.state.db() as db:
            assert db.scalar(select(User)).password_hash == password_hash


def test_upgrade_keeps_previously_deleted_demo_history_empty(app):
    from uuid import NAMESPACE_URL, uuid5
    import time
    app.state.config.seed_demo_account = False
    with TestClient(app, headers=HEADERS):
        with app.state.db() as db:
            db.add(User(id=str(uuid5(NAMESPACE_URL, f"{DATA['datasetId']}/user")), username="yunzhong",
                        password_hash=hash_password(DATA["password"]), profile=profile_data(DATA["profile"]),
                        settings=DATA["settings"], knowledge_history={}, created_at=time.time()))
            db.commit()
    app.state.config.seed_demo_account = True
    with TestClient(app, headers=HEADERS) as client:
        login(client)
        assert client.get("/api/v1/state").json()["records"] == []


def test_default_factory_initializes_without_a_special_entrypoint(tmp_path, monkeypatch):
    import backend.config as config_module
    root = tmp_path / "release" / "mobile-web"
    root.mkdir(parents=True)
    monkeypatch.setattr(config_module, "ROOT", root)
    for key in ("DATABASE_URL", "MEDIA_ROOT", "SEED_DEMO_ACCOUNT", "OPENAI_BASE_URL", "OPENAI_API_KEY", "DASHSCOPE_API_KEY", "VISION_MODEL"):
        monkeypatch.delenv(key, raising=False)
    normal = create_app(run_worker=False)
    with TestClient(normal, headers=HEADERS, base_url="http://127.0.0.1") as client:
        login(client)
        assert len(client.get("/api/v1/state").json()["records"]) == 33


def test_adopt_previous_data_preserves_committed_wal_and_photos(tmp_path, monkeypatch):
    import sqlite3
    import backend.config as config_module
    root = tmp_path / "release" / "mobile-web"
    root.mkdir(parents=True)
    previous = tmp_path / ".demo-data"
    (previous / "photos").mkdir(parents=True)
    (previous / "photos" / "saved.jpg").write_bytes(b"existing-photo")
    old = sqlite3.connect(previous / "meals.sqlite3")
    old.execute("PRAGMA journal_mode=WAL")
    old.execute("CREATE TABLE retained (value TEXT)")
    old.execute("INSERT INTO retained VALUES ('existing-record')")
    old.commit()
    monkeypatch.setattr(config_module, "ROOT", root)
    target = root / ".data"
    target.mkdir()
    config_module.adopt_previous_data(target)
    with sqlite3.connect(target / "meals.sqlite3") as fresh:
        assert fresh.execute("SELECT value FROM retained").fetchone()[0] == "existing-record"
        fresh.execute("UPDATE retained SET value='newer-record'")
        fresh.commit()
    config_module.adopt_previous_data(target)
    with sqlite3.connect(target / "meals.sqlite3") as fresh:
        assert fresh.execute("SELECT value FROM retained").fetchone()[0] == "newer-record"
    assert (target / "photos" / "saved.jpg").read_bytes() == b"existing-photo"
    assert old.execute("SELECT value FROM retained").fetchone()[0] == "existing-record"
    old.close()

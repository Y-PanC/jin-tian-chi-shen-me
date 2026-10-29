import asyncio
import json
from io import BytesIO
import time
from uuid import uuid4

import httpx
from openai import AsyncOpenAI
from PIL import Image
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.app import create_app
from backend.config import Settings
from backend.models import LoginSession, Photo, RecognitionJob, User
from backend.maintenance import cleanup
from backend.vision import process_one

HEADERS = {"X-Meal-Request": "1"}
PASSWORD = "meal-test-password-2026"


@pytest.fixture
def app(tmp_path):
    config = Settings(database_url=f"sqlite:///{tmp_path / 'test.db'}", media_root=tmp_path / "photos", seed_demo_account=False)
    return create_app(config, run_worker=False)


@pytest.fixture
def client(app):
    with TestClient(app, headers=HEADERS) as client:
        response = client.post("/api/v1/auth/register", json={"username": "user_a", "password": PASSWORD})
        assert response.status_code == 200, response.text
        yield client


def meal(**changes):
    return {"id": str(uuid4()), "dishes": ["番茄炒蛋", "米饭"], "tags": ["主食", "偏咸"], "remarks": "少酱",
            "photos": [], "eatenAt": "2026-01-02T04:05:00Z", "timeZone": "Asia/Shanghai", **changes}


def upload(client, **changes):
    image = Image.new("RGB", (1800, 900), "red")
    out = BytesIO(); image.save(out, "PNG")
    response = client.post("/api/v1/photos", data={"id": str(uuid4())}, files={"file": ("test.png", out.getvalue(), "image/png")}, **changes)
    assert response.status_code == 200, response.text
    return response.json()


def test_sessions_csrf_validation_and_expiry(client, app):
    assert "HttpOnly" in client.post("/api/v1/auth/login", json={"username": "USER_A", "password": PASSWORD}).headers["set-cookie"]
    assert client.post("/api/v1/meals", json={"record": meal()}, headers={"X-Meal-Request": ""}).status_code == 403
    assert client.post("/api/v1/meals", json={"record": meal()}, headers={"Origin": "https://other.example"}).status_code == 403
    assert client.post("/api/v1/auth/register", json={"username": "user_a", "password": PASSWORD}).status_code == 409
    bad = client.post("/api/v1/auth/login", json={"username": "user_a", "password": "incorrect-password"})
    assert bad.status_code == 401 and "password" not in bad.text
    with app.state.db() as db:
        for session in db.scalars(select(LoginSession)):
            session.expires_at = time.time() - 1
        db.commit()
    assert client.get("/api/v1/state").status_code == 401


def test_owner_isolation_including_private_photos(client, app):
    photo = upload(client)
    record = client.post("/api/v1/meals", json={"record": meal(photos=[photo])}).json()["record"]
    with TestClient(app, headers=HEADERS) as other:
        other.post("/api/v1/auth/register", json={"username": "user_b", "password": PASSWORD})
        assert other.get("/api/v1/state").json()["records"] == []
        assert other.get("/api/v1/stats").json()["mealCount"] == 0
        for path in [f"meals/{record['id']}", f"photos/{photo['id']}"]:
            assert other.get("/api/v1/" + path).status_code == 404
        assert other.put(f"/api/v1/meals/{record['id']}", json={"record": record, "expectedRevision": 1}).status_code == 404
        assert other.delete(f"/api/v1/meals/{record['id']}?revision=1").status_code == 404
        assert other.post("/api/v1/meals", json={"record": meal(photos=[photo])}).status_code == 404
    assert client.get(f"/api/v1/photos/{photo['id']}").headers["content-type"] == "image/jpeg"
    assert not (app.state.config.media_root.parent / "dist").exists()


def test_edit_is_atomic_and_statistics_follow_meal_time(client):
    first = client.post("/api/v1/meals", json={"record": meal(eatenAt="2026-01-01T17:30:00Z")}).json()["record"]
    second = client.post("/api/v1/meals", json={"record": meal(dishes=["青菜面"], eatenAt="2026-01-03T04:00:00Z", tags=["偏辣"])}).json()["record"]
    changed = {**first, "dishes": ["蒸鱼"], "tags": ["鲜香"], "eatenAt": "2025-12-30T04:00:00Z"}
    response = client.put(f"/api/v1/meals/{first['id']}", json={"record": changed, "expectedRevision": 1})
    assert response.status_code == 200, response.text
    saved = response.json()["record"]
    assert saved["id"] == first["id"] and saved["createdAt"] == first["createdAt"] and saved["revision"] == 2
    assert client.put(f"/api/v1/meals/{first['id']}", json={"record": first, "expectedRevision": 1}).status_code == 409
    assert client.get("/api/v1/meals").json()["items"][0]["id"] == second["id"]
    stats = client.get("/api/v1/stats").json()
    assert stats["mealCount"] == 2 and stats["dayCount"] == 2 and stats["dishCounts"] == {"青菜面": 1, "蒸鱼": 1}
    assert stats["taste"]["counts"] == [0, 0, 0, 1, 1, 0]
    assert client.delete(f"/api/v1/meals/{first['id']}?revision=1").status_code == 409
    assert client.delete(f"/api/v1/meals/{first['id']}?revision=2").status_code == 200
    assert client.get("/api/v1/stats").json()["mealCount"] == 1


def test_retried_create_does_not_duplicate_a_saved_meal(client):
    payload = meal()
    first = client.post("/api/v1/meals", json={"record": payload}).json()["record"]
    retry = client.post("/api/v1/meals", json={"record": payload})
    assert retry.status_code == 200 and retry.json()["record"] == first
    assert client.get("/api/v1/stats").json()["mealCount"] == 1
    assert client.post("/api/v1/meals", json={"record": {**payload, "remarks": "changed"}}).status_code == 409


def test_date_filters_timezones_and_pagination(client):
    for stamp in ["2026-01-01T17:30:00Z", "2026-01-02T04:00:00Z", "2026-01-03T04:00:00Z"]:
        assert client.post("/api/v1/meals", json={"record": meal(eatenAt=stamp)}).status_code == 200
    assert client.get("/api/v1/meals?year=2026&month=1&day=2&tz=Asia/Shanghai").json()["total"] == 2
    assert client.get("/api/v1/meals?year=2026&month=1&day=1&tz=UTC").json()["total"] == 1
    result = client.get("/api/v1/meals?limit=2").json()
    assert len(result["items"]) == 2 and result["nextOffset"] == 2
    assert len(client.get("/api/v1/meals?offset=2&limit=2").json()["items"]) == 1
    assert client.get("/api/v1/meals?tz=Invalid/Zone").status_code == 422


@pytest.mark.parametrize("changes", [
    {"dishes": []}, {"dishes": ["x" * 51]}, {"eatenAt": "2999-01-01T00:00:00Z"},
    {"eatenAt": "2026-01-01T12:00:00"}, {"tags": ["x" * 17]}, {"remarks": "x" * 1201},
    {"photos": [{"id": "bad"}]}, {"timeZone": "No/Zone"},
])
def test_invalid_meals_do_not_write(client, changes):
    assert client.post("/api/v1/meals", json={"record": meal(**changes)}).status_code == 422
    assert client.get("/api/v1/state").json()["records"] == []


def test_preferences_are_independent_and_have_conflict_detection(client):
    initial = client.get("/api/v1/state").json()
    assert initial["profile"] is None
    body = {"profile": {"budgetRange": "under15", "restrictions": ["花生"]}, "expectedVersion": initial["version"]}
    result = client.put("/api/v1/preferences", json=body)
    assert result.status_code == 200
    assert result.json()["profile"]["budget"] == 15
    assert client.put("/api/v1/preferences", json=body).status_code == 409
    version = result.json()["version"]
    result = client.put("/api/v1/preferences", json={"settings": {"nickname": "小饭", "userId": "display_01"}, "expectedVersion": version})
    assert result.json()["profile"]["restrictions"] == ["花生"]
    bad = client.put("/api/v1/preferences", json={"settings": {"nickname": "x" * 25}, "expectedVersion": result.json()["version"]})
    assert bad.status_code == 422 and "x" * 25 not in bad.text
    assert client.get("/api/v1/state").json()["settings"]["userId"] == "display_01"


def test_profile_budget_options_save_and_reload_without_losing_the_selected_range(client):
    budgets = {"under10": 10, "10to15": 15, "15to20": 20, "20to30": 30, "30to40": 40,
               "40to60": 60, "60to100": 100, "over100": None, "unlimited": None}
    for key, cap in budgets.items():
        version = client.get("/api/v1/state").json()["version"]
        response = client.put("/api/v1/preferences", json={"profile": {"budgetRange": key}, "expectedVersion": version})
        assert response.status_code == 200, response.text
        profile = client.get("/api/v1/state").json()["profile"]
        assert profile["budgetRange"] == key and profile["budget"] == cap


def test_photo_validation_metadata_and_attachment(client):
    invalid = client.post("/api/v1/photos", data={"id": str(uuid4())}, files={"file": ("fake.jpg", b"not an image", "image/jpeg")})
    assert invalid.status_code == 422
    photo = upload(client)
    assert photo["width"] == 1600 and photo["height"] == 800 and photo["mimeType"] == "image/jpeg"
    record = client.post("/api/v1/meals", json={"record": meal(photos=[{**photo, "size": 1, "width": 1}])}).json()["record"]
    assert record["photos"][0]["size"] == photo["size"]
    assert client.delete(f"/api/v1/photos/{photo['id']}").status_code == 409
    response = client.put(f"/api/v1/meals/{record['id']}", json={"record": {**record, "photos": []}, "expectedRevision": 1})
    assert response.status_code == 200
    assert client.delete(f"/api/v1/photos/{photo['id']}").status_code == 200
    assert client.get(f"/api/v1/photos/{photo['id']}").status_code == 404


def test_import_is_idempotent_preserves_undated_history_and_excludes_samples(client):
    legacy = meal(id="old-local-1", eatenAt=None, text="原始记录文字", originalText="原始记录文字")
    sample = meal(id="diary-sample-v3-01", source="fictional-mixed-dining-sample")
    result = client.post("/api/v1/import", json={"records": [legacy, sample]}).json()
    assert result == {"imported": 1, "skipped": 1}
    assert client.post("/api/v1/import", json={"records": [legacy]}).json() == {"imported": 0, "skipped": 1}
    state = client.get("/api/v1/state").json()
    assert state["importKeys"] == ["old-local-1"] and len(state["records"]) == 1
    assert state["records"][0]["originalText"] == "原始记录文字" and state["records"][0]["eatenAt"] is None
    assert state["stats"]["dayCount"] == 0
    assert client.get("/api/v1/meals?year=unknown").json()["total"] == 1
    assert client.post("/api/v1/import", json={"records": [meal(id="good"), meal(id="bad", tags=["x" * 99])]}).status_code == 422
    assert client.get("/api/v1/stats").json()["mealCount"] == 1


def test_vision_disabled_is_explicit_and_manual_record_still_works(client):
    assert client.get("/api/v1/health").json()["photoRecognition"] is False
    assert client.post("/api/v1/recognitions", json={"photoIds": [str(uuid4())]}).status_code == 503
    assert client.post("/api/v1/meals", json={"record": meal()}).status_code == 200


def test_legacy_samples_require_explicit_opt_in_and_keep_origin_and_import_identity(client):
    sample = meal(id="diary-sample-v3-01", source="fictional-mixed-dining-sample", originalText="旧版示例原文")
    user_id = client.get("/api/v1/state").json()["user"]["id"]
    assert client.post("/api/v1/import", json={"records": [sample]}).json() == {"imported": 0, "skipped": 1}
    body = {"records": [sample], "includeSamples": True, "expectedUserId": user_id}
    assert client.post("/api/v1/import", json=body).json() == {"imported": 1, "skipped": 0}
    assert client.post("/api/v1/import", json=body).json() == {"imported": 0, "skipped": 1}
    state = client.get("/api/v1/state").json()
    saved = state["records"][0]
    assert state["importKeys"] == [sample["id"]] and state["stats"]["mealCount"] == 1
    assert saved["id"] != sample["id"] and saved["originalSource"] == sample["source"]
    assert saved["originalText"] == sample["originalText"] and saved["remarks"] == sample["remarks"]
    edited = client.put(f"/api/v1/meals/{saved['id']}", json={"record": {**saved, "remarks": "已改备注"}, "expectedRevision": saved["revision"]}).json()["record"]
    assert edited["originalSource"] == sample["source"]


def test_import_stops_when_account_changes_or_sample_opt_in_is_not_boolean(client):
    entry = meal(id="old-local-id")
    response = client.post("/api/v1/import", json={"records": [entry], "expectedUserId": str(uuid4()), "includeSamples": True})
    assert response.status_code == 409
    assert client.post("/api/v1/import", json={"records": [entry], "includeSamples": "true"}).status_code == 422
    assert client.get("/api/v1/state").json()["records"] == []


def sdk_client(content, finish="stop"):
    def handler(request):
        body = json.loads(request.content)
        assert body["stream"] is True
        assert body["messages"][0]["content"][1]["image_url"]["url"].startswith("data:image/jpeg;base64,")
        chunks = [
            {"choices": [{"index": 0, "delta": {"reasoning_content": "private thinking should never persist"}, "finish_reason": None}]},
            {"choices": [{"index": 0, "delta": {"content": content}, "finish_reason": None}]},
            {"choices": [{"index": 0, "delta": {}, "finish_reason": finish}]},
        ]
        text = "".join("data: " + json.dumps(chunk) + "\n\n" for chunk in chunks) + "data: [DONE]\n\n"
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, text=text)
    return AsyncOpenAI(api_key="test-key", base_url="https://mock.invalid/v1", http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)))


@pytest.mark.parametrize("content,status", [
    ('{"dishes":["番茄炒蛋","米饭"],"tags":["蛋白质","主食"]}', "succeeded"),
    ('{"dishes":[],"tags":[]}', "succeeded"),
    ('{"dishes":["番茄炒蛋"],"tags":["偏咸"]}', "failed"),
    ('not json', "failed"),
])
def test_actual_sdk_streaming_worker_returns_only_confirmable_draft(client, app, content, status):
    app.state.config.openai_base_url = "https://mock.invalid/v1"
    app.state.config.openai_api_key = "test-key"
    app.state.config.vision_model = "qwen3.8-max"
    app.state.config.vision_enable_thinking = True
    photo = upload(client)
    app.state.vision.client = sdk_client(content)
    response = client.post("/api/v1/recognitions", json={"photoIds": [photo["id"]]})
    assert response.status_code == 202
    job_id = response.json()["id"]
    assert client.post("/api/v1/recognitions", json={"photoIds": [photo["id"]]}).json()["id"] == job_id
    asyncio.run(process_one(app.state.db, app.state.config, app.state.vision))
    result = client.get(f"/api/v1/recognitions/{job_id}")
    assert result.json()["status"] == status, result.text
    assert "private thinking" not in result.text
    assert client.get("/api/v1/stats").json()["mealCount"] == 0
    with TestClient(app, headers=HEADERS) as other:
        other.post("/api/v1/auth/register", json={"username": "user_c", "password": PASSWORD})
        assert other.get(f"/api/v1/recognitions/{job_id}").status_code == 404


def test_interrupted_job_is_recovered_and_limits_are_enforced(client, app):
    app.state.config.openai_base_url = "https://mock.invalid/v1"
    app.state.config.openai_api_key = "test-key"
    app.state.config.vision_model = "vision-test"
    photo = upload(client)
    response = client.post("/api/v1/recognitions", json={"photoIds": [photo["id"]]})
    job_id = response.json()["id"]
    with app.state.db() as db:
        job = db.get(RecognitionJob, job_id); job.status = "running"; job.lease_until = time.time() - 10
        db.commit()
    asyncio.run(process_one(app.state.db, app.state.config, app.state.vision))
    assert client.get(f"/api/v1/recognitions/{job_id}").json()["status"] == "failed"
    app.state.config.vision_daily_limit = 1
    assert client.post("/api/v1/recognitions", json={"photoIds": [photo["id"]]}).status_code == 429


def test_provider_errors_never_return_raw_credentials_or_response_data(client, app):
    app.state.config.openai_base_url = "https://mock.invalid/v1"
    app.state.config.openai_api_key = "test-key"
    app.state.config.vision_model = "vision-test"
    photo = upload(client)
    job_id = client.post("/api/v1/recognitions", json={"photoIds": [photo["id"]]}).json()["id"]
    class BrokenProvider:
        async def identify(self, paths):
            raise ValueError("private-provider-key-and-image-response")
    asyncio.run(process_one(app.state.db, app.state.config, BrokenProvider()))
    response = client.get(f"/api/v1/recognitions/{job_id}")
    assert response.json()["status"] == "failed"
    assert "private-provider" not in response.text


def test_upload_request_limit_and_logout(client):
    assert client.post("/api/v1/meals", content=b"x" * (2 * 1024 * 1024 + 1)).status_code == 413
    assert client.post("/api/v1/auth/logout", json={}).status_code == 200
    assert client.get("/api/v1/state").status_code == 401


def test_retention_keeps_saved_photos_and_active_recognition_inputs(client, app):
    saved, abandoned, pinned = upload(client), upload(client), upload(client)
    client.post("/api/v1/meals", json={"record": meal(photos=[saved])})
    with app.state.db() as db:
        user = db.scalar(select(User))
        for photo in db.scalars(select(Photo)):
            photo.created_at = time.time() - 8 * 86400
        db.add(RecognitionJob(id=str(uuid4()), user_id=user.id, photo_ids=[pinned["id"]], status="queued", created_at=time.time()))
        db.commit()
    cleanup(app.state.db, app.state.config)
    assert client.get(f"/api/v1/photos/{saved['id']}").status_code == 200
    assert client.get(f"/api/v1/photos/{pinned['id']}").status_code == 200
    assert client.get(f"/api/v1/photos/{abandoned['id']}").status_code == 404
    assert client.get("/api/v1/stats").json()["mealCount"] == 1

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
import hashlib
import logging
import secrets
import time
import warnings

from fastapi import Body, Depends, FastAPI, File, Form, HTTPException, Query, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from starlette.middleware.trustedhost import TrustedHostMiddleware
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import ValidationError

from .config import ROOT, Settings
from .domain import UserSettings, fail, iso, normalize_record, profile_data, statistics, uid, zone
from .models import Base, LoginSession, Meal, Photo, RateBucket, RecognitionJob, User, database
from .security import hash_password, token_hash, verify_password
from .vision import VisionService, worker

COOKIE = "meal_session"
log = logging.getLogger("meal.api")


class BodyLimit:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope["path"].startswith("/api/") or scope["method"] in ("GET", "HEAD", "OPTIONS"):
            return await self.app(scope, receive, send)
        limit = 13 * 1024 * 1024 if scope["path"] == "/api/v1/photos" else 2 * 1024 * 1024
        parts, size = [], 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            block = message.get("body", b"")
            size += len(block)
            if size > limit:
                return await JSONResponse({"detail": "上传内容过大"}, status_code=413)(scope, receive, send)
            parts.append(block)
            if not message.get("more_body"):
                break
        sent = False

        async def replay():
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": b"".join(parts), "more_body": False}
            return await receive()
        await self.app(scope, replay, send)


def migrate(engine):
    from alembic import command
    from alembic.config import Config
    cfg = Config(str(ROOT / "backend" / "alembic.ini"))
    cfg.set_main_option("script_location", str(ROOT / "backend" / "migrations"))
    with engine.begin() as connection:
        cfg.attributes["connection"] = connection
        command.upgrade(cfg, "head")


def create_app(config=None, *, run_worker=True, use_migrations=True, vision_client=None):
    config = config or Settings.from_env()
    config.media_root.mkdir(mode=0o700, parents=True, exist_ok=True)
    engine, factory = database(config.database_url)
    vision = VisionService(config, vision_client)

    @asynccontextmanager
    async def lifespan(app):
        if use_migrations:
            migrate(engine)
        else:
            Base.metadata.create_all(engine)
        task = asyncio.create_task(worker(factory, config, vision)) if run_worker else None
        yield
        if task:
            task.cancel()
            await task
        await vision.close()
        engine.dispose()

    app = FastAPI(title="今天吃什么 API", version="4.0.0", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
    app.state.config, app.state.db, app.state.vision, app.state.engine = config, factory, vision, engine
    app.add_middleware(BodyLimit)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(config.allowed_hosts))

    @app.middleware("http")
    async def boundary(request, call_next):
        started = time.monotonic()
        if request.url.path.startswith("/api/") and request.method not in ("GET", "HEAD", "OPTIONS"):
            origin = request.headers.get("origin")
            expected = f"{request.url.scheme}://{request.url.netloc}"
            if request.headers.get("X-Meal-Request") != "1" or (origin and origin != expected):
                return JSONResponse({"detail": "请求来源无效，请从应用页面重试"}, status_code=403)
        try:
            response = await call_next(request)
        except Exception as problem:
            log.error("request_failed type=%s", type(problem).__name__)
            response = JSONResponse({"detail": "服务暂时未能完成操作，当前输入会保留，请重试"}, status_code=500)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
            log.info("%s %s status=%s elapsed_ms=%d", request.method, request.scope.get("route", "api"), response.status_code, (time.monotonic() - started) * 1000)
        else:
            response.headers["Cache-Control"] = "no-cache"
        return response

    @app.exception_handler(RequestValidationError)
    @app.exception_handler(ValidationError)
    async def validation_error(request, exc):
        return JSONResponse({"detail": "填写内容格式不正确，请检查长度、必填项和选项"}, status_code=422)

    def db_session():
        with factory() as db:
            yield db

    def authenticated(request: Request, db=Depends(db_session)):
        value = request.cookies.get(COOKIE, "")
        session = db.get(LoginSession, token_hash(value)) if value else None
        if not session or session.expires_at <= time.time():
            fail("登录已过期，请重新登录", 401)
        user = db.get(User, session.user_id)
        if not user:
            fail("请重新登录", 401)
        return user

    def public_user(user):
        return {"id": user.id, "username": user.username}

    def records_for(db, user):
        return [row.record for row in db.scalars(select(Meal).where(Meal.user_id == user.id).order_by(Meal.eaten_at.desc().nullslast(), Meal.id))]

    def owned(db, cls, identifier, user):
        row = db.get(cls, identifier)
        if not row or row.user_id != user.id:
            fail("内容不存在或无权访问", 404)
        return row

    def session_cookie(db, user, response):
        token = secrets.token_urlsafe(32)
        lifetime = config.session_days * 86400
        db.add(LoginSession(token_hash=token_hash(token), user_id=user.id, expires_at=time.time() + lifetime))
        db.execute(delete(LoginSession).where(LoginSession.expires_at < time.time()))
        response.set_cookie(COOKIE, token, max_age=lifetime, httponly=True, secure=config.cookie_secure, samesite="strict", path="/api/")

    def rate_limit(db, request, category, maximum, seconds=600):
        now = time.time()
        ip = request.client.host if request.client else "unknown"
        key = f"{category}:{hashlib.sha256(ip.encode()).hexdigest()[:32]}:{int(now // seconds)}"
        # Upsert is handled with a savepoint so concurrent first requests cannot
        # create unlimited independent counters or roll back the caller's work.
        row = db.get(RateBucket, key)
        if not row:
            try:
                with db.begin_nested():
                    db.add(RateBucket(key=key, count=0, expires_at=now + seconds * 2))
                    db.flush()
            except IntegrityError:
                pass
        db.execute(update(RateBucket).where(RateBucket.key == key).values(count=RateBucket.count + 1))
        db.execute(delete(RateBucket).where(RateBucket.expires_at < now))
        db.commit()
        db.expire_all()
        if db.get(RateBucket, key).count > maximum:
            fail("尝试次数较多，请稍后再试", 429)

    @app.get("/api/v1/health")
    def health(db=Depends(db_session)):
        db.execute(select(1))
        return {"service": "meal-web", "version": "4.0.0", "photoRecognition": config.vision_enabled}

    @app.post("/api/v1/auth/{action}")
    def login(action: str, request: Request, response: Response, body: dict = Body(default={}), db=Depends(db_session)):
        if action == "logout":
            value = request.cookies.get(COOKIE, "")
            db.execute(delete(LoginSession).where(LoginSession.token_hash == token_hash(value)))
            db.commit()
            response.delete_cookie(COOKIE, path="/api/", secure=config.cookie_secure, httponly=True, samesite="strict")
            return {"ok": True}
        if action not in ("login", "register"):
            fail("接口不存在", 404)
        rate_limit(db, request, "auth", 20)
        username, password = body.get("username", ""), body.get("password", "")
        import re
        if not isinstance(username, str) or not re.fullmatch(r"[a-zA-Z0-9_]{3,32}", username) or not isinstance(password, str) or not 10 <= len(password) <= 128:
            fail("账号使用 3～32 位字母、数字或下划线，密码使用 10～128 字")
        username = username.lower()
        user = db.scalar(select(User).where(User.username == username))
        if action == "register":
            if user:
                fail("这个账号已被使用", 409)
            user = User(id=uid(), username=username, password_hash=hash_password(password), settings=UserSettings().model_dump(), knowledge_history={}, created_at=time.time())
            db.add(user)
            try:
                db.flush()
            except IntegrityError:
                db.rollback()
                fail("这个账号已被使用", 409)
        elif not user or not verify_password(password, user.password_hash):
            # Equalize password work for unknown accounts.
            if not user:
                hash_password(password)
            fail("账号或密码不正确", 401)
        old = request.cookies.get(COOKIE)
        if old:
            db.execute(delete(LoginSession).where(LoginSession.token_hash == token_hash(old)))
        session_cookie(db, user, response)
        db.commit()
        return {"user": public_user(user)}

    @app.get("/api/v1/state")
    def state(tz: str = "Asia/Shanghai", user=Depends(authenticated), db=Depends(db_session)):
        records = records_for(db, user)
        return {"user": public_user(user), "profile": user.profile, "settings": user.settings, "version": user.version,
                "records": records, "stats": statistics(records, tz), "knowledgeHistory": user.knowledge_history,
                "importKeys": list(db.scalars(select(Meal.import_key).where(Meal.user_id == user.id, Meal.import_key.is_not(None)))),
                "capabilities": {"photoRecognition": config.vision_enabled}}

    @app.put("/api/v1/preferences")
    def preferences(body: dict, user=Depends(authenticated), db=Depends(db_session)):
        values = {"version": User.version + 1}
        if "profile" in body:
            values["profile"] = profile_data(body["profile"])
        if "settings" in body:
            values["settings"] = UserSettings.model_validate(body["settings"]).model_dump()
        changed = db.execute(update(User).where(User.id == user.id, User.version == body.get("expectedVersion")).values(**values))
        if not changed.rowcount:
            fail("资料已在其他页面更新，请刷新后重试", 409)
        db.commit()
        db.refresh(user)
        return {"profile": user.profile, "settings": user.settings, "version": user.version}

    @app.put("/api/v1/knowledge-history")
    def knowledge_history(body: dict, user=Depends(authenticated), db=Depends(db_session)):
        # Only small presentation IDs are persisted, never arbitrary client data.
        import json
        if len(json.dumps(body)) > 5000:
            fail("展示记录过长")
        user.knowledge_history = body
        db.commit()
        return {"ok": True}

    def save_record(db, user, data, existing=None, allow_undated=False, import_key=None):
        record, stamp = normalize_record(data, existing.record if existing else None, allow_undated)
        identifier = existing.id if existing else uid(data.get("id"))
        photo_rows = [owned(db, Photo, p["id"], user) for p in record["photos"]]
        if any(p.meal_id and p.meal_id != identifier for p in photo_rows):
            fail("照片已用于其他记录，请重新上传")
        now = iso(time.time())
        revision = existing.revision + 1 if existing else 1
        record.update(id=identifier, revision=revision, createdAt=existing.record["createdAt"] if existing else now, updatedAt=now)
        record["photos"] = [photo_meta(p) for p in photo_rows]
        if existing:
            changed = db.execute(update(Meal).where(Meal.id == identifier, Meal.user_id == user.id, Meal.revision == existing.revision)
                                 .values(record=record, eaten_at=stamp, revision=revision))
            if not changed.rowcount:
                fail("这条记录已被更新，请返回查看最新内容", 409)
        else:
            if db.get(Meal, identifier):
                fail("记录标识已存在，请返回查看", 409)
            if db.scalar(select(func.count()).select_from(Meal).where(Meal.user_id == user.id)) >= 10000:
                fail("已达到当前账号的记录容量", 409)
            db.add(Meal(id=identifier, user_id=user.id, record=record, eaten_at=stamp, revision=revision, import_key=import_key))
            db.flush()
        db.execute(update(Photo).where(Photo.meal_id == identifier, Photo.user_id == user.id).values(meal_id=None))
        for photo in photo_rows:
            photo.meal_id = identifier
        db.flush()
        return record

    @app.post("/api/v1/meals")
    def create_meal(body: dict, user=Depends(authenticated), db=Depends(db_session)):
        data = body.get("record")
        record_data, _ = normalize_record(data)
        existing = db.get(Meal, uid(data.get("id"))) if data.get("id") else None
        if existing:
            if existing.user_id != user.id:
                fail("记录标识已存在，请返回查看", 409)
            saved = {key: existing.record.get(key) for key in record_data}
            saved["photos"] = [{"id": p["id"]} for p in saved["photos"]]
            if saved != record_data:
                fail("这条记录已保存，请返回最近饮食查看后再修改", 409)
            return {"record": existing.record}
        record = save_record(db, user, data)
        db.commit()
        return {"record": record}

    @app.put("/api/v1/meals/{identifier}")
    def edit_meal(identifier: str, body: dict, user=Depends(authenticated), db=Depends(db_session)):
        existing = owned(db, Meal, identifier, user)
        if existing.revision != body.get("expectedRevision"):
            fail("这条记录已被更新，请返回查看最新内容", 409)
        record = save_record(db, user, body.get("record"), existing)
        db.commit()
        return {"record": record}

    @app.delete("/api/v1/meals/{identifier}")
    def delete_meal(identifier: str, revision: int, user=Depends(authenticated), db=Depends(db_session)):
        meal = owned(db, Meal, identifier, user)
        if revision != meal.revision:
            fail("这条记录已被更新，请刷新后重试", 409)
        deleted = db.execute(delete(Meal).where(Meal.id == identifier, Meal.user_id == user.id, Meal.revision == revision))
        if not deleted.rowcount:
            fail("这条记录已被更新，请刷新后重试", 409)
        db.commit()
        return {"ok": True}

    @app.get("/api/v1/meals/{identifier}")
    def meal_detail(identifier: str, user=Depends(authenticated), db=Depends(db_session)):
        return {"record": owned(db, Meal, identifier, user).record}

    @app.get("/api/v1/meals")
    def meals(year: str = "", month: int | None = Query(default=None, ge=1, le=12), day: int | None = Query(default=None, ge=1, le=31),
              offset: int = Query(default=0, ge=0), limit: int = Query(default=20, ge=1, le=100), tz: str = "Asia/Shanghai", user=Depends(authenticated), db=Depends(db_session)):
        local = zone(tz)
        if year and year != "unknown" and (not year.isdigit() or not 1900 <= int(year) <= 9999):
            fail("年份格式不正确")
        records = records_for(db, user)
        def matches(record):
            if year == "unknown":
                return not record["eatenAt"]
            if not record["eatenAt"]:
                return not (year or month or day)
            dt = datetime.fromisoformat(record["eatenAt"].replace("Z", "+00:00")).astimezone(local)
            return (not year or dt.year == int(year)) and (not month or dt.month == month) and (not day or dt.day == day)
        filtered = [r for r in records if matches(r)]
        return {"items": filtered[offset:offset + limit], "total": len(filtered), "nextOffset": offset + limit if offset + limit < len(filtered) else None}

    @app.get("/api/v1/stats")
    def stats(tz: str = "Asia/Shanghai", user=Depends(authenticated), db=Depends(db_session)):
        return statistics(records_for(db, user), tz)

    def photo_meta(photo):
        return {"id": photo.id, "name": photo.name, "mimeType": "image/jpeg", "size": photo.size, "width": photo.width, "height": photo.height}

    @app.post("/api/v1/photos")
    def upload_photo(file: UploadFile = File(...), id: str = Form(...), user=Depends(authenticated), db=Depends(db_session)):
        identifier = uid(id)
        raw = file.file.read(12 * 1024 * 1024 + 1)
        if len(raw) > 12 * 1024 * 1024:
            fail("每张照片请小于 12 MB", 413)
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(BytesIO(raw)) as source:
                    if source.format not in ("JPEG", "PNG", "WEBP") or source.width * source.height > 24_000_000:
                        fail("请选择大小合适的 JPG、PNG 或 WebP 图片")
                    image = ImageOps.exif_transpose(source).convert("RGB")
                    image.thumbnail((1600, 1600))
                    output = BytesIO()
                    image.save(output, format="JPEG", quality=86)
                    encoded = output.getvalue()
        except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombWarning, Image.DecompressionBombError):
            fail("这张照片暂时无法打开，请换一张图片")
        digest = hashlib.sha256(encoded).hexdigest()
        existing = db.get(Photo, identifier)
        if existing:
            if existing.user_id != user.id or existing.digest != digest:
                fail("照片标识已存在，请重新选择", 409)
            return photo_meta(existing)
        used = db.scalar(select(func.coalesce(func.sum(Photo.size), 0)).where(Photo.user_id == user.id))
        if used + len(encoded) > config.media_quota_bytes:
            fail("照片空间已满，请联系管理员扩容", 409)
        photo = Photo(id=identifier, user_id=user.id, name=(file.filename or "餐食照片")[:200], size=len(encoded),
                      width=image.width, height=image.height, digest=digest, created_at=time.time())
        target = config.media_root / f"{identifier}.jpg"
        wrote = False
        try:
            with target.open("xb") as out:
                wrote = True
                out.write(encoded)
            db.add(photo)
            db.commit()
        except Exception:
            db.rollback()
            # Exclusive creation prevents another upload from replacing a file.
            if wrote and not db.get(Photo, identifier):
                target.unlink(missing_ok=True)
            raise
        return photo_meta(photo)

    @app.get("/api/v1/photos/{identifier}")
    def read_photo(identifier: str, user=Depends(authenticated), db=Depends(db_session)):
        photo = owned(db, Photo, identifier, user)
        path = config.media_root / f"{photo.id}.jpg"
        if not path.is_file():
            fail("照片暂时无法读取", 404)
        return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "no-store"})

    @app.delete("/api/v1/photos/{identifier}")
    def remove_photo(identifier: str, user=Depends(authenticated), db=Depends(db_session)):
        photo = owned(db, Photo, identifier, user)
        if photo.meal_id:
            fail("照片仍用于餐食记录，请先保存对餐食的修改", 409)
        jobs = db.scalars(select(RecognitionJob).where(RecognitionJob.user_id == user.id, RecognitionJob.status.in_(["queued", "running"])))
        if any(identifier in job.photo_ids for job in jobs):
            fail("照片正在识别，请完成后重试", 409)
        db.delete(photo)
        db.commit()
        (config.media_root / f"{photo.id}.jpg").unlink(missing_ok=True)
        return {"ok": True}

    @app.post("/api/v1/recognitions", status_code=202)
    def recognition(body: dict, user=Depends(authenticated), db=Depends(db_session)):
        if not config.vision_enabled:
            fail("照片识别暂未启用，请手动填写菜名和标签", 503)
        ids = body.get("photoIds")
        if not isinstance(ids, list) or not 1 <= len(ids) <= 4 or any(not isinstance(x, str) for x in ids) or len(set(ids)) != len(ids):
            fail("请选择 1～4 张照片")
        for identifier in ids:
            owned(db, Photo, uid(identifier), user)
        active = list(db.scalars(select(RecognitionJob).where(RecognitionJob.user_id == user.id, RecognitionJob.status.in_(["queued", "running"]))))
        same = next((job for job in active if set(job.photo_ids) == set(ids)), None)
        if same:
            return {"id": same.id, "status": same.status}
        if len(active) >= 3:
            fail("还有照片正在识别，请稍后再试", 429)
        date = datetime.now(zone("Asia/Shanghai"))
        budget_key = f"vision:{user.id}:{date.date().isoformat()}"
        if not db.get(RateBucket, budget_key):
            try:
                with db.begin_nested():
                    db.add(RateBucket(key=budget_key, count=0, expires_at=time.time() + 172800))
                    db.flush()
            except IntegrityError:
                pass
        reserved = db.execute(update(RateBucket).where(RateBucket.key == budget_key, RateBucket.count < config.vision_daily_limit)
                              .values(count=RateBucket.count + 1))
        if not reserved.rowcount:
            fail("今天的识别次数已用完，可以继续手动记录", 429)
        job = RecognitionJob(id=uid(), user_id=user.id, photo_ids=ids, status="queued", created_at=time.time(), lease_until=0)
        db.add(job)
        db.commit()
        return {"id": job.id, "status": job.status}

    @app.get("/api/v1/recognitions/{identifier}")
    def recognition_status(identifier: str, user=Depends(authenticated), db=Depends(db_session)):
        job = owned(db, RecognitionJob, identifier, user)
        return {"id": job.id, "status": job.status, "result": job.result, "error": job.error}

    @app.post("/api/v1/import")
    def import_local(body: dict, user=Depends(authenticated), db=Depends(db_session)):
        if body.get("expectedUserId", user.id) != user.id:
            fail("当前账号已切换，请核对账号后重新导入", 409)
        entries = body.get("records", [])
        if not isinstance(entries, list) or len(entries) > 200:
            fail("每次最多导入 200 条记录")
        include_samples = body.get("includeSamples", False)
        if not isinstance(include_samples, bool):
            fail("示例记录选项格式不正确")
        imported = skipped = 0
        for entry in entries:
            if not isinstance(entry, dict):
                fail("记录格式不正确")
            if not include_samples and (entry.get("source") == "fictional-mixed-dining-sample" or str(entry.get("id", "")).startswith("diary-sample-")):
                skipped += 1
                continue
            key = str(entry.get("id", ""))
            if not key or len(key) > 200:
                fail("旧记录缺少有效标识，未执行导入")
            if db.scalar(select(Meal).where(Meal.user_id == user.id, Meal.import_key == key)):
                skipped += 1
                continue
            save_record(db, user, {**entry, "id": uid(), "originalSource": entry.get("originalSource") or entry.get("source")}, allow_undated=True, import_key=key)
            imported += 1
        if "profile" in body and user.profile is None:
            user.profile = profile_data(body["profile"])
            user.version += 1
        db.commit()
        return {"imported": imported, "skipped": skipped}

    app.mount("/", StaticFiles(directory=ROOT / "dist", html=True), name="frontend")
    return app

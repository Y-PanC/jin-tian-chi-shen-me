"""Retention for abandoned uploads and finished jobs; saved meals are untouched."""
import time
from uuid import UUID
from sqlalchemy import delete, select
from .models import LoginSession, Photo, RateBucket, RecognitionJob


def cleanup(factory, config):
    now = time.time()
    with factory() as db:
        active = set()
        for job in db.scalars(select(RecognitionJob).where(RecognitionJob.status.in_(["queued", "running"]))):
            active.update(job.photo_ids)
        abandoned = list(db.scalars(select(Photo).where(Photo.meal_id.is_(None), Photo.created_at < now - 7 * 86400)))
        removed = []
        for photo in abandoned:
            if photo.id not in active:
                db.delete(photo)
                removed.append(photo.id)
        db.execute(delete(RecognitionJob).where(RecognitionJob.created_at < now - 30 * 86400, RecognitionJob.status.in_(["succeeded", "failed"])))
        db.execute(delete(LoginSession).where(LoginSession.expires_at < now))
        db.execute(delete(RateBucket).where(RateBucket.expires_at < now))
        db.commit()
        for identifier in removed:
            (config.media_root / f"{identifier}.jpg").unlink(missing_ok=True)
        for path in config.media_root.glob("*.jpg"):
            try:
                identifier = str(UUID(path.stem))
            except ValueError:
                continue
            if path.stat().st_mtime < now - 7 * 86400 and not db.get(Photo, identifier):
                path.unlink(missing_ok=True)

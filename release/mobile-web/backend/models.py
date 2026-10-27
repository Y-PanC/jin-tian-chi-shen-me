from sqlalchemy import JSON, Float, ForeignKey, Index, Integer, String, UniqueConstraint, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    username: Mapped[str] = mapped_column(String(32), unique=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    profile: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    knowledge_history: Mapped[dict] = mapped_column(JSON, default=dict)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[float] = mapped_column(Float)


class LoginSession(Base):
    __tablename__ = "login_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[float] = mapped_column(Float, index=True)


class Meal(Base):
    __tablename__ = "meals"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    record: Mapped[dict] = mapped_column(JSON)
    eaten_at: Mapped[float | None] = mapped_column(Float, nullable=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    import_key: Mapped[str | None] = mapped_column(String(200), nullable=True)
    __table_args__ = (
        Index("ix_meals_owner_time", "user_id", "eaten_at", "id"),
        UniqueConstraint("user_id", "import_key", name="uq_meals_owner_import"),
    )


class Photo(Base):
    __tablename__ = "photos"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    meal_id: Mapped[str | None] = mapped_column(ForeignKey("meals.id", ondelete="SET NULL"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    size: Mapped[int] = mapped_column(Integer)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    digest: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[float] = mapped_column(Float)


class RecognitionJob(Base):
    __tablename__ = "recognition_jobs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    photo_ids: Mapped[list] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(16), default="queued", index=True)
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(String(200), nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    lease_until: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[float] = mapped_column(Float, index=True)


class RateBucket(Base):
    __tablename__ = "rate_buckets"
    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[float] = mapped_column(Float, index=True)


def database(url):
    engine = create_engine(url, connect_args={"check_same_thread": False, "timeout": 20} if url.startswith("sqlite") else {}, pool_pre_ping=True)
    if url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def sqlite_setup(conn, _):
            conn.execute("PRAGMA foreign_keys=ON")
            conn.execute("PRAGMA journal_mode=WAL")
    return engine, sessionmaker(engine, expire_on_commit=False)

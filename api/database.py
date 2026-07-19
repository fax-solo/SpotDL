import os
import json
import secrets
import bcrypt
import logging
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

logger = logging.getLogger(__name__)

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{os.path.join(DATA_DIR, 'sinc.db')}")

def _make_async_url(url: str) -> str:
    if url.startswith("sqlite://"):
        return url.replace("sqlite://", "sqlite+aiosqlite://", 1)
    if url.startswith("postgresql://"):
        if "+" not in url:
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url
    if url.startswith("mysql://") and "+" not in url:
        return url.replace("mysql://", "mysql+aiomysql://", 1)
    return url

_ASYNC_DATABASE_URL = _make_async_url(DATABASE_URL)
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite://") else {}

engine = create_async_engine(_ASYNC_DATABASE_URL, echo=False, connect_args=_connect_args)
SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

SECRETS_FILE = os.path.join(DATA_DIR, "secrets.json")
if os.path.exists(SECRETS_FILE):
    with open(SECRETS_FILE) as f:
        _stored = json.load(f)
else:
    _stored = {}
    os.makedirs(os.path.dirname(SECRETS_FILE), exist_ok=True)

JWT_SECRET = os.environ.get("JWT_SECRET") or _stored.get("jwt_secret")
if not JWT_SECRET:
    JWT_SECRET = secrets.token_hex(32)
    print("WARNING: JWT_SECRET not set. Auto-generated (changes on restart, invalidates all tokens). Set JWT_SECRET env var in production.")
if "jwt_secret" not in _stored:
    _stored["jwt_secret"] = JWT_SECRET
    tmp = SECRETS_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(_stored, f)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, SECRETS_FILE)

ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")


class Base(DeclarativeBase):
    pass


async def get_db():
    async with SessionLocal() as db:
        yield db


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


async def _seed_admin():
    from models import User
    from sqlalchemy import select
    async with SessionLocal() as db:
        try:
            if ADMIN_USERNAME and ADMIN_PASSWORD:
                result = await db.execute(select(User).where(User.username == ADMIN_USERNAME))
                existing = result.scalar_one_or_none()
                if not existing:
                    admin = User(
                        username=ADMIN_USERNAME,
                        display_name="Admin",
                        role="admin",
                        auth_provider="email",
                        password_hash=_hash_password(ADMIN_PASSWORD),
                    )
                    db.add(admin)
                    await db.commit()
                    print(f"Admin user '{ADMIN_USERNAME}' created")
                else:
                    existing.role = "admin"
                    await db.commit()
        except Exception as e:
            logger.warning("Admin seed failed: %s", e)


async def init_db():
    try:
        async with engine.connect() as conn:
            await conn.exec_driver_sql("PRAGMA journal_mode=WAL")
            await conn.exec_driver_sql("PRAGMA synchronous=NORMAL")
            await conn.exec_driver_sql("PRAGMA busy_timeout=5000")
    except Exception:
        pass
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _seed_admin()

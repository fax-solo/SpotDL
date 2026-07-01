import os
import json
import secrets
import bcrypt
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{os.path.join(DATA_DIR, 'sinc.db')}")
_ASYNC_DATABASE_URL = DATABASE_URL.replace("sqlite://", "sqlite+aiosqlite://", 1)

engine = create_async_engine(_ASYNC_DATABASE_URL, echo=False)
SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

SECRETS_FILE = os.path.join(DATA_DIR, "secrets.json")
if os.path.exists(SECRETS_FILE):
    with open(SECRETS_FILE) as f:
        _stored = json.load(f)
else:
    _stored = {}
    os.makedirs(os.path.dirname(SECRETS_FILE), exist_ok=True)

JWT_SECRET = os.environ.get("JWT_SECRET") or _stored.get("jwt_secret") or secrets.token_hex(32)
if not os.environ.get("JWT_SECRET"):
    print("WARNING: JWT_SECRET not set via environment. Using file-based fallback. Set JWT_SECRET env var in production.")
if "jwt_secret" not in _stored:
    _stored["jwt_secret"] = JWT_SECRET
    with open(SECRETS_FILE, "w") as f:
        json.dump(_stored, f)

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
            print(f"Admin seed: {e}")


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _seed_admin()

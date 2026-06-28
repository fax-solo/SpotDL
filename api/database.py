import os
import secrets
import hashlib
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{os.path.join(DATA_DIR, 'sinc.db')}")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {})
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

JWT_SECRET = os.environ.get("JWT_SECRET") or secrets.token_hex(32)
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "mohamed baalash")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", '50112010***Solo')


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _hash_password(password: str) -> str:
    return hashlib.sha256((password + JWT_SECRET).encode()).hexdigest()


def init_db():
    Base.metadata.create_all(bind=engine)

    # Seed default admin
    from models import User
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == ADMIN_USERNAME).first()
        if not existing:
            admin = User(
                username=ADMIN_USERNAME,
                display_name="Admin",
                role="admin",
                auth_provider="email",
                password_hash=_hash_password(ADMIN_PASSWORD),
            )
            db.add(admin)
            db.commit()
            print(f"Admin user '{ADMIN_USERNAME}' created")
        else:
            existing.role = "admin"
            db.commit()
    except Exception as e:
        print(f"Admin seed: {e}")
    finally:
        db.close()

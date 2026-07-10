import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Boolean, DateTime, Text, Float, ForeignKey, BigInteger, BigInteger
from sqlalchemy.orm import relationship
from database import Base


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _uuid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=_uuid)
    username = Column(String(100), unique=True, nullable=True)
    email = Column(String(255), unique=True, nullable=True)
    password_hash = Column(String(255), nullable=True)
    display_name = Column(String(100), nullable=True)
    avatar_path = Column(String(500), nullable=True)
    auth_provider = Column(String(20), default="email")
    google_id = Column(String(255), unique=True, nullable=True)
    role = Column(String(20), default="user")
    is_guest = Column(Boolean, default=False)
    device_id = Column(String(255), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, index=True)
    last_active = Column(DateTime(timezone=True), default=_utcnow, index=True)
    is_active = Column(Boolean, default=True, index=True)

    history = relationship("HistoryEntry", back_populates="user", cascade="all, delete-orphan")


class HistoryEntry(Base):
    __tablename__ = "history"

    id = Column(String(36), primary_key=True, default=_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(500), nullable=False)
    artist = Column(String(500), nullable=False)
    album = Column(String(500), default="Unknown Album")
    artwork_url = Column(String(2000), nullable=True)
    duration_ms = Column(Integer, nullable=True)
    timestamp = Column(BigInteger, default=lambda: int(datetime.now(timezone.utc).timestamp() * 1000), index=True)
    isrc = Column(String(50), nullable=True)

    user = relationship("User", back_populates="history")


class DownloadLog(Base):
    __tablename__ = "download_logs"

    id = Column(String(36), primary_key=True, default=_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    track_title = Column(String(500))
    track_artist = Column(String(500))
    quality = Column(String(10))
    source = Column(String(50), index=True)
    timestamp = Column(DateTime(timezone=True), default=_utcnow, index=True)
    is_guest = Column(Boolean, default=False, index=True)


class TokenBlacklist(Base):
    __tablename__ = "token_blacklist"

    jti = Column(String(64), primary_key=True)
    expires_at = Column(BigInteger, nullable=False, index=True)

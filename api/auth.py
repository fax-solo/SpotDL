import os
import uuid
import json
import base64
import hmac
import hashlib
import secrets
import bcrypt
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Query, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, EmailStr
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from slowapi import Limiter
from slowapi.util import get_remote_address

from database import get_db, JWT_SECRET
from models import User, HistoryEntry, DownloadLog, _utcnow

_auth_limiter = Limiter(key_func=get_remote_address)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
AVATAR_DIR = os.path.join(DATA_DIR, "avatars")
os.makedirs(AVATAR_DIR, exist_ok=True)

JWT_EXPIRY_HOURS = 72

security = HTTPBearer(auto_error=False)


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_password(password: str, stored_hash: str) -> bool:
    if stored_hash.startswith("$2b$") or stored_hash.startswith("$2a$"):
        return bcrypt.checkpw(password.encode(), stored_hash.encode())
    expected = hashlib.sha256((password + JWT_SECRET).encode()).hexdigest()
    return secrets.compare_digest(stored_hash, expected)


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _create_token_sig(data: str) -> str:
    return hmac.new(JWT_SECRET.encode(), data.encode(), hashlib.sha256).hexdigest()


def _verify_token_sig(data: str, sig: str) -> bool:
    expected = _create_token_sig(data)
    return secrets.compare_digest(expected, sig)


def _create_token(user_id: str) -> str:
    now = int(datetime.now(timezone.utc).timestamp())
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = _b64(json.dumps({
        "sub": user_id,
        "iss": "sinc-api",
        "iat": now,
        "exp": now + JWT_EXPIRY_HOURS * 3600,
        "jti": uuid.uuid4().hex,
    }).encode())
    sig = _create_token_sig(f"{header}.{payload}")
    return f"{header}.{payload}.{sig}"


def _verify_token(token: str) -> str | None:
    parts = token.split(":")
    if len(parts) in (3, 4):
        return _verify_legacy_token(parts)

    parts = token.split(".")
    if len(parts) != 3:
        return None
    header_b64, payload_b64, sig = parts
    try:
        payload_raw = base64.urlsafe_b64decode(payload_b64 + "==")
        payload = json.loads(payload_raw)
    except Exception:
        return None

    if not _verify_token_sig(f"{header_b64}.{payload_b64}", sig):
        return None

    exp = payload.get("exp")
    if exp and int(exp) < datetime.now(timezone.utc).timestamp():
        return None

    return payload.get("sub")


def _verify_legacy_token(parts: list[str]) -> str | None:
    if len(parts) == 4:
        user_id, expiry_ts, _jti, sig = parts
        check_data = f"{user_id}:{expiry_ts}:{_jti}"
    elif len(parts) == 3:
        user_id, expiry_ts, sig = parts
        check_data = f"{user_id}:{expiry_ts}"
    else:
        return None

    check = hashlib.sha256((check_data + JWT_SECRET).encode()).hexdigest()
    if not secrets.compare_digest(sig, check):
        return None
    if int(expiry_ts) < datetime.now(timezone.utc).timestamp():
        return None
    return user_id


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = _verify_token(credentials.credentials)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or disabled")
    user.last_active = _utcnow()
    await db.commit()
    return user


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    if not credentials:
        return None
    user_id = _verify_token(credentials.credentials)
    if not user_id:
        return None
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        return None
    return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ─── Schemas ───

class SignUpRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=128)
    display_name: str | None = Field(default=None, max_length=100)
    username: str | None = Field(default=None, max_length=100)


class LoginRequest(BaseModel):
    login: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class GoogleAuthRequest(BaseModel):
    id_token: str = Field(min_length=1)
    display_name: str | None = Field(default=None, max_length=100)


class GuestRequest(BaseModel):
    device_id: str = Field(min_length=1, max_length=255)


class UpdateProfileRequest(BaseModel):
    display_name: str | None = Field(default=None, max_length=100)


class UpdateHistoryRequest(BaseModel):
    title: str = Field(max_length=500)
    artist: str = Field(max_length=500)
    album: str = Field(default="Unknown Album", max_length=500)
    artwork_url: str | None = Field(default=None, max_length=2000)
    duration_ms: int | None = None
    isrc: str | None = Field(default=None, max_length=50)


class DeleteHistoryRequest(BaseModel):
    history_id: str


# ─── Helpers ───

def _user_response(user: User, token: str) -> dict:
    return {
        "token": token,
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "display_name": user.display_name,
            "avatar_url": _avatar_url(user.avatar_path),
            "role": user.role,
            "auth_provider": user.auth_provider,
            "is_guest": user.is_guest,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "last_active": user.last_active.isoformat() if user.last_active else None,
        },
    }


# ─── Endpoints ───

@router.post("/signup")
@_auth_limiter.limit("10/minute")
async def signup(request: Request, body: SignUpRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(
            (User.email == body.email) | ((User.username != None) & (User.username == body.username))
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email or username already registered")

    if body.username:
        result = await db.execute(select(User).where(User.username == body.username))
        if result.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Username already taken")

    user = User(
        email=body.email,
        username=body.username or None,
        password_hash=_hash_password(body.password),
        display_name=body.display_name or body.username or body.email.split("@")[0],
        auth_provider="email",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = _create_token(user.id)
    return _user_response(user, token)


@router.post("/login")
@_auth_limiter.limit("20/minute")
async def login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where((User.email == body.login) | (User.username == body.login))
    )
    user = result.scalar_one_or_none()
    if not user or not user.password_hash or not _verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username/email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    if user.password_hash and not user.password_hash.startswith("$2b$") and not user.password_hash.startswith("$2a$"):
        user.password_hash = _hash_password(body.password)

    user.last_active = _utcnow()
    await db.commit()

    token = _create_token(user.id)
    return _user_response(user, token)


@router.post("/google")
@_auth_limiter.limit("10/minute")
async def google_auth(request: Request, body: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    import requests as req

    try:
        resp = req.get(
            f"https://oauth2.googleapis.com/tokeninfo?id_token={body.id_token}",
            timeout=10,
        )
        if not resp.ok:
            raise HTTPException(status_code=401, detail="Invalid Google token")
        info = resp.json()
        google_id = info.get("sub")
        email = info.get("email")
        name = body.display_name or info.get("name", email.split("@")[0])
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="Google verification failed")

    result = await db.execute(
        select(User).where((User.google_id == google_id) | (User.email == email))
    )
    user = result.scalar_one_or_none()

    if user:
        if not user.is_active:
            raise HTTPException(status_code=403, detail="Account disabled")
        user.last_active = _utcnow()
        if not user.google_id:
            user.google_id = google_id
        if not user.avatar_path:
            picture = info.get("picture")
            if picture:
                user.avatar_path = await _save_google_avatar(picture, user.id)
        await db.commit()
        await db.refresh(user)
    else:
        picture = info.get("picture")
        avatar_path = await _save_google_avatar(picture, email) if picture else None
        user = User(
            email=email,
            display_name=name,
            google_id=google_id,
            auth_provider="google",
            avatar_path=avatar_path,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    token = _create_token(user.id)
    return _user_response(user, token)


async def _save_google_avatar(picture_url: str, ident: str) -> str:
    import requests as req
    try:
        resp = req.get(picture_url, timeout=10)
        if resp.ok:
            ext = "jpg"
            filename = f"{ident}_{uuid.uuid4().hex[:8]}.{ext}"
            path = os.path.join(AVATAR_DIR, filename)
            with open(path, "wb") as f:
                f.write(resp.content)
            return filename
    except Exception:
        pass
    return None


@router.post("/guest")
@_auth_limiter.limit("10/minute")
async def guest_login(request: Request, body: GuestRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(User.is_guest == True, User.device_id == body.device_id)
    )
    user = result.scalar_one_or_none()

    if user:
        if not user.is_active:
            raise HTTPException(status_code=403, detail="Account disabled")
        user.last_active = _utcnow()
        await db.commit()
        await db.refresh(user)
    else:
        result = await db.execute(select(User).where(User.device_id == body.device_id))
        existing = result.scalar_one_or_none()
        if existing:
            user = existing
            user.last_active = _utcnow()
            user.is_guest = True
            await db.commit()
            await db.refresh(user)
        else:
            user = User(
                display_name=f"Guest_{body.device_id[:8]}",
                is_guest=True,
                device_id=body.device_id,
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)

    token = _create_token(user.id)
    resp = _user_response(user, token)
    resp["user"]["is_guest"] = True
    return resp


@router.get("/me")
async def get_me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "display_name": user.display_name,
        "avatar_url": _avatar_url(user.avatar_path),
        "role": user.role,
        "auth_provider": user.auth_provider,
        "is_guest": user.is_guest,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_active": user.last_active.isoformat() if user.last_active else None,
    }


@router.put("/profile")
async def update_profile(
    body: UpdateProfileRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.display_name is not None:
        user.display_name = body.display_name
    await db.commit()
    return {
        "id": user.id,
        "display_name": user.display_name,
        "avatar_url": _avatar_url(user.avatar_path),
    }


@router.post("/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    ext = os.path.splitext(file.filename or "avatar.jpg")[1] or ".jpg"
    filename = f"{user.id}_{uuid.uuid4().hex[:8]}{ext}"
    path = os.path.join(AVATAR_DIR, filename)

    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")

    if user.avatar_path:
        old_path = os.path.join(AVATAR_DIR, user.avatar_path)
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except Exception:
                pass

    with open(path, "wb") as f:
        f.write(contents)

    user.avatar_path = filename
    await db.commit()

    return {"avatar_url": _avatar_url(filename)}


@router.get("/history")
async def get_history(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
):
    result = await db.execute(
        select(HistoryEntry)
        .where(HistoryEntry.user_id == user.id)
        .order_by(HistoryEntry.timestamp.desc())
        .offset(offset)
        .limit(limit)
    )
    entries = result.scalars().all()

    count_result = await db.execute(
        select(func.count()).select_from(HistoryEntry).where(HistoryEntry.user_id == user.id)
    )
    total = count_result.scalar()

    return {
        "entries": [
            {
                "id": e.id,
                "title": e.title,
                "artist": e.artist,
                "album": e.album,
                "artwork_url": e.artwork_url,
                "duration_ms": e.duration_ms,
                "timestamp": e.timestamp,
                "isrc": e.isrc,
            }
            for e in entries
        ],
        "total": total or 0,
    }


@router.post("/history")
async def add_history(
    body: UpdateHistoryRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    entry = HistoryEntry(
        user_id=user.id,
        title=body.title,
        artist=body.artist,
        album=body.album,
        artwork_url=body.artwork_url,
        duration_ms=body.duration_ms,
        isrc=body.isrc,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return {
        "id": entry.id,
        "title": entry.title,
        "artist": entry.artist,
        "album": entry.album,
        "artwork_url": entry.artwork_url,
        "duration_ms": entry.duration_ms,
        "timestamp": entry.timestamp,
        "isrc": entry.isrc,
    }


@router.delete("/history/{history_id}")
async def delete_history(
    history_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(HistoryEntry).where(
            HistoryEntry.id == history_id,
            HistoryEntry.user_id == user.id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="History entry not found")
    await db.delete(entry)
    await db.commit()
    return {"ok": True}


@router.delete("/history")
async def clear_history(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(delete(HistoryEntry).where(HistoryEntry.user_id == user.id))
    await db.commit()
    return {"ok": True}


def _avatar_url(avatar_path: str | None) -> str | None:
    if not avatar_path:
        return None
    return f"/api/avatars/{avatar_path}"

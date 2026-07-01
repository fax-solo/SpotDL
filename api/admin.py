import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User, DownloadLog
from auth import require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


async def _count(db: AsyncSession, model, *filters) -> int:
    stmt = select(func.count()).select_from(model)
    if filters:
        stmt = stmt.where(*filters)
    result = await db.execute(stmt)
    return result.scalar() or 0


async def _distinct(db: AsyncSession, model, column, *filters):
    stmt = select(column).distinct()
    if filters:
        stmt = stmt.where(*filters)
    result = await db.execute(stmt)
    return result.all()


@router.get("/stats")
async def get_stats(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    total_users = await _count(db, User)
    total_guests = await _count(db, User, User.is_guest == True)
    total_email_users = await _count(db, User, User.auth_provider == "email")
    total_google_users = await _count(db, User, User.auth_provider == "google")
    active_this_month = await _count(db, User, User.last_active >= month_start)
    new_this_month = await _count(db, User, User.created_at >= month_start)
    total_downloads = await _count(db, DownloadLog)
    downloads_this_month = await _count(db, DownloadLog, DownloadLog.timestamp >= month_start)
    guest_downloads = await _count(db, DownloadLog, DownloadLog.is_guest == True, DownloadLog.timestamp >= month_start)
    user_downloads = await _count(db, DownloadLog, DownloadLog.is_guest == False, DownloadLog.timestamp >= month_start)

    downloads_by_source = {}
    for src_row in await _distinct(db, DownloadLog, DownloadLog.source, DownloadLog.timestamp >= month_start):
        src = src_row[0]
        if src:
            downloads_by_source[src] = await _count(
                db, DownloadLog,
                DownloadLog.source == src,
                DownloadLog.timestamp >= month_start,
            )

    last_7_days = []
    for i in range(6, -1, -1):
        day = now - timedelta(days=i)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        count = await _count(
            db, DownloadLog,
            DownloadLog.timestamp >= day_start,
            DownloadLog.timestamp < day_end,
        )
        last_7_days.append({
            "date": day_start.strftime("%Y-%m-%d"),
            "downloads": count,
        })

    return {
        "total_users": total_users,
        "total_guests": total_guests,
        "total_email_users": total_email_users,
        "total_google_users": total_google_users,
        "active_this_month": active_this_month,
        "new_this_month": new_this_month,
        "total_downloads": total_downloads,
        "downloads_this_month": downloads_this_month,
        "guest_downloads": guest_downloads,
        "user_downloads": user_downloads,
        "downloads_by_source": downloads_by_source,
        "last_7_days": last_7_days,
    }


@router.get("/users")
async def get_users(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
):
    result = await db.execute(
        select(User).order_by(User.created_at.desc()).offset(offset).limit(limit)
    )
    users = result.scalars().all()
    total = await _count(db, User)

    return {
        "users": [
            {
                "id": u.id,
                "username": u.username,
                "email": u.email,
                "display_name": u.display_name,
                "role": u.role,
                "auth_provider": u.auth_provider,
                "is_guest": u.is_guest,
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "last_active": u.last_active.isoformat() if u.last_active else None,
                "is_active": u.is_active,
            }
            for u in users
        ],
        "total": total,
    }


class UpdateUserRequest(BaseModel):
    is_active: bool | None = None

@router.put("/users/{user_id}/toggle-active")
async def toggle_user_active(
    user_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot disable yourself")
    user.is_active = not user.is_active
    await db.commit()
    return {"ok": True, "is_active": user.is_active}

@router.patch("/{user_id}")
async def update_user(
    user_id: str,
    body: UpdateUserRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot modify yourself")
    if body.is_active is not None:
        user.is_active = body.is_active
    await db.commit()
    return {"ok": True, "is_active": user.is_active}

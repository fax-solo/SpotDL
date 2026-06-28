import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from models import User, DownloadLog
from auth import require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/stats")
async def get_stats(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    total_users = db.query(func.count(User.id)).scalar()
    total_guests = db.query(func.count(User.id)).filter(User.is_guest == True).scalar()
    total_email_users = db.query(func.count(User.id)).filter(
        User.auth_provider == "email"
    ).scalar()
    total_google_users = db.query(func.count(User.id)).filter(
        User.auth_provider == "google"
    ).scalar()

    active_this_month = db.query(func.count(User.id)).filter(
        User.last_active >= month_start
    ).scalar()

    new_this_month = db.query(func.count(User.id)).filter(
        User.created_at >= month_start
    ).scalar()

    total_downloads = db.query(func.count(DownloadLog.id)).scalar()
    downloads_this_month = db.query(func.count(DownloadLog.id)).filter(
        DownloadLog.timestamp >= month_start
    ).scalar()

    guest_downloads = db.query(func.count(DownloadLog.id)).filter(
        DownloadLog.is_guest == True,
        DownloadLog.timestamp >= month_start,
    ).scalar()

    user_downloads = db.query(func.count(DownloadLog.id)).filter(
        DownloadLog.is_guest == False,
        DownloadLog.timestamp >= month_start,
    ).scalar()

    downloads_by_source = {}
    for src, in db.query(DownloadLog.source).filter(
        DownloadLog.timestamp >= month_start
    ).distinct().all():
        if src:
            count = db.query(func.count(DownloadLog.id)).filter(
                DownloadLog.source == src,
                DownloadLog.timestamp >= month_start,
            ).scalar()
            downloads_by_source[src] = count

    last_7_days = []
    for i in range(6, -1, -1):
        day = now - timedelta(days=i)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        count = db.query(func.count(DownloadLog.id)).filter(
            DownloadLog.timestamp >= day_start,
            DownloadLog.timestamp < day_end,
        ).scalar()
        last_7_days.append({
            "date": day_start.strftime("%Y-%m-%d"),
            "downloads": count,
        })

    return {
        "total_users": total_users or 0,
        "total_guests": total_guests or 0,
        "total_email_users": total_email_users or 0,
        "total_google_users": total_google_users or 0,
        "active_this_month": active_this_month or 0,
        "new_this_month": new_this_month or 0,
        "total_downloads": total_downloads or 0,
        "downloads_this_month": downloads_this_month or 0,
        "guest_downloads": guest_downloads or 0,
        "user_downloads": user_downloads or 0,
        "downloads_by_source": downloads_by_source,
        "last_7_days": last_7_days,
    }


@router.get("/users")
async def get_users(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
):
    users = db.query(User).order_by(User.created_at.desc()).offset(offset).limit(limit).all()
    total = db.query(func.count(User.id)).scalar()

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
        "total": total or 0,
    }


@router.put("/users/{user_id}/toggle-active")
async def toggle_user_active(
    user_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot disable yourself")
    user.is_active = not user.is_active
    db.commit()
    return {"ok": True, "is_active": user.is_active}

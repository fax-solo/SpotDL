"""
One-time migration script: D1 (Cloudflare) -> SQLite (Render/Python backend).

Usage:
  # 1. Export data from D1 using wrangler
  wrangler d1 execute sinc-db --command="SELECT * FROM users" --json > d1_users.json
  wrangler d1 execute sinc-db --command="SELECT * FROM history" --json > d1_history.json
  wrangler d1 execute sinc-db --command="SELECT * FROM download_logs" --json > d1_download_logs.json
  wrangler d1 execute sinc-db --command="SELECT * FROM push_tokens" --json > d1_push_tokens.json
  wrangler d1 execute sinc-db --command="SELECT * FROM token_blacklist" --json > d1_token_blacklist.json

  # 2. Run this script
  python build-scripts/migrate_d1_to_sqlite.py --dir ./d1_exports

  # 3. Verify
  python -c "from database import get_db; ..."
"""

import argparse
import json
import os
import sys
import uuid as uuid_mod
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from database import SessionLocal, init_db
from models import User, HistoryEntry, DownloadLog


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _uuid():
    return str(uuid_mod.uuid4())


def load_json(path: str) -> list[dict]:
    if not os.path.exists(path):
        print(f"  [SKIP] {path} not found")
        return []
    with open(path) as f:
        raw = json.load(f)
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        return raw.get("results", [])
    return []


def parse_ts(val) -> str | None:
    if val is None:
        return None
    if isinstance(val, str):
        return val
    if isinstance(val, (int, float)):
        return datetime.fromtimestamp(val / 1000, tz=timezone.utc).isoformat()
    return str(val)


async def migrate_users(session: AsyncSession, rows: list[dict]) -> int:
    count = 0
    for row in rows:
        email = row.get("email")
        if not email:
            continue
        existing = await session.execute(select(User).where(User.email == email))
        if existing.scalar_one_or_none():
            continue
        user = User(
            id=row.get("id") or _uuid(),
            username=row.get("username"),
            email=email,
            password_hash=row.get("password_hash"),
            display_name=row.get("display_name"),
            avatar_path=row.get("avatar_path"),
            auth_provider=row.get("auth_provider", "email"),
            google_id=row.get("google_id"),
            role=row.get("role", "user"),
            is_guest=bool(row.get("is_guest", False)),
            device_id=row.get("device_id"),
            created_at=parse_ts(row.get("created_at")),
            last_active=parse_ts(row.get("last_active")),
            is_active=bool(row.get("is_active", True)),
        )
        session.add(user)
        count += 1
        if count % 50 == 0:
            await session.commit()
    await session.commit()
    return count


async def migrate_history(session: AsyncSession, rows: list[dict]) -> int:
    count = 0
    for row in rows:
        entry = HistoryEntry(
            id=row.get("id") or _uuid(),
            user_id=row.get("user_id"),
            title=row.get("title", ""),
            artist=row.get("artist", ""),
            album=row.get("album", "Unknown Album"),
            artwork_url=row.get("artwork_url"),
            duration_ms=row.get("duration_ms"),
            timestamp=row.get("timestamp") or int(datetime.now(timezone.utc).timestamp() * 1000),
            isrc=row.get("isrc"),
        )
        session.add(entry)
        count += 1
        if count % 50 == 0:
            await session.commit()
    await session.commit()
    return count


async def migrate_download_logs(session: AsyncSession, rows: list[dict]) -> int:
    count = 0
    for row in rows:
        log = DownloadLog(
            id=row.get("id") or _uuid(),
            user_id=row.get("user_id"),
            track_title=row.get("track_title"),
            track_artist=row.get("track_artist"),
            quality=row.get("quality"),
            source=row.get("source"),
            timestamp=parse_ts(row.get("timestamp")),
            is_guest=bool(row.get("is_guest", False)),
        )
        session.add(log)
        count += 1
        if count % 50 == 0:
            await session.commit()
    await session.commit()
    return count


async def main():
    parser = argparse.ArgumentParser(description="Migrate D1 data to SQLite")
    parser.add_argument("--dir", default=".", help="Directory containing D1 JSON exports")
    args = parser.parse_args()

    data_dir = args.dir

    await init_db()

    async with SessionLocal() as session:
        users = load_json(os.path.join(data_dir, "d1_users.json"))
        history = load_json(os.path.join(data_dir, "d1_history.json"))
        download_logs = load_json(os.path.join(data_dir, "d1_download_logs.json"))

        print(f"Loaded {len(users)} users, {len(history)} history entries, {len(download_logs)} download logs")

        if users:
            imported = await migrate_users(session, users)
            print(f"  Imported {imported} users (skipped existing)")

        if history:
            imported = await migrate_history(session, history)
            print(f"  Imported {imported} history entries")

        if download_logs:
            imported = await migrate_download_logs(session, download_logs)
            print(f"  Imported {imported} download logs")

        print("Migration complete.")


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())

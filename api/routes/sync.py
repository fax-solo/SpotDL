import os
import asyncio
import logging

from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

from shared import verify_api_key

router = APIRouter(tags=["sync"])
logger = logging.getLogger(__name__)
_limiter = Limiter(key_func=get_remote_address)


class SubscribeRequest(BaseModel):
    url: str = Field(max_length=2000)
    interval: str = Field(default="daily", pattern="^(manual|hourly|daily|weekly)$")


@router.post("/api/sync/subscribe")
@_limiter.limit("20/minute")
async def sync_subscribe(request: Request, body: SubscribeRequest, _auth=Depends(verify_api_key)):
    from sync import add_subscription
    try:
        sub = add_subscription(body.url, body.interval)
        return {"ok": True, "subscription": sub}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Sync subscribe failed")
        raise HTTPException(status_code=502, detail="Subscribe failed")


@router.get("/api/sync/subscriptions")
@_limiter.limit("30/minute")
async def sync_list(request: Request, _auth=Depends(verify_api_key)):
    from sync import list_subscriptions
    return {"ok": True, "subscriptions": list_subscriptions()}


@router.delete("/api/sync/subscribe/{sub_id}")
@_limiter.limit("20/minute")
async def sync_unsubscribe(request: Request, sub_id: str, _auth=Depends(verify_api_key)):
    from sync import remove_subscription
    try:
        remove_subscription(sub_id)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/api/sync/run/{sub_id}")
@_limiter.limit("10/minute")
async def sync_run(request: Request, sub_id: str, _auth=Depends(verify_api_key)):
    from sync import run_sync
    try:
        result = await asyncio.to_thread(run_sync, sub_id)
        return {"ok": True, "result": result}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception:
        logger.exception("Sync run failed")
        raise HTTPException(status_code=502, detail="Sync failed")


@router.post("/api/sync/run-all")
@_limiter.limit("5/minute")
async def sync_run_all(request: Request, _auth=Depends(verify_api_key)):
    from sync import run_all_syncs
    try:
        results = await asyncio.to_thread(run_all_syncs)
        return {"ok": True, "results": results}
    except Exception:
        logger.exception("Sync run-all failed")
        raise HTTPException(status_code=502, detail="Sync failed")

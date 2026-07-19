import logging

from fastapi import APIRouter, Request

from shared import metrics, limiter

router = APIRouter(tags=["metrics"])
logger = logging.getLogger(__name__)


@router.get("/api/metrics")
@limiter.limit("30/minute")
async def get_metrics(request: Request):
    return metrics.snapshot()

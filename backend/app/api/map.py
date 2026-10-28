from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.map_builder import BUBBLES
from app.services.snapshot_cache import CachedPayload, get_payload

router = APIRouter(tags=["map"])

Market = Literal["KOSPI", "KOSDAQ", "ALL"]
Period = Literal["1d", "1w", "1m", "3m", "6m", "ytd", "1y"]


def _respond(request: Request, cached: CachedPayload | None) -> Response:
    if cached is None:
        raise HTTPException(503, "아직 수집된 데이터가 없습니다. 수집 잡을 먼저 실행하세요.")
    headers = {
        "ETag": cached.etag,
        "Cache-Control": "public, max-age=60",
        "Vary": "Accept-Encoding",
    }
    if request.headers.get("if-none-match") == cached.etag:
        return Response(status_code=304, headers=headers)
    if "gzip" in request.headers.get("accept-encoding", ""):
        headers["Content-Encoding"] = "gzip"
        return Response(cached.gz, media_type="application/json", headers=headers)
    return Response(cached.raw, media_type="application/json", headers=headers)


@router.get("/map")
def get_map(
    request: Request,
    market: Market = "KOSPI",
    period: Period = "1d",
    db: Session = Depends(get_db),
):
    return _respond(request, get_payload(db, market, period))


@router.get("/bubbles")
def get_bubbles(request: Request, market: Market = "KOSPI", db: Session = Depends(get_db)):
    """버블 차트용 종목 목록 (모든 기간 등락률 포함)."""
    return _respond(request, get_payload(db, market, BUBBLES))

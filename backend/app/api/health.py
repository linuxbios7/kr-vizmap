from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import Meta
from app.db.session import get_db
from app.services.market_hours import is_stale, now_kst

router = APIRouter(tags=["health"])


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict:
    meta = {m.key: m.value for m in db.query(Meta).all()}
    last = meta.get("last_quotes")
    now = now_kst()
    max_lag = timedelta(minutes=settings.intraday_interval_min * 4)
    return {
        "status": "ok",
        "time": now.isoformat(timespec="seconds"),
        "last_collected": last,
        "last_snapshot": meta.get("last_snapshot"),
        "last_error": meta.get("last_error"),
        "last_error_at": meta.get("last_error_at"),
        "stale": is_stale(datetime.fromisoformat(last) if last else None, now, max_lag),
    }

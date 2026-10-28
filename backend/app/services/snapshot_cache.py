"""맵 스냅샷 응답 메모리 캐시.

요청마다 DB에서 큰 JSON을 읽고 gzip 하던 비용을 없앤다. 스냅샷의 asof가 바뀌면
(수집 잡이 다른 프로세스에서 돌아도) 다음 요청에서 다시 읽는다.
"""

import gzip
import hashlib
import threading
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Snapshot


@dataclass(frozen=True)
class CachedPayload:
    asof: datetime
    etag: str
    raw: bytes
    gz: bytes


_cache: dict[tuple[str, str], CachedPayload] = {}
_lock = threading.Lock()


def get_payload(db: Session, market: str, period: str) -> CachedPayload | None:
    asof = db.scalar(
        select(Snapshot.asof).where(Snapshot.market == market, Snapshot.period == period)
    )
    if asof is None:
        return None
    key = (market, period)
    cached = _cache.get(key)
    if cached and cached.asof == asof:
        return cached

    payload = db.scalar(
        select(Snapshot.payload_json).where(Snapshot.market == market, Snapshot.period == period)
    )
    raw = payload.encode("utf-8")
    entry = CachedPayload(
        asof=asof,
        etag='"' + hashlib.sha1(raw).hexdigest()[:20] + '"',
        raw=raw,
        gz=gzip.compress(raw, compresslevel=6),
    )
    with _lock:
        _cache[key] = entry
    return entry


def clear() -> None:
    with _lock:
        _cache.clear()

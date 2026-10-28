"""스냅샷을 정적 JSON 파일로 내보낸다 (GitHub Pages 같은 정적 호스팅용).

    python -m app.jobs.export_static --out ../frontend/public/data

만드는 파일 (API 응답과 같은 내용):
    map/{KOSPI|KOSDAQ|ALL}-{1d|1w|...}.json   ← /api/map
    bubbles/{KOSPI|KOSDAQ|ALL}.json           ← /api/bubbles
    health.json                               ← 수집 시각 (지연 판단은 브라우저에서)
"""

import argparse
import json
import logging
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Meta, Snapshot
from app.db.session import SessionLocal, init_db
from app.services.map_builder import BUBBLES
from app.services.market_hours import now_kst

log = logging.getLogger(__name__)


def export_static(db: Session, out: Path) -> int:
    snaps = list(db.scalars(select(Snapshot)))
    if not snaps:
        raise RuntimeError("스냅샷이 없습니다. 수집 잡을 먼저 실행하세요.")
    (out / "map").mkdir(parents=True, exist_ok=True)
    (out / "bubbles").mkdir(parents=True, exist_ok=True)
    for s in snaps:
        path = (
            out / "bubbles" / f"{s.market}.json"
            if s.period == BUBBLES
            else out / "map" / f"{s.market}-{s.period}.json"
        )
        path.write_text(s.payload_json, encoding="utf-8")

    meta = {m.key: m.value for m in db.scalars(select(Meta))}
    health = {
        "status": "ok",
        "static": True,
        "generated_at": now_kst().isoformat(timespec="seconds"),
        "last_collected": meta.get("last_quotes"),
        "last_snapshot": meta.get("last_snapshot"),
    }
    (out / "health.json").write_text(json.dumps(health, ensure_ascii=False), encoding="utf-8")
    log.info("exported %d snapshots to %s", len(snaps), out)
    return len(snaps)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="export snapshots as static JSON")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    init_db()
    with SessionLocal() as db:
        export_static(db, args.out)


if __name__ == "__main__":
    main()

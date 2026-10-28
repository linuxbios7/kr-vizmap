"""시세 수집 잡.

수동 실행:
    python -m app.jobs.collector all          # 시세 갱신 + 히스토리 백필 + 스냅샷
    python -m app.jobs.collector refresh      # 시세 갱신 + 스냅샷 (장중 주기 작업)
    python -m app.jobs.collector backfill     # 히스토리 없는 종목만 일봉 백필
    python -m app.jobs.collector all --provider fake   # 네트워크 없이 고정 데이터(E2E·데모)
"""

import argparse
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.orm import Session

from app.db.models import DailyPrice, Meta, Stock
from app.db.session import SessionLocal, init_db
from app.providers.base import Bar, DataProvider, Quote
from app.providers.naver import NaverProvider
from app.services.map_builder import CALENDAR_CODE, rebuild_snapshots
from app.services.market_hours import now_kst
from app.services.sectors import sector_of

log = logging.getLogger(__name__)

MARKETS = ("KOSPI", "KOSDAQ")
CHUNK = 500


def _upsert(db: Session, model, rows: list[dict], keys: list[str]) -> None:
    if not rows:
        return
    insert = postgresql.insert if db.bind.dialect.name == "postgresql" else sqlite.insert
    for i in range(0, len(rows), CHUNK):
        stmt = insert(model).values(rows[i : i + CHUNK])
        update = {c: stmt.excluded[c] for c in rows[0] if c not in keys}
        db.execute(stmt.on_conflict_do_update(index_elements=keys, set_=update))


def refresh_quotes(db: Session, provider: DataProvider, with_industries: bool = False) -> int:
    """현재 시세로 stocks 갱신 + 당일 일봉(close) 기록."""
    quotes: list[Quote] = [q for m in MARKETS for q in provider.quotes(m)]

    industries: dict[str, str] = {}
    known = dict(db.execute(select(Stock.code, Stock.industry)).all())
    if with_industries or any(q.code not in known for q in quotes):
        industries = provider.industries()

    now = now_kst()
    stock_rows, price_rows = [], []
    for q in quotes:
        industry = industries.get(q.code) or known.get(q.code)
        stock_rows.append(
            {
                "code": q.code,
                "name": q.name,
                "market": q.market,
                "industry": industry,
                "sector": sector_of(industry),
                "price": q.price,
                "chg_pct": q.chg_pct,
                "volume": q.volume,
                "value": q.value,
                "market_cap": q.market_cap,
                "traded_at": q.traded_at.replace(tzinfo=None),
                "updated_at": now,
            }
        )
        price_rows.append(
            {"code": q.code, "date": q.traded_at.date(), "close": q.price, "volume": q.volume}
        )

    _upsert(db, Stock, stock_rows, ["code"])
    _upsert(db, DailyPrice, price_rows, ["code", "date"])
    db.merge(Meta(key="last_quotes", value=now.isoformat(timespec="seconds")))
    db.commit()
    log.info("quotes refreshed: %d stocks (industries fetched: %s)", len(quotes), bool(industries))
    return len(quotes)


def _bar_rows(code: str, bars: list[Bar]) -> list[dict]:
    return [
        {
            "code": code,
            "date": b.day,
            "open": b.open,
            "high": b.high,
            "low": b.low,
            "close": b.close,
            "volume": b.volume,
        }
        for b in bars
    ]


def backfill_history(
    db: Session, provider: DataProvider, days: int = 400, workers: int = 6, force: bool = False
) -> int:
    """일봉이 부족한(2건 미만) 종목만 과거 days일치 백필. force면 전 종목."""
    codes = set(db.scalars(select(Stock.code)))
    codes.add(CALENDAR_CODE)
    if not force:
        have = select(DailyPrice.code).group_by(DailyPrice.code).having(func.count() >= 2)
        codes -= set(db.scalars(have))
    if not codes:
        return 0

    end = date.today()
    start = end - timedelta(days=days)
    done = failed = 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(provider.daily_bars, c, start, end): c for c in sorted(codes)}
        for fut in as_completed(futures):
            code = futures[fut]
            try:
                _upsert(db, DailyPrice, _bar_rows(code, fut.result()), ["code", "date"])
                done += 1
            except Exception as e:  # 한 종목 실패가 전체를 멈추지 않게
                failed += 1
                log.warning("backfill failed %s: %s", code, e)
            if (done + failed) % 200 == 0:
                db.commit()
                log.info("backfill progress %d/%d", done + failed, len(codes))
    db.commit()
    log.info("backfill done: %d ok, %d failed", done, failed)
    return done


def make_provider(name: str) -> DataProvider:
    if name == "fake":
        from app.providers.fake import FakeProvider

        return FakeProvider()
    return NaverProvider()


def run(command: str, days: int = 400, provider: str = "naver") -> None:
    """수집 실행. 실패해도 직전 스냅샷은 그대로 두고 오류를 meta에 남긴다."""
    init_db()
    src = make_provider(provider)
    with SessionLocal() as db:
        try:
            if command in ("refresh", "all"):
                refresh_quotes(db, src, with_industries=command == "all")
            if command in ("backfill", "all"):
                backfill_history(db, src, days=days)
            n = rebuild_snapshots(db)
            log.info("snapshots rebuilt: %d", n)
        except Exception as e:
            db.rollback()
            db.merge(Meta(key="last_error", value=f"{command}: {type(e).__name__}: {e}"[:500]))
            db.merge(Meta(key="last_error_at", value=now_kst().isoformat(timespec="seconds")))
            db.commit()
            raise


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    parser = argparse.ArgumentParser(description="KR market map collector")
    parser.add_argument("command", choices=["refresh", "backfill", "all"])
    parser.add_argument("--days", type=int, default=400, help="백필 기간(달력일)")
    parser.add_argument(
        "--provider", choices=["naver", "fake"], default="naver", help="fake: 오프라인 테스트용"
    )
    args = parser.parse_args()
    run(args.command, args.days, args.provider)


if __name__ == "__main__":
    main()

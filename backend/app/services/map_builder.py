"""DB → 섹터/업종/종목 계층 JSON 생성 및 스냅샷 캐시."""

import json
from collections import defaultdict
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import DailyPrice, Meta, Snapshot, Stock
from app.services.returns import PERIODS, base_date, pct_change

MARKETS = ("KOSPI", "KOSDAQ", "ALL")
CALENDAR_CODE = "005930"  # 거래일 캘린더 기준 종목(삼성전자)
BUBBLES = "bub"  # 버블 스냅샷의 period 키


def is_excluded(code: str, name: str) -> bool:
    """우선주(코드 끝자리≠0)·스팩은 맵에서 제외."""
    return not code.endswith("0") or "스팩" in name


def trading_calendar(db: Session) -> list[date]:
    rows = db.scalars(
        select(DailyPrice.date).where(DailyPrice.code == CALENDAR_CODE).order_by(DailyPrice.date)
    )
    return list(rows)


def closes_on(db: Session, day: date) -> dict[str, float]:
    rows = db.execute(select(DailyPrice.code, DailyPrice.close).where(DailyPrice.date == day))
    return {code: close for code, close in rows}


def build_tree(stocks: list[Stock], changes: dict[str, float | None], market: str) -> dict:
    tree: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
    for s in stocks:
        tree[s.sector or "기타"][s.industry or "기타"].append(
            {
                "code": s.code,
                "name": s.name,
                "market": s.market,
                "cap": s.market_cap,
                "chg": changes.get(s.code),
                "price": s.price,
            }
        )

    def cap_sum(leaves):
        return sum(x["cap"] for x in leaves)

    sectors = []
    for sector, inds in tree.items():
        industries = [
            {"name": ind, "children": sorted(leaves, key=lambda x: -x["cap"])}
            for ind, leaves in inds.items()
        ]
        industries.sort(key=lambda n: -cap_sum(n["children"]))
        sectors.append({"name": sector, "children": industries})
    sectors.sort(key=lambda n: -sum(cap_sum(i["children"]) for i in n["children"]))
    return {"name": market, "children": sectors}


def map_stocks(db: Session, market: str) -> list[Stock]:
    q = select(Stock).where(Stock.market_cap > 0)
    if market != "ALL":
        q = q.where(Stock.market == market)
    return [s for s in db.scalars(q) if not is_excluded(s.code, s.name)]


def period_changes(
    db: Session, stocks: list[Stock], period: str, calendar: list[date] | None = None
) -> tuple[dict[str, float | None], date | None]:
    """종목별 기간 등락률과 기준일. 1d는 시세의 전일대비 등락률."""
    if period == "1d":
        return {s.code: s.chg_pct for s in stocks}, None
    base = base_date(calendar if calendar is not None else trading_calendar(db), period)
    base_closes = closes_on(db, base) if base else {}
    return {s.code: pct_change(s.price, base_closes.get(s.code)) for s in stocks}, base


def _asof(stocks: list[Stock]) -> str | None:
    asof = max((s.traded_at for s in stocks), default=None)
    return asof.isoformat() if asof else None


def build_map(db: Session, market: str, period: str) -> dict:
    stocks = map_stocks(db, market)
    changes, base = period_changes(db, stocks, period)
    return {
        "asof": _asof(stocks),
        "market": market,
        "period": period,
        "base_date": base.isoformat() if base else None,
        **build_tree(stocks, changes, market),
    }


def build_bubbles(db: Session, market: str) -> dict:
    """버블 차트용 평면 목록. 기간 전환이 즉시 되도록 모든 기간 등락률을 함께 담는다."""
    stocks = map_stocks(db, market)
    calendar = trading_calendar(db)
    chg: dict[str, dict[str, float | None]] = {}
    base_dates: dict[str, str | None] = {}
    for period in PERIODS:
        changes, base = period_changes(db, stocks, period, calendar)
        chg[period] = changes
        base_dates[period] = base.isoformat() if base else None
    rows = [
        {
            "code": s.code,
            "name": s.name,
            "market": s.market,
            "sector": s.sector or "기타",
            "industry": s.industry or "기타",
            "cap": s.market_cap,
            "price": s.price,
            "value": s.value,
            "chg": {p: chg[p][s.code] for p in PERIODS},
        }
        for s in sorted(stocks, key=lambda s: -s.market_cap)
    ]
    return {"asof": _asof(stocks), "market": market, "base_dates": base_dates, "stocks": rows}


def rebuild_snapshots(db: Session) -> int:
    """모든 시장×기간 맵 스냅샷과 시장별 버블 스냅샷을 다시 만들어 저장한다."""
    now = datetime.now()
    for market in MARKETS:
        db.merge(
            Snapshot(
                market=market,
                period=BUBBLES,
                asof=now,
                payload_json=json.dumps(build_bubbles(db, market), ensure_ascii=False),
            )
        )
        for period in PERIODS:
            payload = build_map(db, market, period)
            db.merge(
                Snapshot(
                    market=market,
                    period=period,
                    asof=now,
                    payload_json=json.dumps(payload, ensure_ascii=False),
                )
            )
    db.merge(Meta(key="last_snapshot", value=now.isoformat(timespec="seconds")))
    db.commit()
    return len(MARKETS) * (len(PERIODS) + 1)

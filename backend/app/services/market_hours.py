"""정규장 시간 판단 (휴장일은 고려하지 않는다)."""

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")
OPEN, CLOSE = time(9, 0), time(15, 30)


def now_kst() -> datetime:
    return datetime.now(KST).replace(tzinfo=None)


def is_market_open(now: datetime) -> bool:
    return now.weekday() < 5 and OPEN <= now.time() <= CLOSE


def is_stale(last: datetime | None, now: datetime, max_lag: timedelta) -> bool:
    """시세 지연 여부.

    장중이면 마지막 수집이 max_lag보다 오래됐을 때, 평일 장 마감 후면 오늘 시세가 없을 때 지연.
    """
    if last is None:
        return True
    if is_market_open(now):
        return now - last > max_lag
    after_close = now.weekday() < 5 and now > datetime.combine(now.date(), CLOSE) + max_lag
    return after_close and last.date() < now.date()

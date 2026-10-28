"""기간 등락률의 기준일 계산 (거래일 캘린더 기준)."""

from datetime import date

PERIODS = ("1d", "1w", "1m", "3m", "6m", "ytd", "1y")

# 기준일까지 거슬러 올라갈 거래일 수
TRADING_DAYS_BACK = {"1w": 5, "1m": 21, "3m": 63, "6m": 126, "1y": 250}


def base_date(calendar: list[date], period: str) -> date | None:
    """calendar(오름차순 거래일, 마지막=최신)에서 period의 기준일.

    1d는 시세의 전일대비 등락률을 그대로 쓰므로 None.
    """
    if period == "1d" or not calendar:
        return None
    if period == "ytd":
        prev_year = [d for d in calendar if d.year < calendar[-1].year]
        return prev_year[-1] if prev_year else None
    n = TRADING_DAYS_BACK[period]
    return calendar[-1 - n] if len(calendar) > n else None


def pct_change(current: float, base: float | None) -> float | None:
    if not base:
        return None
    return round((current / base - 1) * 100, 2)

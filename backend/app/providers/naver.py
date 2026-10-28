"""네이버 증권 모바일 JSON API 기반 수집원.

비공식 API라 응답 형식이 바뀔 수 있으므로 파싱은 parse_* 함수로 분리해 테스트한다.
"""

import time
from datetime import date, datetime

import httpx

from app.providers.base import Bar, DataProvider, Quote

LIST_API = "https://m.stock.naver.com/api/stocks"
CHART_API = "https://api.stock.naver.com/chart/domestic/item"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
PAGE_SIZE = 100


def _num(s: str | float | int | None) -> float:
    if s is None or s in ("", "N/A", "-"):
        return 0.0
    if isinstance(s, int | float):
        return float(s)
    return float(s.replace(",", ""))


def parse_quote(item: dict, market: str) -> Quote | None:
    """시총 순위/업종 리스트의 종목 항목 → Quote. 보통주(stock)가 아니면 None."""
    if item.get("stockEndType") != "stock":
        return None
    return Quote(
        code=item["itemCode"],
        name=item["stockName"],
        market=market,
        price=_num(item["closePrice"]),
        chg_pct=_num(item["fluctuationsRatio"]),
        volume=int(_num(item.get("accumulatedTradingVolume"))),
        value=int(_num(item.get("accumulatedTradingValue")) * 1_000_000),  # 백만원
        market_cap=int(_num(item.get("marketValue")) * 100_000_000),  # 억원
        traded_at=datetime.fromisoformat(item["localTradedAt"]),
    )


def parse_bars(rows: list[dict]) -> list[Bar]:
    return [
        Bar(
            day=datetime.strptime(r["localDate"], "%Y%m%d").date(),
            open=float(r["openPrice"]),
            high=float(r["highPrice"]),
            low=float(r["lowPrice"]),
            close=float(r["closePrice"]),
            volume=int(r["accumulatedTradingVolume"]),
        )
        for r in rows
    ]


class NaverProvider(DataProvider):
    def __init__(self, client: httpx.Client | None = None, delay: float = 0.05, retries: int = 3):
        self.client = client or httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=15)
        self.delay = delay
        self.retries = retries

    def _get(self, url: str, params: dict | None = None):
        for attempt in range(self.retries):
            try:
                r = self.client.get(url, params=params)
                r.raise_for_status()
                time.sleep(self.delay)
                return r.json()
            except (httpx.HTTPError, ValueError):
                if attempt == self.retries - 1:
                    raise
                time.sleep(1.0 * (attempt + 1))

    def _paged(self, url: str, key: str) -> list[dict]:
        items, page = [], 1
        while True:
            data = self._get(url, {"page": page, "pageSize": PAGE_SIZE})
            batch = data.get(key) or []
            items.extend(batch)
            if len(batch) < PAGE_SIZE or len(items) >= data.get("totalCount", 0):
                return items
            page += 1

    def quotes(self, market: str) -> list[Quote]:
        rows = self._paged(f"{LIST_API}/marketValue/{market}", "stocks")
        return [q for q in (parse_quote(r, market) for r in rows) if q]

    def industries(self) -> dict[str, str]:
        mapping: dict[str, str] = {}
        for g in self._paged(f"{LIST_API}/industry", "groups"):
            for item in self._paged(f"{LIST_API}/industry/{g['no']}", "stocks"):
                mapping[item["itemCode"]] = g["name"]
        return mapping

    def daily_bars(self, code: str, start: date, end: date) -> list[Bar]:
        rows = self._get(
            f"{CHART_API}/{code}/day",
            {
                "startDateTime": start.strftime("%Y%m%d") + "0000",
                "endDateTime": end.strftime("%Y%m%d") + "2359",
            },
        )
        return parse_bars(rows or [])

"""네트워크 없이 고정 데이터를 주는 수집원 (테스트·E2E·오프라인 데모용).

모든 종목 주가는 매 거래일(평일) 1%씩 오른다고 가정한다.
"""

from datetime import date, datetime, timedelta

from app.providers.base import Bar, DataProvider, Quote

TODAY = date(2026, 10, 26)
TRADED_AT = datetime(2026, 10, 26, 15, 30)


def weekdays_back(n: int, end: date = TODAY) -> list[date]:
    days, d = [], end
    while len(days) < n:
        if d.weekday() < 5:
            days.append(d)
        d -= timedelta(days=1)
    return sorted(days)


class FakeProvider(DataProvider):
    STOCKS = [
        # code, name, market, 시총(원), 업종, 현재가, 전일대비(%)
        ("005930", "삼성전자", "KOSPI", 1000, "반도체와반도체장비", 200.0, 1.0),
        ("000660", "SK하이닉스", "KOSPI", 800, "반도체와반도체장비", 100.0, 1.0),
        ("005935", "삼성전자우", "KOSPI", 100, "반도체와반도체장비", 150.0, 1.0),
        ("005380", "현대차", "KOSPI", 300, "자동차", 50.0, 1.0),
        ("247540", "에코프로비엠", "KOSDAQ", 200, "전기제품", 80.0, 1.0),
        ("123450", "가나스팩1호", "KOSDAQ", 10, None, 2.0, 1.0),
    ]

    def __init__(self, n_days: int = 300):
        self.calendar = weekdays_back(n_days)

    def quotes(self, market: str) -> list[Quote]:
        return [
            Quote(code, name, mkt, price, chg, 10, 1000, cap, TRADED_AT)
            for code, name, mkt, cap, _, price, chg in self.STOCKS
            if mkt == market
        ]

    def industries(self) -> dict[str, str]:
        return {s[0]: s[4] for s in self.STOCKS if s[4]}

    def daily_bars(self, code: str, start: date, end: date) -> list[Bar]:
        price = next(s[5] for s in self.STOCKS if s[0] == code)
        n = len(self.calendar)
        bars = []
        for i, d in enumerate(self.calendar):
            close = price / (1.01 ** (n - 1 - i))
            bars.append(Bar(d, close, close, close, close, 1))
        return [b for b in bars if start <= b.day <= end]

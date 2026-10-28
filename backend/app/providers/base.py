from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date, datetime


@dataclass
class Quote:
    """현재 시세 한 건(장중이면 지연 시세)."""

    code: str
    name: str
    market: str  # KOSPI | KOSDAQ
    price: float
    chg_pct: float  # 전일 대비 등락률(%)
    volume: int
    value: int  # 거래대금(원)
    market_cap: int  # 시가총액(원)
    traded_at: datetime


@dataclass
class Bar:
    """일봉 한 건(수정주가)."""

    day: date
    open: float
    high: float
    low: float
    close: float
    volume: int


class DataProvider(ABC):
    """시세·분류 수집원 인터페이스. 수집원 정책이 바뀌면 구현체만 교체한다."""

    @abstractmethod
    def quotes(self, market: str) -> list[Quote]:
        """해당 시장의 보통주 현재 시세 전체 (ETF·ETN 제외)."""

    @abstractmethod
    def industries(self) -> dict[str, str]:
        """종목코드 → 업종명."""

    @abstractmethod
    def daily_bars(self, code: str, start: date, end: date) -> list[Bar]:
        """기간 일봉(오래된 순)."""

from datetime import date, datetime

from sqlalchemy import BigInteger, Date, DateTime, Float, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Stock(Base):
    """종목 마스터 + 최신 시세 스냅샷."""

    __tablename__ = "stocks"

    code: Mapped[str] = mapped_column(String(12), primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    market: Mapped[str] = mapped_column(String(10), index=True)
    sector: Mapped[str | None] = mapped_column(String(50))
    industry: Mapped[str | None] = mapped_column(String(100))
    price: Mapped[float] = mapped_column(Float)
    chg_pct: Mapped[float] = mapped_column(Float)
    volume: Mapped[int] = mapped_column(BigInteger)
    value: Mapped[int] = mapped_column(BigInteger)
    market_cap: Mapped[int] = mapped_column(BigInteger)
    traded_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class DailyPrice(Base):
    """일봉(수정주가). 기간 등락률 계산용."""

    __tablename__ = "daily_prices"

    code: Mapped[str] = mapped_column(String(12), primary_key=True)
    date: Mapped[date] = mapped_column(Date, primary_key=True, index=True)
    open: Mapped[float | None] = mapped_column(Float)
    high: Mapped[float | None] = mapped_column(Float)
    low: Mapped[float | None] = mapped_column(Float)
    close: Mapped[float] = mapped_column(Float)
    volume: Mapped[int | None] = mapped_column(BigInteger)


class Snapshot(Base):
    """맵 API 응답 캐시."""

    __tablename__ = "snapshots"

    market: Mapped[str] = mapped_column(String(10), primary_key=True)
    period: Mapped[str] = mapped_column(String(5), primary_key=True)
    asof: Mapped[datetime] = mapped_column(DateTime)
    payload_json: Mapped[str] = mapped_column(Text)


class Meta(Base):
    """수집 상태 등 키-값."""

    __tablename__ = "meta"

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    value: Mapped[str] = mapped_column(Text)

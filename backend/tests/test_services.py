from datetime import date, datetime, timedelta

from app.providers.fake import weekdays_back
from app.providers.naver import parse_bars, parse_quote
from app.services.market_hours import is_market_open, is_stale
from app.services.returns import base_date, pct_change
from app.services.sectors import OTHER, sector_of

# 2026-10 기준 네이버 업종 79개
NAVER_INDUSTRIES = (
    "건강관리기술 디스플레이패널 생명보험 소프트웨어 컴퓨터와주변기기 양방향미디어와서비스 담배 "
    "항공화물운송과물류 전문소매 음료 전자제품 복합기업 가구 해운사 반도체와반도체장비 교육서비스 "
    "건축제품 운송인프라 식품과기본식료품소매 석유와가스 가정용품 광고 카드 IT서비스 자동차부품 "
    "전자장비와기기 게임엔터테인먼트 기타금융 방송과엔터테인먼트 상업서비스와공급품 도로와철도운송 "
    "통신장비 항공사 부동산 손해보험 전기제품 가정용기기와용품 건설 기계 전기유틸리티 증권 "
    "다각화된소비자서비스 생물공학 건축자재 가스유틸리티 비철금속 다각화된통신서비스 "
    "섬유,의류,신발,호화품 생명과학도구및서비스 레저용장비와제품 화장품 호텔,레스토랑,레저 "
    "종이와목재 제약 포장재 자동차 출판 철강 인터넷과카탈로그소매 디스플레이장비및부품 "
    "무선통신서비스 창업투자 백화점과일반상점 화학 사무용전자제품 판매업체 건강관리장비와용품 "
    "문구류 식품 은행 무역회사와판매업체 전기장비 핸드셋 복합유틸리티 건강관리업체및서비스 조선 "
    "우주항공과국방 에너지장비및서비스"
).split()


def test_all_naver_industries_mapped():
    assert len(NAVER_INDUSTRIES) == 78  # '기타' 업종 제외
    unmapped = [i for i in NAVER_INDUSTRIES if sector_of(i) == OTHER]
    assert unmapped == []
    assert sector_of("기타") == OTHER and sector_of(None) == OTHER


def test_base_date():
    cal = weekdays_back(300, date(2026, 10, 26))
    assert base_date(cal, "1d") is None
    assert base_date(cal, "1w") == cal[-6]
    assert base_date(cal, "1y") == cal[-251]
    assert base_date(cal, "ytd") == date(2025, 12, 31)
    assert base_date(cal[-10:], "1m") is None  # 히스토리 부족
    assert base_date([], "1w") is None


def test_market_hours_and_staleness():
    mon_10 = datetime(2026, 10, 26, 10, 0)  # 월요일
    lag = timedelta(minutes=20)
    assert is_market_open(mon_10)
    assert not is_market_open(datetime(2026, 10, 25, 10, 0))  # 일요일
    assert not is_market_open(datetime(2026, 10, 26, 8, 59))
    assert not is_stale(mon_10 - timedelta(minutes=5), mon_10, lag)
    assert is_stale(mon_10 - timedelta(minutes=30), mon_10, lag)
    # 장 마감 후: 오늘 시세가 있으면 정상, 어제 것뿐이면 지연
    mon_17 = datetime(2026, 10, 26, 17, 0)
    assert not is_stale(datetime(2026, 10, 26, 15, 30), mon_17, lag)
    assert is_stale(datetime(2026, 10, 23, 15, 30), mon_17, lag)
    # 주말에는 금요일 시세여도 정상
    assert not is_stale(datetime(2026, 10, 23, 15, 30), datetime(2026, 10, 25, 12, 0), lag)
    assert is_stale(None, mon_10, lag)


def test_pct_change():
    assert pct_change(110, 100) == 10.0
    assert pct_change(110, None) is None
    assert pct_change(110, 0) is None


def test_parse_quote():
    item = {
        "stockEndType": "stock",
        "itemCode": "005930",
        "stockName": "삼성전자",
        "closePrice": "213,000",
        "fluctuationsRatio": "-1.16",
        "accumulatedTradingVolume": "9,447,808",
        "accumulatedTradingValue": "2,019,701",
        "marketValue": "12,452,573",
        "localTradedAt": "2026-10-26T15:16:00+09:00",
    }
    q = parse_quote(item, "KOSPI")
    assert q.price == 213000 and q.chg_pct == -1.16
    assert q.market_cap == 12_452_573 * 100_000_000
    assert q.value == 2_019_701 * 1_000_000
    assert q.traded_at.date() == date(2026, 10, 26)
    assert parse_quote({**item, "stockEndType": "etf"}, "KOSPI") is None


def test_parse_bars():
    rows = [
        {
            "localDate": "20261023",
            "closePrice": 213500.0,
            "openPrice": 206000.0,
            "highPrice": 215500.0,
            "lowPrice": 203500.0,
            "accumulatedTradingVolume": 16145972,
        }
    ]
    (bar,) = parse_bars(rows)
    assert bar.day == date(2026, 10, 23) and bar.close == 213500.0 and bar.volume == 16145972

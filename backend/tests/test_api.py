from fastapi.testclient import TestClient

from app.main import app


def leaves(node):
    for c in node["children"]:
        if "code" in c:
            yield c
        else:
            yield from leaves(c)


def test_health(seeded_db):
    with TestClient(app) as client:
        body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["last_collected"] and body["last_snapshot"]


def test_map_kospi_1d(seeded_db):
    with TestClient(app) as client:
        r = client.get("/api/map", params={"market": "KOSPI", "period": "1d"})
    assert r.status_code == 200
    body = r.json()
    assert body["market"] == "KOSPI" and body["asof"].startswith("2026-10-26")
    codes = {s["code"] for s in leaves(body)}
    assert codes == {"005930", "000660", "005380"}  # 우선주 제외, KOSDAQ 제외
    assert body["children"][0]["name"] == "IT"  # 시총 큰 섹터가 먼저
    assert all(s["chg"] == 1.0 for s in leaves(body))


def test_map_all_period_1w(seeded_db):
    with TestClient(app) as client:
        body = client.get("/api/map", params={"market": "ALL", "period": "1w"}).json()
    codes = {s["code"] for s in leaves(body)}
    assert "247540" in codes and "123450" not in codes  # 스팩 제외
    # 매 거래일 +1% → 5거래일 전 대비 1.01^5-1 = 5.10%
    assert all(s["chg"] == 5.1 for s in leaves(body))
    assert body["base_date"]


def test_map_gzip_and_etag(seeded_db):
    with TestClient(app) as client:
        r = client.get("/api/map", params={"market": "KOSPI"}, headers={"Accept-Encoding": "gzip"})
        assert r.headers["content-encoding"] == "gzip"
        etag = r.headers["etag"]
        r304 = client.get("/api/map", params={"market": "KOSPI"}, headers={"If-None-Match": etag})
        assert r304.status_code == 304 and r304.content == b""
        raw = client.get(
            "/api/map", params={"market": "KOSPI"}, headers={"Accept-Encoding": "identity"}
        )
    assert "content-encoding" not in raw.headers
    assert raw.json() == r.json()  # httpx가 gzip 응답을 자동으로 풀어 준다


def test_failed_collection_keeps_snapshot_and_records_error(seeded_db, monkeypatch):
    from app.jobs import collector

    class Broken(collector.NaverProvider):
        def quotes(self, market):
            raise RuntimeError("network down")

    monkeypatch.setattr(collector, "make_provider", lambda name: Broken())
    try:
        collector.run("refresh")
    except RuntimeError:
        pass
    with TestClient(app) as client:
        health = client.get("/api/health").json()
        r = client.get("/api/map", params={"market": "KOSPI"})
    assert "network down" in health["last_error"]
    assert r.status_code == 200  # 직전 스냅샷 유지


def test_map_rejects_bad_period():
    with TestClient(app) as client:
        r = client.get("/api/map", params={"period": "2y"})
    assert r.status_code == 422


def test_bubbles(seeded_db):
    with TestClient(app) as client:
        body = client.get("/api/bubbles", params={"market": "ALL"}).json()
    codes = [s["code"] for s in body["stocks"]]
    assert codes[0] == "005930"  # 시총 순
    assert "005935" not in codes and "123450" not in codes  # 우선주·스팩 제외
    s = body["stocks"][0]
    assert s["sector"] == "IT" and s["industry"] == "반도체와반도체장비"
    assert s["value"] == 1000 and s["cap"] == 1000
    assert s["chg"]["1d"] == 1.0 and s["chg"]["1w"] == 5.1
    assert set(s["chg"]) == {"1d", "1w", "1m", "3m", "6m", "ytd", "1y"}
    assert body["base_dates"]["1d"] is None and body["base_dates"]["1w"]


def test_export_static(seeded_db, tmp_path):
    import json

    from app.db.session import SessionLocal
    from app.jobs.export_static import export_static

    with SessionLocal() as db:
        n = export_static(db, tmp_path)
    assert n == 24  # 3시장 × (7기간 + 버블)
    kospi = json.loads((tmp_path / "map" / "KOSPI-1w.json").read_text(encoding="utf-8"))
    assert kospi["market"] == "KOSPI" and kospi["period"] == "1w"
    bub = json.loads((tmp_path / "bubbles" / "ALL.json").read_text(encoding="utf-8"))
    assert bub["stocks"][0]["code"] == "005930"
    health = json.loads((tmp_path / "health.json").read_text(encoding="utf-8"))
    assert health["static"] and health["last_collected"]
    with TestClient(app) as client:  # API 응답과 같은 내용
        assert client.get("/api/map", params={"period": "1w"}).json() == kospi

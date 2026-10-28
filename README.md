# KR Market Map

finviz.com/map 스타일의 KOSPI·KOSDAQ 시가총액 트리맵. 개발 계획은 [개발계획서.md](개발계획서.md), 운영 배포(서버 · Vercel · **GitHub Pages**)는 [DEPLOY.md](DEPLOY.md) 참고.

```
backend/   FastAPI + SQLAlchemy + 네이버 증권 API (수집·API)
frontend/  Next.js(App Router) + d3-hierarchy Canvas 트리맵 (맵 UI)
```

## 화면
- **맵**: 섹터→업종→종목 트리맵. 면적=시가총액, 색=기간 등락률.
- **버블**: X·Y축 지표(등락률·시가총액·거래대금·회전율)를 골라 보는 산점도. 크기=시가총액, 색=등락률.
  - **전체 보기**: 한 그림에 모든 종목 / **섹터별 보기**: 섹터마다 작은 그림(같은 축 범위). 섹터 이름을 누르면 그 섹터만 크게 봅니다.
  - 등락률 축은 극단값 때문에 뭉치지 않게 2~98 백분위로 자르고, 범위 밖 종목은 가장자리에 표시합니다. 금액·회전율 축은 로그 눈금입니다.
- 화면 상태(시장·기간·색상·줌·강조 종목·버블 축/묶음)는 모두 URL에 담겨 링크로 공유됩니다.

## 실행 — Docker (개발)
```bash
docker compose up --build
```
- 프론트: http://localhost:3000
- API 문서: http://localhost:8000/docs
- 처음에는 데이터가 없으므로 `docker compose exec backend python -m app.jobs.collector all`로 한 번 수집합니다.

## 실행 — 로컬
필요: Python 3.11+, Node.js 22+

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload
```

```bash
cd frontend
npm install
npm run dev
```

## 데이터 수집
시세 소스는 네이버 증권 모바일 API(비공식, 로그인 불필요)입니다. KRX(pykrx)는 로그인 페이지의 키보드 보안 암호화 때문에 현재 사용할 수 없습니다.

```bash
cd backend
python -m app.jobs.collector all       # 최초 1회: 시세 + 업종 + 1년치 일봉 백필 + 스냅샷
python -m app.jobs.collector refresh   # 시세만 갱신 + 스냅샷
```
- `KRMAP_SCHEDULER_ENABLED=true`로 API를 띄우면 기동 직후 1회, 장중 5분마다, 장 마감 후(16:10) 자동 수집합니다.
- 맵에서 우선주와 스팩은 제외합니다. 섹터는 네이버 업종(79개)을 10개 대분류로 묶습니다(`app/services/sectors.py`).

## 품질 도구
| 대상 | 명령 |
|---|---|
| backend 테스트 | `pytest` |
| backend 린트/포맷 | `ruff check .` / `ruff format .` |
| frontend 린트/포맷 | `npm run lint` / `npm run format` |
| frontend 타입체크 | `npm run typecheck` |
| frontend 단위 테스트 | `npm test` |
| E2E (Playwright) | `npx playwright install chromium` 후 `npm run e2e` |

E2E는 고정 데이터(`--provider fake`)로 채운 별도 DB의 백엔드(8001)와 프로덕션 빌드 프론트(3100)를 자동으로 띄워 데스크톱·모바일 시나리오를 검사합니다. CI는 `.github/workflows/ci.yml`.

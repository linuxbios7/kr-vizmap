# 배포 가이드

## 구성
```
브라우저 ──▶ frontend (Next.js standalone, :3000) ──/api 프록시──▶ backend (FastAPI + 스케줄러, :8000) ──▶ SQLite(/data)
                                                                         └─ 네이버 증권 API (장중 5분 주기 수집)
```
- 브라우저는 frontend만 호출합니다. backend는 외부에 노출하지 않아도 됩니다.
- **/api 프록시 대상(`BACKEND_URL`)은 frontend 빌드 시점에 고정**됩니다. 주소가 바뀌면 다시 빌드해야 합니다.
- 수집 스케줄러는 backend 프로세스 안에서 돕니다. **backend 인스턴스는 1개(워커 1개)**만 띄우세요. 여러 개면 수집이 중복됩니다.

## 방법 A — 단일 서버 (Docker Compose, 권장)
VM 한 대(1 vCPU / 1GB 이상)에 Docker를 설치하고:

```bash
git clone <repo> krmap && cd krmap
cp .env.example .env        # 필요하면 값 수정
docker compose -f docker-compose.prod.yml up -d --build
```
- 기동 직후 전체 수집(시세 + 업종 + 1년치 일봉, 약 1~2분)이 자동으로 1회 돌고, 이후 평일 장중 5분마다·16:10에 갱신합니다.
- 진행 확인: `docker compose -f docker-compose.prod.yml logs -f backend`
- HTTPS: 앞단에 Caddy/Nginx를 두고 `:3000`으로 프록시합니다. (예: Caddyfile `map.example.com { reverse_proxy localhost:3000 }`)
- 데이터: `krmap-data` 볼륨의 `krmap.db` 하나입니다. 지워도 다음 수집 때 다시 채워집니다(백업 필수 아님).

## 방법 B — Vercel(frontend) + 서버/Fly.io(backend)
1. backend를 Docker로 배포합니다(`backend/Dockerfile`). `/data`에 영구 볼륨을 붙이고 `KRMAP_SCHEDULER_ENABLED=true`, 인스턴스 1개로 둡니다.
2. Vercel에서 `frontend` 폴더를 프로젝트 루트로 지정하고 환경변수 `BACKEND_URL=https://<backend 주소>`를 넣은 뒤 배포합니다. (빌드 시점 값이므로 바꾸면 재배포)

## 방법 C — GitHub Pages (서버 없이 무료)
GitHub Pages는 정적 파일만 서비스하므로 FastAPI 서버 대신 **GitHub Actions가 주기적으로 수집 → JSON 파일로 내보내기 → 정적 사이트 빌드 → 배포**합니다(`.github/workflows/pages.yml`).

1. GitHub에 저장소를 만들고 이 프로젝트를 `main` 브랜치로 push 합니다.
2. 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 바꿉니다.
3. **Actions → Pages → Run workflow**로 처음 한 번 실행합니다(첫 실행은 1년치 일봉 백필 포함 약 3~5분).
4. 주소: `https://<사용자>.github.io/<저장소>/` (경로 접두어는 워크플로가 자동으로 맞춥니다.)

동작 방식
- 평일 KST 09:00~15:45 15분마다, 16:40(장 마감 후)에 자동 실행. `main`에 push할 때도 배포합니다.
- 일봉 DB(SQLite)는 Actions 캐시로 실행 간에 이어 쓰므로 평소에는 시세만 갱신합니다. 캐시가 지워지면 다음 실행이 다시 백필합니다.
- 수집이 실패하면 그 실행은 배포하지 않아 직전 사이트가 그대로 남습니다. 화면은 마지막 수집이 오래되면(장중 60분 초과, 장 마감 후 당일 시세 없음) 지연 경고를 띄웁니다.

주의
- GitHub 예약 실행은 수 분~수십 분 늦거나 건너뛸 수 있어 **실시간성은 서버 방식보다 떨어집니다.** 공개 저장소에서 60일간 커밋이 없으면 예약 실행이 자동으로 꺼집니다.
- 수집은 GitHub(해외) 서버에서 네이버로 요청합니다. 네이버가 해외 IP를 막거나 제한하면 수집이 실패할 수 있습니다(Actions 로그 확인).
- 실행마다 DB 캐시(수십 MB)가 저장됩니다. 저장소 캐시 한도(10GB)를 넘으면 오래된 것부터 자동 삭제됩니다.
- Pages 사이트는 **누구나 볼 수 있는 공개 웹페이지**입니다. 네이버 시세 데이터의 재배포 허용 범위를 확인하세요.

로컬에서 미리 보기
```bash
cd backend && python -m app.jobs.export_static --out ../frontend/public/data
cd frontend && NEXT_EXPORT=1 NEXT_BASE_PATH=/FinvizMap npm run build   # 결과: frontend/out
```
`out` 폴더를 `<임의폴더>/FinvizMap/`으로 복사한 뒤 `python -m http.server --directory <임의폴더>`로 띄우고 `http://localhost:8000/FinvizMap/`을 엽니다. (Git Bash에서는 `MSYS_NO_PATHCONV=1`을 붙여야 `/FinvizMap`이 Windows 경로로 바뀌지 않습니다.)

## 환경변수
| 이름 | 위치 | 기본값 | 설명 |
|---|---|---|---|
| `KRMAP_DATABASE_URL` | backend | `sqlite:////data/krmap.db`(Docker) | SQLAlchemy URL. PostgreSQL도 가능(`postgresql+psycopg://...`, 드라이버 추가 설치 필요) |
| `KRMAP_SCHEDULER_ENABLED` | backend | `false` (prod compose는 `true`) | 자동 수집 |
| `KRMAP_INTRADAY_INTERVAL_MIN` | backend | `5` | 장중 수집 주기(분) |
| `BACKEND_URL` | frontend 빌드 | `http://127.0.0.1:8000` | /api 프록시 대상 (서버 모드) |
| `NEXT_EXPORT` | frontend 빌드 | 없음 | `1`이면 정적 사이트(`out/`)로 빌드, 데이터는 `/data/*.json` |
| `NEXT_BASE_PATH` | frontend 빌드 | `""` | 정적 사이트 경로 접두어 (예: `/FinvizMap`) |

## 모니터링
`GET /api/health` 응답을 가동 감시 서비스(UptimeRobot 등)로 1~5분마다 확인합니다.
```json
{"status":"ok","last_collected":"2026-10-26T15:22:51","stale":false,"last_error":null}
```
- `stale: true` — 장중 20분 넘게(수집 주기×4) 갱신이 없거나, 평일 장 마감 후 그날 시세가 없음. 화면에도 경고가 뜹니다.
- `last_error` — 마지막 수집 실패 내용. 실패해도 직전 스냅샷은 계속 서비스됩니다.
- 네이버 API는 비공식이라 응답 형식이 바뀌면 수집이 실패할 수 있습니다. `app/providers/naver.py`의 `parse_*` 함수와 `tests/test_services.py`를 먼저 확인하세요.

## 배포 전 확인
```bash
cd backend && pytest -q && ruff check .
cd frontend && npm run lint && npm run typecheck && npm test && npm run e2e
```

## 고지
화면 하단에 "출처 네이버증권(지연 시세) · 투자 권유 아님"이 표시됩니다. 공개·상용 서비스로 운영하기 전에 데이터 출처의 이용약관(재배포 허용 범위)을 확인하세요.

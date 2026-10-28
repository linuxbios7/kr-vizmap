FROM python:3.12-slim

ARG INSTALL_DEV=false
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TZ=Asia/Seoul \
    KRMAP_DATABASE_URL=sqlite:////data/krmap.db

WORKDIR /app
COPY pyproject.toml ./
COPY app ./app
RUN if [ "$INSTALL_DEV" = "true" ]; then pip install --no-cache-dir -e ".[dev]"; \
    else pip install --no-cache-dir .; fi
COPY tests ./tests

RUN useradd --create-home --uid 10001 app && mkdir -p /data && chown app /data
USER app
VOLUME ["/data"]

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')"
# 스케줄러가 API 프로세스 안에서 돌므로 워커는 1개 (여러 개면 수집이 중복된다)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--workers", "1"]

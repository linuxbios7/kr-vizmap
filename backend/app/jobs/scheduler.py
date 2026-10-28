"""장중 주기 수집 스케줄러 (KRMAP_SCHEDULER_ENABLED=true 일 때 API 프로세스에서 실행)."""

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.config import settings
from app.jobs.collector import run

log = logging.getLogger(__name__)
TZ = "Asia/Seoul"


def _safe(command: str):
    def job():
        try:
            run(command)
        except Exception:
            log.exception("collector job '%s' failed", command)

    return job


def start_scheduler() -> BackgroundScheduler:
    sched = BackgroundScheduler(timezone=TZ)
    every = settings.intraday_interval_min
    # 장중(09:00~15:59) N분마다 시세 갱신
    sched.add_job(
        _safe("refresh"),
        CronTrigger(day_of_week="mon-fri", hour="9-15", minute=f"*/{every}", timezone=TZ),
        id="intraday",
        max_instances=1,
        coalesce=True,
    )
    # 장 마감 후 확정 시세 + 업종 재매핑 + 신규 종목 백필
    sched.add_job(
        _safe("all"),
        CronTrigger(day_of_week="mon-fri", hour=16, minute=10, timezone=TZ),
        id="close",
        max_instances=1,
    )
    # 기동 직후 1회
    sched.add_job(_safe("all"), id="startup", max_instances=1)
    sched.start()
    log.info("scheduler started (intraday every %d min)", every)
    return sched

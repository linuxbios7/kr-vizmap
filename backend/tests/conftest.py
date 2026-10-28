import os
import tempfile

import pytest

# app 모듈을 import 하기 전에 테스트 전용 DB로 바꾼다.
_tmp = tempfile.mkdtemp(prefix="krmap-test-")
os.environ["KRMAP_DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["KRMAP_SCHEDULER_ENABLED"] = "false"

from app.providers.fake import FakeProvider, weekdays_back  # noqa: E402, F401


@pytest.fixture(scope="session")
def seeded_db():
    from app.db.session import SessionLocal, init_db
    from app.jobs.collector import backfill_history, refresh_quotes
    from app.services.map_builder import rebuild_snapshots

    init_db()
    provider = FakeProvider()
    with SessionLocal() as db:
        refresh_quotes(db, provider)
        backfill_history(db, provider, days=500, workers=2)
        rebuild_snapshots(db)
    return provider

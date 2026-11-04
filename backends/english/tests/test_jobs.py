import asyncio

import pytest

from conftest import ORIGIN, TEST_KEY, run_job
from english_grader.schemas import LLMGrade, ObjectiveRating
from gcse_shared.jobs import JobLimit, JobStore


def grade_output():
    return LLMGrade(level=3, awarded=8, objectives=[ObjectiveRating(code="AO1", rating="strong", comment="x")],
                    strengths=["a"], improvements=["b"], annotations=[], examiner_summary="c")


def test_start_returns_immediately_with_job_id(client, fake, submission):
    fake.next_output = grade_output()
    r = client.post("/grade", json=submission, headers=ORIGIN)
    assert r.status_code == 202
    assert r.json()["status"] == "pending" and len(r.json()["job_id"]) >= 16


def test_result_is_removed_after_first_read(client, fake, submission):
    fake.next_output = grade_output()
    job_id = client.post("/grade", json=submission, headers=ORIGIN).json()["job_id"]
    for _ in range(50):
        status = client.get(f"/jobs/{job_id}").json()
        if status["status"] != "pending":
            break
    assert status["status"] == "done"
    r = client.get(f"/jobs/{job_id}")
    assert r.status_code == 404 and r.json()["code"] == "job_missing"
    assert len(client.app.state.jobs) == 0


def test_other_session_cannot_read_job(client, fake, submission):
    fake.next_output = grade_output()
    job_id = client.post("/grade", json=submission, headers=ORIGIN).json()["job_id"]
    client.delete("/session/key", headers=ORIGIN)
    client.post("/session/key", json={"api_key": TEST_KEY + "-other"}, headers=ORIGIN)
    r = client.get(f"/jobs/{job_id}")
    assert r.status_code == 404 and r.json()["code"] == "job_missing"


def test_polling_requires_key(anon_client):
    r = anon_client.get("/jobs/anything")
    assert r.status_code == 401 and r.json()["code"] == "key_required"


def test_unknown_job(client):
    r = client.get("/jobs/does-not-exist")
    assert r.status_code == 404 and r.json()["code"] == "job_missing"


def test_result_never_logged(client, fake, submission, tmp_path):
    fake.next_output = grade_output()
    run_job(client, "/grade", submission)
    text = "".join(p.read_text() for p in (tmp_path / "logs").glob("*.log"))
    assert TEST_KEY not in text


# ---- JobStore unit tests ----

@pytest.mark.asyncio
async def test_store_limits_pending_per_owner():
    store = JobStore(ttl_seconds=60, max_pending_per_owner=1, max_jobs=10)
    gate = asyncio.Event()

    async def slow():
        await gate.wait()
        return grade_output()

    store.start("a", slow)
    with pytest.raises(JobLimit):
        store.start("a", slow)
    store.start("b", slow)  # other owners unaffected
    gate.set()


@pytest.mark.asyncio
async def test_store_expires_and_cancels():
    now = [0.0]
    store = JobStore(ttl_seconds=10, max_pending_per_owner=5, max_jobs=10, clock=lambda: now[0])

    async def forever():
        await asyncio.sleep(3600)
        return grade_output()

    job = store.start("a", forever)
    now[0] = 11
    assert store.take(job.id, "a") is None
    await asyncio.sleep(0)
    assert job.task.cancelled() or job.task.done()


@pytest.mark.asyncio
async def test_store_global_cap():
    store = JobStore(ttl_seconds=60, max_pending_per_owner=5, max_jobs=1)

    async def quick():
        return grade_output()

    store.start("a", quick)
    with pytest.raises(JobLimit):
        store.start("b", quick)

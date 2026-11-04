import time

import anthropic
import httpx
import pytest

from conftest import ORIGIN, TEST_KEK, TEST_KEY, run_job
from english_grader.schemas import LLMGrade, ObjectiveRating
from gcse_shared.key_session import KeySessionCodec, SessionExpired, SessionInvalid


def grade_output():
    return LLMGrade(level=3, awarded=8, objectives=[ObjectiveRating(code="AO1", rating="strong", comment="x")],
                    strengths=["a"], improvements=["b"], annotations=[], examiner_summary="c")


# ---- codec ----

def test_codec_roundtrip_and_tamper():
    codec = KeySessionCodec(TEST_KEK, 60, 600)
    token = codec.seal(TEST_KEY)
    assert TEST_KEY not in token
    assert codec.open(token).api_key == TEST_KEY
    with pytest.raises(SessionInvalid):
        codec.open(token[:-2] + ("A" if token[-2] != "A" else "B") + token[-1])


def test_codec_rejects_other_server_key():
    token = KeySessionCodec(TEST_KEK, 60, 600).seal(TEST_KEY)
    other = KeySessionCodec("ZmVkY2JhOTg3NjU0MzIxMGZlZGNiYTk4NzY1NDMyMTA=", 60, 600)
    with pytest.raises(SessionInvalid):
        other.open(token)


def test_codec_bad_kek():
    with pytest.raises(ValueError):
        KeySessionCodec("c2hvcnQ=", 60, 600)


def test_codec_idle_and_absolute_expiry():
    now = [1000.0]
    codec = KeySessionCodec(TEST_KEK, idle_seconds=60, absolute_seconds=150, clock=lambda: now[0])
    token = codec.seal(TEST_KEY)
    now[0] += 50
    token = codec.refresh(codec.open(token))  # used at t=50: idle window restarts
    now[0] += 50
    token = codec.refresh(codec.open(token))  # t=100, still fine
    now[0] += 55                               # t=155 > absolute 150
    with pytest.raises(SessionExpired):
        codec.open(token)
    fresh = codec.seal(TEST_KEY)
    now[0] += 61
    with pytest.raises(SessionExpired):
        codec.open(fresh)


# ---- API ----

def test_grade_requires_key(anon_client, submission):
    r = anon_client.post("/grade", json=submission, headers=ORIGIN)
    assert r.status_code == 401 and r.json()["code"] == "key_required"


def test_add_key_sets_secure_session_cookie(anon_client):
    r = anon_client.post("/session/key", json={"api_key": TEST_KEY}, headers=ORIGIN)
    assert r.status_code == 200
    cookie = r.headers["set-cookie"].lower()
    for flag in ("httponly", "secure", "samesite=strict", "path=/"):
        assert flag in cookie
    assert "max-age" not in cookie and "expires" not in cookie  # browser-session cookie
    assert TEST_KEY.lower() not in cookie
    body = r.json()
    assert body["active"] and body["absolute_expires_at"] - body["idle_expires_at"] == pytest.approx(100 * 60, abs=2)


def test_add_key_rejects_bad_format(anon_client, fake):
    r = anon_client.post("/session/key", json={"api_key": "hello"}, headers=ORIGIN)
    assert r.status_code == 422 and r.json()["code"] == "key_format"
    assert "set-cookie" not in r.headers


def test_add_key_rejects_key_claude_refuses(anon_client, fake):
    req = httpx.Request("GET", "https://api.anthropic.com/v1/models/x")
    fake.key_error = anthropic.AuthenticationError("bad", response=httpx.Response(401, request=req), body=None)
    r = anon_client.post("/session/key", json={"api_key": TEST_KEY}, headers=ORIGIN)
    assert r.status_code == 401 and r.json()["code"] == "invalid_api_key"
    assert "set-cookie" not in r.headers


def test_bad_origin_rejected(anon_client):
    r = anon_client.post("/session/key", json={"api_key": TEST_KEY}, headers={"Origin": "https://evil.example"})
    assert r.status_code == 403 and r.json()["code"] == "bad_origin"


def test_status_and_forget(client, submission):
    assert client.get("/session").json()["active"] is True
    r = client.delete("/session/key", headers=ORIGIN)
    assert r.json() == {"active": False, "idle_expires_at": None, "absolute_expires_at": None}
    assert client.get("/session").json()["active"] is False
    assert client.post("/grade", json=submission, headers=ORIGIN).json()["code"] == "key_required"


def test_grade_slides_idle_window(client, fake, submission):
    before = client.cookies.get("gcse_key")
    fake.next_output = grade_output()
    time.sleep(0.01)
    assert client.post("/grade", json=submission, headers=ORIGIN).status_code == 202
    assert client.cookies.get("gcse_key") != before


def test_idle_expiry_clears_cookie(client, fake, submission):
    codec = client.app.state.key_codec
    codec.clock = lambda: time.time() + 21 * 60
    r = client.post("/grade", json=submission, headers=ORIGIN)
    assert r.status_code == 401 and r.json()["code"] == "key_expired"
    assert 'gcse_key=""' in r.headers["set-cookie"] or "max-age=0" in r.headers["set-cookie"].lower()


def test_tampered_cookie(client, submission):
    client.cookies.clear()
    client.cookies.set("gcse_key", "v1.not-a-real-token")
    r = client.post("/grade", json=submission, headers=ORIGIN)
    assert r.status_code == 401 and r.json()["code"] == "key_invalid"


def test_key_never_written_to_logs(client, fake, submission, tmp_path):
    fake.next_output = grade_output()
    run_job(client, "/grade", submission)
    text = "".join(p.read_text() for p in (tmp_path / "logs").glob("*.log"))
    assert "check_key" in text  # the key check itself was logged…
    assert TEST_KEY not in text  # …but never the key


def test_grader_receives_session_key(client, fake, submission, monkeypatch):
    seen = {}
    import english_grader.grader as g
    real = g.structured_call

    async def spy(**kw):
        seen["key"] = kw["api_key"]
        return await real(**kw)
    monkeypatch.setattr(g, "structured_call", spy)
    fake.next_output = grade_output()
    run_job(client, "/grade", submission)
    assert seen["key"] == TEST_KEY

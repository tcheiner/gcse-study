import anthropic
import httpx
import pytest

from conftest import ORIGIN, run_job
from english_grader.schemas import Annotation, Change, LLMGrade, LLMModelAnswer, ObjectiveRating


def make_grade(level=3, awarded=8, codes=("AO1", "AO2")):
    return LLMGrade(
        level=level, awarded=awarded,
        objectives=[ObjectiveRating(code=c, rating="developing", comment="ok") for c in codes],
        strengths=["Good quote choice"], improvements=["Explore structure more"],
        annotations=[Annotation(quote="a sea of grey faces", kind="strength", note="Well chosen."),
                     Annotation(quote="not in the answer", kind="improve", note="Dropped.")],
        examiner_summary="A clear answer.",
    )


def graded(client, submission):
    status = run_job(client, "/grade", submission)
    assert status["status"] == "done", status
    return status["result"]


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_boards_lists_edexcel_with_tariffs(client):
    boards = client.get("/boards").json()
    edexcel = next(b for b in boards if b["id"] == "edexcel-igcse")
    assert edexcel["tariffs"] == [6, 9, 12]
    assert edexcel["status"] == "draft"


def test_grade_happy_path(client, fake, submission):
    fake.next_output = make_grade()
    body = graded(client, submission)
    assert body["awarded"] == 8 and body["max"] == 12 and body["level"] == 3
    assert body["word_count"] == len(submission["answer"].split())
    assert body["time_taken_seconds"] == 900
    assert [lv["level"] for lv in body["mark_scheme"]["levels"]] == [0, 1, 2, 3, 4]
    assert body["level_summary"]
    assert [a["quote"] for a in body["annotations"]] == ["a sea of grey faces"]  # non-verbatim quote dropped


def test_grade_prompt_contains_scheme_and_wraps_student_text(client, fake, submission):
    fake.next_output = make_grade()
    graded(client, submission)
    call = fake.calls[0]
    assert call["model"] == "claude-opus-5-5"
    assert call["fallbacks"] == "default"
    assert "Level 4 (10–12 marks)" in call["system"]
    assert "<student_response>" in call["messages"][0]["content"]
    assert submission["answer"] in call["messages"][0]["content"]


def test_grade_mark_out_of_range_is_clamped_and_level_derived(client, fake, submission):
    fake.next_output = make_grade(level=2, awarded=15)
    body = graded(client, submission)
    assert body["awarded"] == 12 and body["level"] == 4


def test_grade_level_follows_mark_when_inconsistent(client, fake, submission):
    fake.next_output = make_grade(level=4, awarded=5)
    body = graded(client, submission)
    assert body["awarded"] == 5 and body["level"] == 2


def test_grade_drops_unknown_objectives(client, fake, submission):
    fake.next_output = make_grade(codes=("AO2", "AO9", "AO1"))
    body = graded(client, submission)
    assert [o["code"] for o in body["objectives"]] == ["AO1", "AO2"]


@pytest.mark.parametrize("patch,code", [
    ({"question": "  "}, "question_required"),
    ({"answer": "too short"}, "answer_too_short"),
    ({"answer": "word " * 4000}, "answer_too_long"),
    ({"marks": 7}, "scheme_not_found"),
    ({"board": "../../etc"}, "scheme_not_found"),
])
def test_grade_validation_errors_are_immediate(client, fake, submission, patch, code):
    r = client.post("/grade", json={**submission, **patch}, headers=ORIGIN)
    assert r.status_code == 422 and r.json()["code"] == code
    assert fake.calls == []


def test_negative_time_rejected(client, submission):
    assert client.post("/grade", json={**submission, "time_taken_seconds": -1}, headers=ORIGIN).status_code == 422


@pytest.mark.parametrize("stop_reason,code", [("refusal", "refusal"), ("max_tokens", "truncated")])
def test_claude_stop_reasons_become_job_errors(client, fake, submission, stop_reason, code):
    fake.stop_reason = stop_reason
    status = run_job(client, "/grade", submission)
    assert status["status"] == "error" and status["code"] == code and status["result"] is None


def test_bad_api_key_becomes_job_error(client, fake, submission):
    req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    fake.error = anthropic.AuthenticationError("bad key", response=httpx.Response(401, request=req), body=None)
    status = run_job(client, "/grade", submission)
    assert status == {"status": "error", "result": None, "code": "invalid_api_key",
                      "message": "The Claude API key was rejected."}


def test_unexpected_exception_becomes_generic_job_error(client, fake, submission):
    fake.error = RuntimeError("boom")
    status = run_job(client, "/grade", submission)
    assert status["status"] == "error" and status["code"] == "upstream_error"


def test_rate_limit_counts_starts_not_polls(client, fake, submission):
    fake.next_output = make_grade()
    for _ in range(3):
        graded(client, submission)  # many polls each; only the 3 starts count
    r = client.post("/grade", json=submission, headers=ORIGIN)
    assert r.status_code == 429


def test_model_answer(client, fake, submission):
    fake.next_output = LLMModelAnswer(rewritten="Better essay", changes=[
        Change(what="Added structure", why="AO2", excerpt="Better"),
        Change(what="Invented", why="x", excerpt="not there")])
    status = run_job(client, "/model-answer", submission)
    assert status["status"] == "done"
    assert status["result"] == {"board": "edexcel-igcse", "max": 12, "rewritten": "Better essay",
                                "changes": [{"what": "Added structure", "why": "AO2", "excerpt": "Better"},
                                            {"what": "Invented", "why": "x", "excerpt": ""}]}
    system = fake.calls[0]["system"]
    assert "full marks (12/12)" in system and "Do not invent quotations" in system


def test_logs_are_written(client, fake, submission, tmp_path):
    fake.next_output = make_grade()
    graded(client, submission)
    text = "".join(p.read_text() for p in (tmp_path / "logs").glob("*.log"))
    assert "[ENTER] grade" in text and "[EXIT] grade" in text

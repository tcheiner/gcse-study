import anthropic
from conftest import ORIGIN
import httpx
import pytest

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


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_boards_lists_edexcel_with_tariffs(client):
    boards = client.get("/boards").json()
    edexcel = next(b for b in boards if b["id"] == "edexcel-igcse")
    assert edexcel["tariffs"] == [6, 9, 12]
    assert edexcel["status"] == "draft"


def test_grade_happy_path(client, fake, submission):
    fake.next_output = make_grade()
    r = client.post("/grade", json=submission, headers=ORIGIN)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["awarded"] == 8 and body["max"] == 12 and body["level"] == 3
    assert body["word_count"] == len(submission["answer"].split())
    assert body["time_taken_seconds"] == 900
    assert [lv["level"] for lv in body["mark_scheme"]["levels"]] == [0, 1, 2, 3, 4]
    assert body["level_summary"]
    assert [a["quote"] for a in body["annotations"]] == ["a sea of grey faces"]  # non-verbatim quote dropped


def test_grade_prompt_contains_scheme_and_wraps_student_text(client, fake, submission):
    fake.next_output = make_grade()
    client.post("/grade", json=submission, headers=ORIGIN)
    call = fake.calls[0]
    assert call["model"] == "claude-opus-5-5"
    assert call["fallbacks"] == "default"
    assert "Level 4 (10–12 marks)" in call["system"]
    assert "<student_response>" in call["messages"][0]["content"]
    assert submission["answer"] in call["messages"][0]["content"]


def test_grade_mark_out_of_range_is_clamped_and_level_derived(client, fake, submission):
    fake.next_output = make_grade(level=2, awarded=15)
    body = client.post("/grade", json=submission, headers=ORIGIN).json()
    assert body["awarded"] == 12 and body["level"] == 4


def test_grade_level_follows_mark_when_inconsistent(client, fake, submission):
    fake.next_output = make_grade(level=4, awarded=5)
    body = client.post("/grade", json=submission, headers=ORIGIN).json()
    assert body["awarded"] == 5 and body["level"] == 2


def test_grade_drops_unknown_objectives(client, fake, submission):
    fake.next_output = make_grade(codes=("AO2", "AO9", "AO1"))
    body = client.post("/grade", json=submission, headers=ORIGIN).json()
    assert [o["code"] for o in body["objectives"]] == ["AO1", "AO2"]


@pytest.mark.parametrize("patch,code", [
    ({"question": "  "}, "question_required"),
    ({"answer": "too short"}, "answer_too_short"),
    ({"answer": "word " * 4000}, "answer_too_long"),
    ({"marks": 7}, "scheme_not_found"),
    ({"board": "../../etc"}, "scheme_not_found"),
])
def test_grade_validation_errors(client, fake, submission, patch, code):
    r = client.post("/grade", json={**submission, **patch}, headers=ORIGIN)
    assert r.status_code == 422 and r.json()["code"] == code
    assert fake.calls == []


def test_negative_time_rejected(client, submission):
    assert client.post("/grade", json={**submission, "time_taken_seconds": -1}, headers=ORIGIN).status_code == 422


def test_refusal_maps_to_error(client, fake, submission):
    fake.stop_reason = "refusal"
    r = client.post("/grade", json=submission, headers=ORIGIN)
    assert r.status_code == 422 and r.json()["code"] == "refusal"


def test_truncated_maps_to_502(client, fake, submission):
    fake.stop_reason = "max_tokens"
    r = client.post("/grade", json=submission, headers=ORIGIN)
    assert r.status_code == 502 and r.json()["code"] == "truncated"


def test_bad_api_key_maps_to_401(client, fake, submission):
    req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    fake.error = anthropic.AuthenticationError("bad key", response=httpx.Response(401, request=req), body=None)
    r = client.post("/grade", json=submission, headers=ORIGIN)
    assert r.status_code == 401 and r.json()["code"] == "invalid_api_key"


def test_rate_limit(client, fake, submission):
    fake.next_output = make_grade()
    codes = [client.post("/grade", json=submission, headers=ORIGIN).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]


def test_model_answer(client, fake, submission):
    fake.next_output = LLMModelAnswer(rewritten="Better essay", changes=[
        Change(what="Added structure", why="AO2", excerpt="Better"),
        Change(what="Invented", why="x", excerpt="not there")])
    r = client.post("/model-answer", json=submission, headers=ORIGIN)
    assert r.status_code == 200, r.text
    assert r.json() == {"board": "edexcel-igcse", "max": 12, "rewritten": "Better essay",
                        "changes": [{"what": "Added structure", "why": "AO2", "excerpt": "Better"},
                                    {"what": "Invented", "why": "x", "excerpt": ""}]}
    system = fake.calls[0]["system"]
    assert "full marks (12/12)" in system and "Do not invent quotations" in system


def test_logs_are_written_and_redact_nothing_secret(client, fake, submission, settings_path, tmp_path):
    fake.next_output = make_grade()
    client.post("/grade", json=submission, headers=ORIGIN)
    logs = list((tmp_path / "logs").glob("*.log"))
    assert len(logs) == 1
    text = logs[0].read_text()
    assert "[ENTER] grade" in text and "[EXIT] grade" in text

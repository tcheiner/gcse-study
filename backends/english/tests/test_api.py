import anthropic
import httpx
import pytest

from conftest import ORIGIN, run_job
from conftest import make_grade
from english_grader.schemas import Change, LLMModelAnswer


def graded(client, submission):
    status = run_job(client, "/grade", submission)
    assert status["status"] == "done", status
    return status["result"]


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_boards_lists_cambridge_composition(client):
    boards = client.get("/boards").json()
    assert [b["id"] for b in boards] == ["cambridge-0990"]
    assert boards[0]["tariffs"] == [40] and boards[0]["status"] == "official"


def test_grade_happy_path(client, fake, submission):
    fake.next_output = make_grade(cs=11, sa=17)
    body = graded(client, submission)
    assert body["awarded"] == 28 and body["max"] == 40 and body["genre"] == "descriptive"
    cs, sa = body["grids"]
    assert (cs["id"], cs["score"], cs["max"], cs["level"]) == ("content_structure", 11, 16, "Level 5")
    assert (sa["id"], sa["score"], sa["max"], sa["level"]) == ("style_accuracy", 17, 24, "Level 5")
    assert [lv["name"] for lv in cs["levels"]] == [f"Level {n}" for n in (6, 5, 4, 3, 2, 1, 0)]
    assert cs["justification"] and cs["level_summary"]
    assert body["level_drop"] == {"triggered": False, "explanation": "No critical errors."}
    assert body["level_up_steps"] == ["Vary the focus.", "Use a semicolon."]
    assert body["word_count"] == len(submission["answer"].split()) and body["time_taken_seconds"] == 900
    assert [a["quote"] for a in body["annotations"]] == ["folded like a sleeper's"]  # non-verbatim quote dropped


def test_grade_prompt_contains_official_grids_and_wraps_student_text(client, fake, submission):
    fake.next_output = make_grade()
    graded(client, submission)
    call = fake.calls[0]
    assert call["model"] == "claude-opus-5-5" and call["fallbacks"] == "default"
    system = call["system"]
    assert "Cambridge CIE IGCSE First Language English (0990) Examiner" in system
    assert "Do not count literary devices or use a point-by-point checklist" in system
    assert "Level 6 (14–16 marks)" in system and "Level 3 (9–12 marks)" in system
    assert "Narrative: Crafts a well-defined and strongly developed plot" in system
    assert "<student_response>" in call["messages"][0]["content"]
    assert submission["answer"] in call["messages"][0]["content"]


@pytest.mark.parametrize("cs,sa,expected", [
    (20, 30, (16, 24, 40, "Level 6", "Level 6")),
    (-3, 0, (0, 0, 0, "Level 0", "Level 0")),
    (7, 9, (7, 9, 16, "Level 3", "Level 3")),
    (8, 12, (8, 12, 20, "Level 4", "Level 3")),
])
def test_scores_clamped_levels_derived_total_summed(client, fake, submission, cs, sa, expected):
    fake.next_output = make_grade(cs=cs, sa=sa)
    body = graded(client, submission)
    c, s = body["grids"]
    assert (c["score"], s["score"], body["awarded"], c["level"], s["level"]) == expected


def test_level_up_steps_trimmed_to_two(client, fake, submission):
    fake.next_output = make_grade(steps=("One.", " ", "Two.", "Three."))
    assert graded(client, submission)["level_up_steps"] == ["One.", "Two."]


def test_level_drop_reported(client, fake, submission):
    out = make_grade(genre="narrative")
    out.level_drop.triggered, out.level_drop.explanation = True, "Ends with a dream sequence."
    fake.next_output = out
    body = graded(client, submission)
    assert body["genre"] == "narrative" and body["level_drop"]["triggered"] is True


@pytest.mark.parametrize("patch,code", [
    ({"question": "  "}, "question_required"),
    ({"answer": "too short"}, "answer_too_short"),
    ({"answer": "word " * 4000}, "answer_too_long"),
    ({"marks": 12}, "scheme_not_found"),
    ({"board": "../../etc"}, "scheme_not_found"),
    ({"board": "edexcel-igcse"}, "scheme_not_found"),
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
    assert status["result"] == {"board": "cambridge-0990", "max": 40, "rewritten": "Better essay",
                                "changes": [{"what": "Added structure", "why": "AO2", "excerpt": "Better"},
                                            {"what": "Invented", "why": "x", "excerpt": ""}]}
    system = fake.calls[0]["system"]
    assert "full marks (40/40)" in system and "Keep the student's chosen genre" in system
    assert "Style & Accuracy (21–24 of 24)" in system


def test_logs_are_written(client, fake, submission, tmp_path):
    fake.next_output = make_grade()
    graded(client, submission)
    text = "".join(p.read_text() for p in (tmp_path / "logs").glob("*.log"))
    assert "[ENTER] grade" in text and "[EXIT] grade" in text

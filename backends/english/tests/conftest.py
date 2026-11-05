from __future__ import annotations

import time
from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml
from fastapi.testclient import TestClient

from gcse_shared.config import load_settings

BACKEND = Path(__file__).resolve().parents[1]

GOOD_ANSWER = (
    "The clock had stopped at twenty past four, its hands folded like a sleeper's. Dust lay in a grey "
    "velvet over the glass. Nobody wound it now."
)


def make_grade(cs=11, sa=17, genre="descriptive", steps=("Vary the focus.", "Use a semicolon.")):
    from english_grader.schemas import Annotation, GridScore, LevelDrop, LLMGrade
    return LLMGrade(
        genre=genre,
        content_structure=GridScore(score=cs, justification="Well focused and developed."),
        style_accuracy=GridScore(score=sa, justification="Mostly precise vocabulary."),
        level_drop=LevelDrop(triggered=False, explanation="No critical errors."),
        level_up_steps=list(steps),
        annotations=[Annotation(quote="folded like a sleeper's", kind="strength", note="Striking image."),
                     Annotation(quote="not in the answer", kind="improve", note="Dropped.")],
    )


class FakeMessages:
    def __init__(self, owner: "FakeClient") -> None:
        self.owner = owner

    async def parse(self, **kwargs):
        self.owner.calls.append(kwargs)
        if self.owner.error:
            raise self.owner.error
        return SimpleNamespace(stop_reason=self.owner.stop_reason, parsed_output=self.owner.next_output)


class FakeClient:
    """Stands in for anthropic.AsyncAnthropic: records calls, returns a canned parsed_output."""

    def __init__(self) -> None:
        self.calls: list[dict] = []
        self.next_output = None
        self.stop_reason = "end_turn"
        self.error: Exception | None = None
        self.messages = FakeMessages(self)
        self.beta = SimpleNamespace(messages=FakeMessages(self))
        self.key_error: Exception | None = None
        self.models = SimpleNamespace(retrieve=self._retrieve)

    async def _retrieve(self, model: str):
        if self.key_error:
            raise self.key_error
        return SimpleNamespace(id=model)


@pytest.fixture
def settings_path(tmp_path: Path) -> str:
    settings = yaml.safe_load((BACKEND / "config" / "settings.yaml").read_text())
    settings["logging"]["dir"] = str(tmp_path / "logs")
    settings["mark_schemes_dir"] = str(BACKEND / "config" / "mark_schemes")
    settings["prompts_dir"] = str(BACKEND / "src" / "english_grader" / "prompts")
    settings["api"]["rate_limit"]["requests"] = 4  # 1 for adding the key + 3 marking calls
    settings["secrets_file"] = str(tmp_path / "no-secrets.env")
    (tmp_path / "config").mkdir()
    path = tmp_path / "config" / "settings.yaml"
    path.write_text(yaml.safe_dump(settings))
    load_settings.cache_clear()
    return str(path)


@pytest.fixture
def fake() -> FakeClient:
    return FakeClient()


TEST_KEY = "sk-ant-test-0123456789"
TEST_KEK = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="  # 32 bytes, tests only
ORIGIN = {"Origin": "http://localhost:3000"}


@pytest.fixture
def anon_client(settings_path: str, fake: FakeClient, monkeypatch):
    from english_grader.main import create_app

    monkeypatch.setenv("KEY_ENCRYPTION_KEY", TEST_KEK)
    app = create_app(settings_path)
    app.state.llm_client = fake
    # https so the Secure cookie is sent back; `with` keeps one event loop alive for background jobs
    with TestClient(app, base_url="https://testserver") as c:
        yield c


@pytest.fixture
def client(anon_client: TestClient) -> TestClient:
    r = anon_client.post("/session/key", json={"api_key": TEST_KEY}, headers=ORIGIN)
    assert r.status_code == 200, r.text
    return anon_client


@pytest.fixture
def submission() -> dict:
    return {"board": "cambridge-0990", "marks": 40, "question": "Describe an object that has been broken for a long time.",
            "answer": GOOD_ANSWER, "time_taken_seconds": 900}


def run_job(client: TestClient, path: str, body: dict, polls: int = 50) -> dict:
    """Start a job, poll until it finishes, return the final JobStatus JSON."""
    r = client.post(path, json=body, headers=ORIGIN)
    assert r.status_code == 202, r.text
    job_id = r.json()["job_id"]
    for _ in range(polls):
        status = client.get(f"/jobs/{job_id}").json()
        if status["status"] != "pending":
            return status
        time.sleep(0.01)
    raise AssertionError("job never finished")

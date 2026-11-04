from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml
from fastapi.testclient import TestClient

from gcse_shared.config import load_settings

BACKEND = Path(__file__).resolve().parents[1]

GOOD_ANSWER = (
    "The writer uses the metaphor 'a sea of grey faces' to suggest the crowd is overwhelming and "
    "anonymous. The short sentence 'Nobody moved.' slows the pace and builds tension."
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
def anon_client(settings_path: str, fake: FakeClient, monkeypatch) -> TestClient:
    from english_grader.main import create_app

    monkeypatch.setenv("KEY_ENCRYPTION_KEY", TEST_KEK)
    app = create_app(settings_path)
    app.state.llm_client = fake
    # https so the Secure cookie is sent back by the test client
    return TestClient(app, base_url="https://testserver")


@pytest.fixture
def client(anon_client: TestClient) -> TestClient:
    r = anon_client.post("/session/key", json={"api_key": TEST_KEY}, headers=ORIGIN)
    assert r.status_code == 200, r.text
    return anon_client


@pytest.fixture
def submission() -> dict:
    return {"board": "edexcel-igcse", "marks": 12, "question": "How does the writer create tension?",
            "answer": GOOD_ANSWER, "time_taken_seconds": 900}

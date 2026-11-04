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


@pytest.fixture
def settings_path(tmp_path: Path) -> str:
    settings = yaml.safe_load((BACKEND / "config" / "settings.yaml").read_text())
    settings["logging"]["dir"] = str(tmp_path / "logs")
    settings["mark_schemes_dir"] = str(BACKEND / "config" / "mark_schemes")
    settings["prompts_dir"] = str(BACKEND / "src" / "english_grader" / "prompts")
    settings["api"]["rate_limit"]["requests"] = 3
    (tmp_path / "config").mkdir()
    path = tmp_path / "config" / "settings.yaml"
    path.write_text(yaml.safe_dump(settings))
    load_settings.cache_clear()
    return str(path)


@pytest.fixture
def fake() -> FakeClient:
    return FakeClient()


@pytest.fixture
def client(settings_path: str, fake: FakeClient) -> TestClient:
    from english_grader.main import create_app

    app = create_app(settings_path)
    app.state.llm_client = fake
    return TestClient(app)


@pytest.fixture
def submission() -> dict:
    return {"board": "edexcel-igcse", "marks": 12, "question": "How does the writer create tension?",
            "answer": GOOD_ANSWER, "time_taken_seconds": 900}

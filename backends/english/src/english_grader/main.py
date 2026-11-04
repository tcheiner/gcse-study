"""FastAPI app for English Paper 2 grading."""
from __future__ import annotations

import os
import time
from collections import defaultdict, deque
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from gcse_shared.config import load_settings
from gcse_shared.llm import LLMError, LLMSettings
from gcse_shared.logging import logged, setup_logging

from . import grader
from .mark_schemes import MarkSchemeRepo, SchemeNotFound
from .schemas import BoardInfo, GradeResponse, ModelAnswerResponse, SubmissionRequest

BACKEND_ROOT = Path(__file__).resolve().parents[2]
SETTINGS_PATH = os.environ.get("ENGLISH_SETTINGS", str(BACKEND_ROOT / "config" / "settings.yaml"))


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        self.status, self.code, self.message = status, code, message


class RateLimiter:
    """In-memory sliding window per client IP. Fine for one process; use Redis for more."""

    def __init__(self, requests: int, window: float) -> None:
        self.requests, self.window = requests, window
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > self.window:
            hits.popleft()
        if len(hits) >= self.requests:
            raise ApiError(429, "rate_limited", "Too many requests. Please wait a moment.")
        hits.append(now)


def create_app(settings_path: str = SETTINGS_PATH) -> FastAPI:
    settings = load_settings(settings_path)
    root = Path(settings_path).resolve().parents[1]
    setup_logging((root / settings["logging"]["dir"]).resolve(), settings["logging"]["mode"])

    llm = LLMSettings(**settings["llm"])
    limits = settings["limits"]
    repo = MarkSchemeRepo(root / settings["mark_schemes_dir"])
    prompts = grader.Prompts(root / settings["prompts_dir"])
    limiter = RateLimiter(settings["api"]["rate_limit"]["requests"],
                          settings["api"]["rate_limit"]["window_seconds"])

    app = FastAPI(title="GCSE English grader")
    app.state.llm_client = None  # tests inject a fake client here
    app.add_middleware(
        CORSMiddleware, allow_origins=settings["api"]["cors_origins"],
        allow_methods=["GET", "POST"], allow_headers=["*"],
    )

    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError):
        return JSONResponse(status_code=exc.status, content={"code": exc.code, "message": exc.message})

    @app.exception_handler(LLMError)
    async def _llm_error(_: Request, exc: LLMError):
        status = {"invalid_api_key": 401, "permission_denied": 403, "rate_limited": 429,
                  "refusal": 422, "bad_request": 400}.get(exc.code, 502)
        return JSONResponse(status_code=status, content={"code": exc.code, "message": str(exc)})

    def api_key() -> str | None:
        # Placeholder until login + per-profile keys land: SDK resolves from the environment.
        return None

    def rate_limit(request: Request) -> None:
        limiter.check(request.client.host if request.client else "unknown")

    @logged
    def validate(req: SubmissionRequest):
        if not req.question.strip():
            raise ApiError(422, "question_required", "Enter the exam question.")
        if len(req.question) > limits["question_max_chars"]:
            raise ApiError(422, "question_too_long", "The question is too long.")
        if len(req.answer.strip()) < limits["answer_min_chars"]:
            raise ApiError(422, "answer_too_short", "The answer is too short to mark.")
        if len(req.answer) > limits["answer_max_chars"]:
            raise ApiError(422, "answer_too_long", "The answer is too long.")
        try:
            return repo.get(req.board, req.marks)
        except SchemeNotFound as e:
            raise ApiError(422, "scheme_not_found", str(e)) from e

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get("/boards", response_model=list[BoardInfo])
    def boards():
        return repo.boards()

    @app.post("/grade", response_model=GradeResponse, dependencies=[Depends(rate_limit)])
    async def grade(req: SubmissionRequest, key: str | None = Depends(api_key)):
        ms = validate(req)
        return await grader.grade(req, ms, prompts, llm, key, client=app.state.llm_client)

    @app.post("/model-answer", response_model=ModelAnswerResponse, dependencies=[Depends(rate_limit)])
    async def model_answer(req: SubmissionRequest, key: str | None = Depends(api_key)):
        ms = validate(req)
        return await grader.model_answer(req, ms, prompts, llm, key, client=app.state.llm_client)

    return app


app = create_app()

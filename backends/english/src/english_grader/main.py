"""FastAPI app for English Paper 2 grading."""
from __future__ import annotations

import hashlib
import os
import time
from collections import defaultdict, deque
from pathlib import Path

from fastapi import Depends, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from gcse_shared.config import load_settings
from gcse_shared.jobs import JobLimit, JobStore
from gcse_shared.key_session import KeySession, KeySessionCodec, SessionExpired, SessionInvalid
from gcse_shared.llm import LLMError, LLMSettings, check_key
from gcse_shared.logging import logged, setup_logging
from gcse_shared.secrets import load_secrets, require

from . import grader
from .mark_schemes import MarkSchemeRepo, SchemeNotFound
from .schemas import (
    BoardInfo, JobStarted, JobStatus, KeyRequest, SessionStatus, SubmissionRequest,
)

BACKEND_ROOT = Path(__file__).resolve().parents[2]
SETTINGS_PATH = os.environ.get("ENGLISH_SETTINGS", str(BACKEND_ROOT / "config" / "settings.yaml"))


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, clear_session: bool = False) -> None:
        self.status, self.code, self.message = status, code, message
        self.clear_session = clear_session


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
    load_secrets((root / settings["secrets_file"]).resolve())

    sess = settings["session"]
    codec = KeySessionCodec(require("KEY_ENCRYPTION_KEY"),
                            idle_seconds=int(sess["idle_minutes"] * 60),
                            absolute_seconds=int(sess["absolute_minutes"] * 60))
    allowed_origins = set(settings["api"]["cors_origins"])
    jobs = JobStore(**settings["jobs"])

    llm = LLMSettings(**settings["llm"])
    limits = settings["limits"]
    repo = MarkSchemeRepo(root / settings["mark_schemes_dir"])
    prompts = grader.Prompts(root / settings["prompts_dir"])
    limiter = RateLimiter(settings["api"]["rate_limit"]["requests"],
                          settings["api"]["rate_limit"]["window_seconds"])

    app = FastAPI(title="GCSE English grader")
    app.state.llm_client = None  # tests inject a fake client here
    app.state.key_codec = codec
    app.state.jobs = jobs
    app.add_middleware(
        CORSMiddleware, allow_origins=settings["api"]["cors_origins"], allow_credentials=True,
        allow_methods=["GET", "POST", "DELETE"], allow_headers=["Content-Type"],
    )

    def set_session_cookie(response: Response, token: str) -> None:
        # No max_age/expires: a browser-session cookie, gone when the browser closes.
        response.set_cookie(sess["cookie_name"], token, httponly=True, secure=sess["secure_cookie"],
                            samesite=sess["same_site"], path="/")

    def clear_session_cookie(response: Response) -> None:
        response.delete_cookie(sess["cookie_name"], path="/", httponly=True,
                               secure=sess["secure_cookie"], samesite=sess["same_site"])

    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError):
        resp = JSONResponse(status_code=exc.status, content={"code": exc.code, "message": exc.message})
        if exc.clear_session:
            clear_session_cookie(resp)
        return resp

    @app.exception_handler(LLMError)
    async def _llm_error(_: Request, exc: LLMError):
        status = {"invalid_api_key": 401, "permission_denied": 403, "rate_limited": 429,
                  "refusal": 422, "bad_request": 400}.get(exc.code, 502)
        return JSONResponse(status_code=status, content={"code": exc.code, "message": str(exc)})

    def same_origin(request: Request) -> None:
        # CSRF defence in depth (cookie is already SameSite=strict): reject foreign Origins.
        origin = request.headers.get("origin")
        if origin and origin not in allowed_origins:
            raise ApiError(403, "bad_origin", "Request origin not allowed.")

    def current_session(request: Request) -> KeySession:
        token = request.cookies.get(sess["cookie_name"])
        if not token:
            raise ApiError(401, "key_required", "Add your Claude API key to continue.")
        try:
            return codec.open(token)
        except SessionExpired:
            raise ApiError(401, "key_expired", "Your key was forgotten for safety. Please add it again.", True)
        except SessionInvalid:
            raise ApiError(401, "key_invalid", "Please add your Claude API key again.", True)

    def owner_of(session: KeySession) -> str:
        # Jobs belong to the session that started them. Hash only; held in memory, never logged.
        return hashlib.sha256(f"{session.api_key}|{session.issued_at}".encode()).hexdigest()

    def start_job(session: KeySession, work) -> JobStarted:
        try:
            return JobStarted(job_id=jobs.start(owner_of(session), work).id)
        except JobLimit:
            raise ApiError(429, "rate_limited", "Too many requests in progress. Please wait a moment.")

    def status_for(session: KeySession) -> SessionStatus:
        idle, absolute = codec.expiries(session)
        return SessionStatus(active=True, idle_expires_at=idle, absolute_expires_at=absolute)

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

    @app.post("/session/key", response_model=SessionStatus, dependencies=[Depends(same_origin), Depends(rate_limit)])
    async def add_key(body: KeyRequest, response: Response):
        key = body.api_key.strip()
        if not key.startswith(sess["key_prefix"]) or len(key) > sess["key_max_chars"]:
            raise ApiError(422, "key_format", "That doesn't look like a Claude API key.")
        await check_key(api_key=key, model=llm.model, timeout=llm.timeout_seconds, client=app.state.llm_client)
        token = codec.seal(key)
        set_session_cookie(response, token)
        return status_for(codec.open(token))

    @app.get("/session", response_model=SessionStatus)
    def session_status(request: Request, response: Response):
        try:
            return status_for(current_session(request))
        except ApiError:
            clear_session_cookie(response)
            return SessionStatus(active=False)

    @app.delete("/session/key", response_model=SessionStatus, dependencies=[Depends(same_origin)])
    def forget_key(response: Response):
        clear_session_cookie(response)
        return SessionStatus(active=False)

    # Slow Claude calls run as background jobs: start returns 202 at once, the browser polls /jobs/{id}.
    @app.post("/grade", status_code=202, response_model=JobStarted,
              dependencies=[Depends(same_origin), Depends(rate_limit)])
    async def grade(req: SubmissionRequest, response: Response, session: KeySession = Depends(current_session)):
        ms = validate(req)
        started = start_job(session, lambda: grader.grade(req, ms, prompts, llm, session.api_key,
                                                          client=app.state.llm_client))
        set_session_cookie(response, codec.refresh(session))
        return started

    @app.post("/model-answer", status_code=202, response_model=JobStarted,
              dependencies=[Depends(same_origin), Depends(rate_limit)])
    async def model_answer(req: SubmissionRequest, response: Response,
                           session: KeySession = Depends(current_session)):
        ms = validate(req)
        started = start_job(session, lambda: grader.model_answer(req, ms, prompts, llm, session.api_key,
                                                                 client=app.state.llm_client))
        set_session_cookie(response, codec.refresh(session))
        return started

    @app.get("/jobs/{job_id}", response_model=JobStatus)
    def job_status(job_id: str, response: Response, session: KeySession = Depends(current_session)):
        job = jobs.take(job_id, owner_of(session))
        if job is None:
            raise ApiError(404, "job_missing", "That result is no longer available. Please try again.")
        set_session_cookie(response, codec.refresh(session))
        if job.status == "pending":
            return JobStatus(status="pending")
        if job.status == "error":
            return JobStatus(status="error", code=job.code, message=job.message)
        return JobStatus(status="done", result=job.result)

    return app


app = create_app()

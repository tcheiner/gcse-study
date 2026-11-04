"""In-memory background jobs for slow Claude calls.

Why: proxies in front of the API (Netlify) cut requests off after a few tens of seconds, but a
full-marks rewrite can take longer. A request starts a job and returns at once; the browser polls.

Privacy: results live only in this process's memory, are bound to the student's session (owner),
are removed on first read, and expire after `ttl_seconds`. Nothing is written to disk or logged.
Assumes a single server process (Render free plan); several instances would need shared storage.
"""
from __future__ import annotations

import asyncio
import logging
import secrets
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Literal

from pydantic import BaseModel

from .llm import LLMError
from .logging import LOGGER_NAME

log = logging.getLogger(LOGGER_NAME)

Status = Literal["pending", "done", "error"]


class JobLimit(Exception):
    """Too many jobs (for this owner or overall)."""


@dataclass
class Job:
    id: str
    owner: str
    created: float
    status: Status = "pending"
    result: dict[str, Any] | None = field(default=None, repr=False)
    code: str | None = None
    message: str | None = None
    task: asyncio.Task | None = field(default=None, repr=False)


class JobStore:
    def __init__(self, ttl_seconds: int, max_pending_per_owner: int, max_jobs: int,
                 clock: Callable[[], float] = time.monotonic) -> None:
        self.ttl = ttl_seconds
        self.max_pending_per_owner = max_pending_per_owner
        self.max_jobs = max_jobs
        self.clock = clock
        self._jobs: dict[str, Job] = {}

    def _sweep(self) -> None:
        now = self.clock()
        for job_id in [j.id for j in self._jobs.values() if now - j.created > self.ttl]:
            job = self._jobs.pop(job_id)
            if job.task and not job.task.done():
                job.task.cancel()

    def start(self, owner: str, work: Callable[[], Awaitable[BaseModel]]) -> Job:
        self._sweep()
        pending = sum(1 for j in self._jobs.values() if j.owner == owner and j.status == "pending")
        if pending >= self.max_pending_per_owner or len(self._jobs) >= self.max_jobs:
            raise JobLimit()
        job = Job(id=secrets.token_urlsafe(16), owner=owner, created=self.clock())
        self._jobs[job.id] = job
        job.task = asyncio.create_task(self._run(job, work))
        return job

    async def _run(self, job: Job, work: Callable[[], Awaitable[BaseModel]]) -> None:
        try:
            job.result = (await work()).model_dump()
            job.status = "done"
        except LLMError as e:
            job.status, job.code, job.message = "error", e.code, str(e)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # never leave a job pending forever
            log.error("job failed: %s", type(e).__name__, extra={"phase": "ERROR", "fn": "JobStore._run"})
            job.status, job.code, job.message = "error", "upstream_error", "Something went wrong while marking."

    def take(self, job_id: str, owner: str) -> Job | None:
        """Return the job if it belongs to `owner`. Finished jobs are removed on read."""
        self._sweep()
        job = self._jobs.get(job_id)
        if job is None or not secrets.compare_digest(job.owner, owner):
            return None
        if job.status != "pending":
            del self._jobs[job_id]
        return job

    def __len__(self) -> int:
        return len(self._jobs)

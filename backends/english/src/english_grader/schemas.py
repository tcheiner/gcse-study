"""Request/response models for the English grading API."""
from typing import Literal

from pydantic import BaseModel, Field


class SubmissionRequest(BaseModel):
    board: str = Field(..., description="Exam board id, e.g. 'cambridge-0990'")
    marks: int = Field(..., description="Question tariff, e.g. 40 for a composition")
    question: str
    answer: str
    time_taken_seconds: int | None = Field(None, ge=0, description="How long the student spent writing")


# ---- What Claude returns (structured output) ----

class GridScore(BaseModel):
    score: int
    justification: str


class LevelDrop(BaseModel):
    triggered: bool
    explanation: str


class Annotation(BaseModel):
    quote: str
    kind: Literal["strength", "improve"]
    note: str


class LLMGrade(BaseModel):
    genre: Literal["descriptive", "narrative"]
    content_structure: GridScore
    style_accuracy: GridScore
    level_drop: LevelDrop
    level_up_steps: list[str]
    annotations: list[Annotation]


class Change(BaseModel):
    what: str
    why: str
    excerpt: str = ""


class LLMModelAnswer(BaseModel):
    rewritten: str
    changes: list[Change]


# ---- What the API returns to the frontend ----

class LevelInfo(BaseModel):
    name: str
    min: int
    max: int
    student_summary: str


class GridResult(BaseModel):
    id: str
    label: str
    student_summary: str
    score: int
    max: int
    level: str
    level_summary: str
    justification: str
    levels: list[LevelInfo]


class GradeResponse(BaseModel):
    board: str
    word_count: int
    time_taken_seconds: int | None
    awarded: int
    max: int
    genre: str
    grids: list[GridResult]
    level_drop: LevelDrop
    level_up_steps: list[str]
    annotations: list[Annotation]
    overview: str
    status: str


class ModelAnswerResponse(BaseModel):
    board: str
    max: int
    rewritten: str
    changes: list[Change]


class BoardInfo(BaseModel):
    id: str
    name: str
    specification: str
    paper: int
    tariffs: list[int]
    status: str


class ErrorResponse(BaseModel):
    code: str
    message: str


class KeyRequest(BaseModel):
    api_key: str


class SessionStatus(BaseModel):
    active: bool
    idle_expires_at: float | None = None
    absolute_expires_at: float | None = None


class JobStarted(BaseModel):
    job_id: str
    status: Literal["pending"] = "pending"


class JobStatus(BaseModel):
    status: Literal["pending", "done", "error"]
    result: dict | None = None
    code: str | None = None
    message: str | None = None

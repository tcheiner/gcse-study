"""Request/response models for the English grading API."""
from typing import Literal

from pydantic import BaseModel, Field


class SubmissionRequest(BaseModel):
    board: str = Field(..., description="Exam board id, e.g. 'edexcel-igcse'")
    marks: int = Field(..., description="Question tariff: 6, 9 or 12")
    question: str
    answer: str
    time_taken_seconds: int | None = Field(None, ge=0, description="How long the student spent writing")


# ---- What Claude returns (structured output) ----

class ObjectiveRating(BaseModel):
    code: str
    rating: Literal["strong", "developing", "limited"]
    comment: str


class Annotation(BaseModel):
    quote: str
    kind: Literal["strength", "improve"]
    note: str


class LLMGrade(BaseModel):
    level: int
    awarded: int
    objectives: list[ObjectiveRating]
    strengths: list[str]
    improvements: list[str]
    annotations: list[Annotation]
    examiner_summary: str


class Change(BaseModel):
    what: str
    why: str
    excerpt: str = ""


class LLMModelAnswer(BaseModel):
    rewritten: str
    changes: list[Change]


# ---- What the API returns to the frontend ----

class ObjectiveInfo(BaseModel):
    code: str
    label: str
    student_summary: str


class LevelInfo(BaseModel):
    level: int
    min: int
    max: int
    student_summary: str


class MarkSchemeExplainer(BaseModel):
    overview: str
    objectives: list[ObjectiveInfo]
    levels: list[LevelInfo]
    status: str


class GradeResponse(BaseModel):
    board: str
    word_count: int
    time_taken_seconds: int | None
    awarded: int
    max: int
    level: int
    level_summary: str
    objectives: list[ObjectiveRating]
    strengths: list[str]
    improvements: list[str]
    annotations: list[Annotation]
    examiner_summary: str
    mark_scheme: MarkSchemeExplainer


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

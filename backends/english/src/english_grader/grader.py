"""Grading and model-answer logic: build prompts from the mark scheme, call Claude, sanity-check the result."""
from __future__ import annotations

import logging
from pathlib import Path
from string import Template

from gcse_shared.llm import LLMSettings, structured_call
from gcse_shared.logging import LOGGER_NAME, logged

from .mark_schemes import MarkScheme
from .schemas import (
    GradeResponse, GridResult, GridScore, LevelInfo, LLMGrade, LLMModelAnswer, ModelAnswerResponse,
    SubmissionRequest,
)

log = logging.getLogger(LOGGER_NAME)

GRID_FIELDS = ("content_structure", "style_accuracy")  # LLMGrade field per grid id, in marking order
MAX_ANNOTATIONS = 8
LEVEL_UP_STEPS = 2


def word_count(text: str) -> int:
    return len(text.split())


class Prompts:
    def __init__(self, directory: Path) -> None:
        self._t = {p.stem: Template(p.read_text(encoding="utf-8")) for p in directory.glob("*.md")}

    def render(self, name: str, **values: object) -> str:
        return self._t[name].safe_substitute(**values)


def _marks(lv: dict) -> str:
    return f"{lv['min']}–{lv['max']}" if lv["min"] != lv["max"] else str(lv["min"])


def _level_lines(lv: dict) -> str:
    lines = [f"- {lv['name']} ({_marks(lv)} marks): {lv['descriptor']}"]
    lines += [f"    {genre.capitalize()}: {lv[genre]}" for genre in ("descriptive", "narrative") if lv.get(genre)]
    return "\n".join(lines)


def _scheme_values(ms: MarkScheme) -> dict[str, object]:
    genres = "\n".join(f"- {g['label']}: {g['rule']}" for g in ms.genres)
    grids = "\n\n".join(
        f"{i}. {g['label'].upper()} (Out of {g['max']} Marks, {g['table']}):\n"
        + "\n".join(_level_lines(lv) for lv in g["levels"])
        for i, g in enumerate(ms.grids, start=1)
    )
    top_levels = "\n".join(
        f"- {g['label']} ({_marks(g['levels'][0])} of {g['max']}): {g['levels'][0]['descriptor']}" for g in ms.grids
    )
    return dict(
        examiner_title=ms.board["examiner_title"], paper=ms.board["paper"], section=ms.board["section"],
        tariff=ms.tariff, genres=genres, grids=grids, top_levels=top_levels,
        cs_max=ms.grid("content_structure")["max"], sa_max=ms.grid("style_accuracy")["max"],
    )


@logged
def reconcile(grade: LLMGrade, ms: MarkScheme, answer: str = "") -> LLMGrade:
    """Clamp each grid score into its range, keep verbatim annotations and exactly two steps."""
    updates: dict[str, object] = {}
    for field in GRID_FIELDS:
        raw: GridScore = getattr(grade, field)
        score = max(0, min(raw.score, ms.grid(field)["max"]))
        if score != raw.score:
            log.warning("model %s score adjusted: %s -> %s", field, raw.score, score,
                        extra={"phase": "EXIT", "fn": "reconcile"})
        updates[field] = raw.model_copy(update={"score": score})
    # Annotations must quote the response exactly, or the frontend cannot highlight them.
    updates["annotations"] = [a for a in grade.annotations if a.quote.strip() and a.quote in answer][:MAX_ANNOTATIONS]
    updates["level_up_steps"] = [s for s in grade.level_up_steps if s.strip()][:LEVEL_UP_STEPS]
    return grade.model_copy(update=updates)


def _grid_result(grid: dict, scored: GridScore) -> GridResult:
    band = MarkScheme.level_for_score(grid, scored.score) or {"name": "", "student_summary": ""}
    return GridResult(
        id=grid["id"], label=grid["label"], student_summary=grid["student_summary"], score=scored.score,
        max=grid["max"], level=band["name"], level_summary=band["student_summary"],
        justification=scored.justification,
        levels=[LevelInfo(name=lv["name"], min=lv["min"], max=lv["max"], student_summary=lv["student_summary"])
                for lv in grid["levels"]],
    )


@logged
async def grade(req: SubmissionRequest, ms: MarkScheme, prompts: Prompts, llm: LLMSettings,
                api_key: str | None, client=None) -> GradeResponse:
    raw = await structured_call(
        settings=llm,
        system=prompts.render("grade_system", **_scheme_values(ms)),
        user=prompts.render("grade_user", question=req.question, answer=req.answer),
        output_type=LLMGrade, api_key=api_key, client=client,
    )
    g = reconcile(raw, ms, req.answer)
    grids = [_grid_result(ms.grid(f), getattr(g, f)) for f in GRID_FIELDS]
    return GradeResponse(
        board=req.board, word_count=word_count(req.answer), time_taken_seconds=req.time_taken_seconds,
        awarded=sum(gr.score for gr in grids), max=ms.tariff, genre=g.genre, grids=grids,
        level_drop=g.level_drop, level_up_steps=g.level_up_steps, annotations=g.annotations,
        overview=ms.scheme["student_overview"], status=ms.board.get("status", "draft"),
    )


@logged
async def model_answer(req: SubmissionRequest, ms: MarkScheme, prompts: Prompts, llm: LLMSettings,
                       api_key: str | None, client=None) -> ModelAnswerResponse:
    raw = await structured_call(
        settings=llm,
        system=prompts.render("model_answer_system", **_scheme_values(ms)),
        user=prompts.render("grade_user", question=req.question, answer=req.answer),
        output_type=LLMModelAnswer, api_key=api_key, client=client,
    )
    # Keep excerpts only when they appear verbatim in the rewrite (used for highlighting).
    changes = [c if c.excerpt and c.excerpt in raw.rewritten else c.model_copy(update={"excerpt": ""})
               for c in raw.changes]
    return ModelAnswerResponse(board=req.board, max=ms.tariff, rewritten=raw.rewritten, changes=changes)

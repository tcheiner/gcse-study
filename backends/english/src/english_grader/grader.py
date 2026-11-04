"""Grading and model-answer logic: build prompts from the mark scheme, call Claude, sanity-check the result."""
from __future__ import annotations

import logging
from pathlib import Path
from string import Template

from gcse_shared.llm import LLMSettings, structured_call
from gcse_shared.logging import LOGGER_NAME, logged

from .mark_schemes import MarkScheme
from .schemas import (
    GradeResponse, LevelInfo, LLMGrade, LLMModelAnswer, MarkSchemeExplainer,
    ModelAnswerResponse, ObjectiveInfo, SubmissionRequest,
)

log = logging.getLogger(LOGGER_NAME)


def word_count(text: str) -> int:
    return len(text.split())


class Prompts:
    def __init__(self, directory: Path) -> None:
        self._t = {p.stem: Template(p.read_text(encoding="utf-8")) for p in directory.glob("*.md")}

    def render(self, name: str, **values: object) -> str:
        return self._t[name].safe_substitute(**values)


def _scheme_values(ms: MarkScheme) -> dict[str, object]:
    objectives = "\n".join(
        f"- {ao['code']} ({ao['label']}): {ao['descriptor']}" for ao in ms.scheme["assessment_objectives"]
    )
    levels = "\n".join(
        f"- Level {lv['level']} ({lv['min']}–{lv['max']} marks): {lv['descriptor']}" for lv in ms.levels
    )
    top = max(ms.levels, key=lambda lv: lv["level"])
    return dict(
        board_name=ms.board["name"], specification=ms.board["specification"], paper=ms.board["paper"],
        tariff=ms.tariff, question_type=ms.scheme["question_type"], objectives=objectives, levels=levels,
        top_min=top["min"], top_max=top["max"], top_descriptor=top["descriptor"],
    )


@logged
def reconcile(grade: LLMGrade, ms: MarkScheme, answer: str = "") -> LLMGrade:
    """Keep the mark, level and objectives consistent with the mark scheme.

    The mark is treated as the primary judgement: it is clamped into 0..tariff and
    the level is derived from whichever band contains it.
    """
    awarded = max(0, min(grade.awarded, ms.tariff))
    band = ms.level_for_mark(awarded)
    level = band["level"] if band else grade.level
    if awarded != grade.awarded or level != grade.level:
        log.warning(
            "model mark/level adjusted: %s/L%s -> %s/L%s", grade.awarded, grade.level, awarded, level,
            extra={"phase": "EXIT", "fn": "reconcile"},
        )
    # Annotations must quote the response exactly, or the frontend cannot highlight them.
    annotations = [a for a in grade.annotations if a.quote.strip() and a.quote in answer][:8]
    known = [ao["code"] for ao in ms.scheme["assessment_objectives"]]
    objectives = sorted((o for o in grade.objectives if o.code in known), key=lambda o: known.index(o.code))
    return grade.model_copy(update={"awarded": awarded, "level": level, "objectives": objectives,
                                    "annotations": annotations})


def explainer(ms: MarkScheme) -> MarkSchemeExplainer:
    return MarkSchemeExplainer(
        overview=ms.scheme["student_overview"],
        objectives=[ObjectiveInfo(code=a["code"], label=a["label"], student_summary=a["student_summary"])
                    for a in ms.scheme["assessment_objectives"]],
        levels=[LevelInfo(level=lv["level"], min=lv["min"], max=lv["max"], student_summary=lv["student_summary"])
                for lv in ms.levels],
        status=ms.board.get("status", "draft"),
    )


@logged
async def grade(req: SubmissionRequest, ms: MarkScheme, prompts: Prompts, llm: LLMSettings,
                api_key: str | None, client=None) -> GradeResponse:
    values = _scheme_values(ms)
    raw = await structured_call(
        settings=llm,
        system=prompts.render("grade_system", **values),
        user=prompts.render("grade_user", question=req.question, answer=req.answer),
        output_type=LLMGrade, api_key=api_key, client=client,
    )
    g = reconcile(raw, ms, req.answer)
    band = ms.level(g.level) or {"student_summary": ""}
    return GradeResponse(
        board=req.board, word_count=word_count(req.answer), time_taken_seconds=req.time_taken_seconds,
        awarded=g.awarded, max=ms.tariff, level=g.level,
        level_summary=band["student_summary"], objectives=g.objectives, strengths=g.strengths,
        improvements=g.improvements, annotations=g.annotations, examiner_summary=g.examiner_summary,
        mark_scheme=explainer(ms),
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

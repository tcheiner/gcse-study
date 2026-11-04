# GCSE Study: session notes

Quick context for any developer or LLM picking this up.

## What it is
Practice tool for GCSE/IGCSE students. A student submits an exam question and their answer, and AI (Claude)
marks it against the board's mark scheme. The mark scheme is explained in plain English, and the student can ask
for their own answer rewritten to full marks. One backend per subject; one Next.js frontend with a theme per subject.

## Status
- English Paper 2, Pearson Edexcel IGCSE, 6/9/12-mark questions: backend built (`backends/english`).
- Frontend: designed (vintage typewriter theme), not yet built.
- Mark schemes are DRAFT paraphrases; verify against official Pearson mark schemes.

## Layout
```
backends/
  shared/          gcse_shared: config loader, logging (CLAUDE.md format), Claude structured-output wrapper
  english/         FastAPI app (uv project)
    config/settings.yaml               model, effort, limits, CORS, rate limit, log mode
    config/mark_schemes/<board>/       board.yaml + paper2_<tariff>.yaml (levels-based)
    src/english_grader/prompts/*.md    prompt templates ($placeholders, string.Template)
    src/english_grader/                main.py (routes), grader.py, mark_schemes.py, schemas.py
    tests/                             pytest; Claude client faked via app.state.llm_client
config/secrets.example.env   template for config/secrets.env (gitignored): ALL credentials live there
logs/                        DDMMYYYY_HH-MM-SS-MS.log, new per start, rotates at midnight (gitignored)
```

## API (english)
- `GET /health`, `GET /boards`
- `POST /grade` {board, marks, question, answer, time_taken_seconds?} -> mark, level, AO ratings, strengths,
  improvements, examiner summary, mark-scheme explainer, word count, time taken
- `POST /model-answer` -> student's answer rewritten to full marks + list of changes
- Errors: `{code, message}`; the frontend translates `code` via its locale file.

## Patterns
- Claude: `claude-opus-5-5`, effort high, `messages.parse` with Pydantic output, server-side refusal fallback.
- `reconcile()` treats the mark as primary: clamps to 0..tariff and derives the level from the band.
- Student text is wrapped in tags and treated as data (prompt-injection guard).
- `@logged` decorator: ENTER/EXIT/ERROR with duration; redacts api_key/password/token; truncates long strings.

## Decisions
- No accounts, no stored personal data (GDPR, children's code). The student's Claude key will live only in an
  encrypted, HttpOnly, short-lived session cookie (idle + absolute timeout); never stored or logged server-side.
- Supabase project exists (ref in config/secrets.env) but is unused for now.

## Run
```
cd backends/english && uv sync && uv run pytest
uv run uvicorn english_grader.main:app --reload
```

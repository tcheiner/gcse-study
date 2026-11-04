# GCSE Study: session notes

Quick context for any developer or LLM picking this up.

## What it is
Practice tool for GCSE/IGCSE students. A student submits an exam question and their answer, and AI (Claude)
marks it against the board's mark scheme. The mark scheme is explained in plain English, and the student can ask
for their own answer rewritten to full marks. One backend per subject; one Next.js frontend with a theme per subject.

## Status
- English Paper 2, Pearson Edexcel IGCSE, 6/9/12-mark questions: backend built (`backends/english`).
- Frontend: built (`frontend/`, Next.js 16, App Router, Cache Components). Vintage typewriter theme,
  walnut ink for English. Single-page flow: write -> results -> full-marks version. Nothing persisted.
- Deploy: Netlify (frontend, site `y11-gcse`, netlify.toml base=frontend) + Render (backend, render.yaml).
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
frontend/
  src/app/english/                     layout (theme + KeyProvider + Header) and page (EnglishStudio)
  src/components/                      EnglishStudio (flow), WriteView, ResultsView, ModelAnswerView,
                                       KeyContext/KeyControl (key dialog + countdown), Stopwatch, Header
  src/config/app.ts, subjects.ts       app settings; per-subject ink colours (CSS variables)
  src/lib/                             api.ts (typed client), i18n.ts, text.ts, clock.ts (useNow store)
  locales/en.json                      ALL user-facing text
  src/__tests__/ (Vitest), e2e/ (Playwright, backend mocked via page.route)
netlify.toml, render.yaml           deploy config (no secrets)
config/secrets.example.env   template for config/secrets.env (gitignored): ALL credentials live there
logs/                        DDMMYYYY_HH-MM-SS-MS.log, new per start, rotates at midnight (gitignored)
```

## API (english)
- `GET /health`, `GET /boards`
- `POST /session/key` {api_key}: checks the key with Claude (models.retrieve, free), seals it into the cookie
- `GET /session` -> {active, idle_expires_at, absolute_expires_at}; `DELETE /session/key` forgets it
- `/grade` and `/model-answer` need the session cookie; each call slides the idle window.
  They return **202 {job_id}** at once; the browser polls `GET /jobs/{id}` -> {status: pending|done|error,
  result, code, message}. Needed because Netlify's proxy times out long Claude calls (full-marks rewrite).
  Jobs (`gcse_shared/jobs.py`): in memory only, bound to the session (sha256 of key+issued_at), removed on
  first read, 10 min TTL, max 2 pending per session. Single process only (Render free); scale-out needs Redis.
- `POST /grade` {board, marks, question, answer, time_taken_seconds?} -> mark, level, AO ratings, strengths,
  improvements, examiner summary, mark-scheme explainer, word count, time taken
- `POST /model-answer` -> student's answer rewritten to full marks + list of changes
- Errors: `{code, message}`; the frontend translates `code` via its locale file. Job failures arrive as
  `status: "error"` with the same codes; frontend `runJob()` (lib/api.ts) turns them into ApiError.

## Patterns
- Claude: `claude-opus-5-5`, effort high, `messages.parse` with Pydantic output, server-side refusal fallback.
- `reconcile()` treats the mark as primary: clamps to 0..tariff and derives the level from the band.
- Student text is wrapped in tags and treated as data (prompt-injection guard).
- Key sessions (`gcse_shared/key_session.py`): AES-256-GCM with KEY_ENCRYPTION_KEY; cookie is HttpOnly,
  Secure, SameSite=strict, browser-session only; 20 min idle / 120 min absolute (settings.yaml); Origin checked.
  Codec is deliberately not @logged (its return values hold the plaintext key).
- `@logged` decorator: ENTER/EXIT/ERROR with duration; redacts api_key/password/token; truncates long strings.

## Decisions
- No accounts, no stored personal data (GDPR, children's code). The student's Claude key lives only in an
  encrypted, HttpOnly, short-lived session cookie (idle + absolute timeout); never stored or logged server-side.
  Students should use a dedicated key with a low spend limit (the real backstop on shared machines).
- Supabase project exists (ref in config/secrets.env) but is unused for now.

- Frontend calls same-origin `/api/english/*`; next.config.ts rewrites to ENGLISH_API_URL (Render URL in
  production, http://127.0.0.1:8000 locally). Keeps the HttpOnly key cookie first-party.
- Grade output includes `annotations` (verbatim quotes + strength/improve + note) for margin marking;
  model answer `changes[].excerpt` for highlighting. Non-verbatim quotes are dropped server-side.
- Never read the clock during render (Cache Components prerender error): use `useNow()` from lib/clock.

## Run
```
cd backends/english && uv sync && uv run pytest
uv run uvicorn english_grader.main:app --reload
cd frontend && npm install && npm run dev          # http://localhost:3000/english
npm run test && npm run test:e2e && npm run build
```

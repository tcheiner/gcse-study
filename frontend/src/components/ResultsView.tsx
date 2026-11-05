"use client";

import { useState } from "react";
import type { GradeResult, GridResult } from "@/lib/api";
import { t } from "@/lib/i18n";
import { formatClock, segmentByQuotes, toRoman } from "@/lib/text";
import { PrintButton } from "./PrintButton";
import { MarkedPrint } from "./PrintSheets";

interface Props {
  result: GradeResult;
  question: string;
  answer: string;
  onBack: () => void;
  onIdeal: () => void;
  idealBusy: boolean;
  error: string | null;
}

const BackIcon = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M11 6l-6 6 6 6" /></svg>
);

/** "Level 5" -> 5 (for the Roman numeral on the track). */
const levelNumber = (name: string) => Number(name.replace(/\D/g, "")) || 0;
const range = (l: { min: number; max: number }) => (l.min === l.max ? String(l.min) : `${l.min}–${l.max}`);

/** One marking grid: score, the examiner's justification, and a level track to explore. */
function GridCard({ grid }: { grid: GridResult }) {
  const [selected, setSelected] = useState(grid.level);
  const levels = [...grid.levels].sort((a, b) => a.min - b.min); // low to high, left to right
  const current = levels.find((l) => l.name === grid.level);
  const sel = levels.find((l) => l.name === selected) ?? current ?? levels[0];
  const headingId = `grid-${grid.id}`;

  return (
    <section aria-labelledby={headingId} className="sheet grid-card" style={{ flex: "1 1 420px", minWidth: 0, padding: "26px 28px", display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 1px 0 var(--shadow-line)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <h3 id={headingId} style={{ margin: 0, fontSize: 16, letterSpacing: ".08em", textTransform: "uppercase" }}>{grid.label}</h3>
        <span className="grid-score">{grid.score}<small> / {grid.max}</small></span>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 15 }}>{grid.student_summary}</p>
      <p style={{ margin: 0 }}><strong>{grid.level}.</strong> {grid.justification}</p>
      <div className="track compact" role="group" aria-label={t("results.levelsOf", { grid: grid.label })}>
        {levels.map((l) => (
          <button key={l.name} type="button" aria-pressed={sel.name === l.name} aria-label={t("results.levelMarks", { level: l.name, range: range(l) })}
                  onClick={() => setSelected(l.name)}>
            <span className={`node${l.name === grid.level ? " current" : current && l.min < current.min ? " reached" : ""}`}>{toRoman(levelNumber(l.name))}</span>
            <span className="muted" style={{ fontSize: 12 }}>{range(l)}</span>
          </button>
        ))}
      </div>
      <div style={{ background: "var(--paper-2)", border: "1px dashed var(--rule-strong)", borderRadius: 3, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 4 }} aria-live="polite">
        <strong className="fell" style={{ fontWeight: 400, fontSize: 20 }}>
          {t("results.levelMarks", { level: sel.name, range: range(sel) })}{sel.name === grid.level ? ` · ${t("results.you")}` : ""}
        </strong>
        <span>{sel.student_summary}</span>
      </div>
    </section>
  );
}

export function ResultsView({ result, question, answer, onBack, onIdeal, idealBusy, error }: Props) {
  const [done, setDone] = useState<boolean[]>(() => result.level_up_steps.map(() => false));
  const segments = segmentByQuotes(answer, result.annotations);
  const paragraphs = splitParagraphs(segments);
  const drop = result.level_drop;

  return (
    <main id="main" className="shell page" style={{ gap: 40 }}>
      <MarkedPrint result={result} question={question} answer={answer} />
      <div className="screen-only" style={{ display: "contents" }}>
      <div className="between" style={{ alignItems: "center" }}>
        <button type="button" className="linkish" onClick={onBack}><BackIcon />{t("results.back")}</button>
        <PrintButton labelKey="print.marked" />
      </div>

      <section aria-labelledby="mark-h" className="sheet" style={{ padding: "clamp(28px, 5vw, 48px)", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 48 }}>
        <div className="stamp">
          <span className="label" style={{ letterSpacing: ".32em" }}>{t("results.stamp")}</span>
          <h1 id="mark-h" className="stamp-score">{result.awarded}<small> / {result.max}</small></h1>
          <span className="label" style={{ fontSize: 15, letterSpacing: ".28em", borderTop: "1.5px solid var(--pen)", paddingTop: 4 }}>
            {t(`results.genre.${result.genre}`)}
          </span>
        </div>
        <div style={{ flex: "1 1 420px", display: "flex", flexDirection: "column", gap: 16 }}>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {result.grids.map((g) => (
              <li key={g.id} className="fell" style={{ fontStyle: "italic", fontSize: "clamp(22px, 2.6vw, 30px)", lineHeight: 1.25 }}>
                {t("results.gridLine", { label: g.label, score: g.score, max: g.max, level: g.level })}
              </li>
            ))}
          </ul>
          <p style={{ margin: 0, fontSize: 17, color: "var(--text-2)" }}>{result.overview}</p>
          <p className="label muted" style={{ margin: 0, fontWeight: 400, letterSpacing: ".16em", borderTop: "1px dashed var(--rule-strong)", paddingTop: 14 }}>
            {t("results.stats", {
              time: result.time_taken_seconds ? formatClock(result.time_taken_seconds) : t("results.noTime"),
              words: result.word_count, marks: result.max,
            })}
          </p>
        </div>
      </section>

      <section aria-labelledby="drop-h" className={drop.triggered ? "alert" : "sheet"}
               style={drop.triggered ? { display: "flex", flexDirection: "column", gap: 6 } : { padding: "18px 24px", display: "flex", flexDirection: "column", gap: 6, boxShadow: "0 1px 0 var(--shadow-line)" }}>
        <h2 id="drop-h" className="label" style={{ margin: 0 }}>{t(drop.triggered ? "results.dropYes" : "results.dropNo")}</h2>
        <p style={{ margin: 0 }}>{drop.explanation}</p>
      </section>

      <section aria-labelledby="grids-h" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <h2 id="grids-h" className="h2">{t("results.trackTitle")}</h2>
        <p style={{ margin: 0, maxWidth: 760, color: "var(--text-2)" }}>{t("results.trackIntro")}</p>
        <div className="row">
          {result.grids.map((g) => <GridCard key={g.id} grid={g} />)}
        </div>
        {result.status === "draft" && <p className="muted" style={{ margin: 0, fontSize: 14 }}>{t("results.draftScheme")}</p>}
      </section>

      <section aria-labelledby="marked-h" className="marked-essay" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="between" style={{ alignItems: "baseline" }}>
          <h2 id="marked-h" className="h2">{t("results.markedTitle")}</h2>
          <div style={{ display: "flex", gap: 18, fontSize: 14 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span aria-hidden="true" style={{ width: 26, height: 3, background: "var(--ink)" }} />{t("results.legendStrength")}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span aria-hidden="true" style={{ width: 26, height: 12, background: "var(--pen-soft)", borderBottom: "2px solid var(--pen)" }} />{t("results.legendImprove")}</span>
          </div>
        </div>
        <div className="sheet" style={{ display: "flex", flexWrap: "wrap" }}>
          <div className="ruled" style={{ flex: "999 1 520px", minWidth: 0, padding: "36px 40px", fontSize: 18, lineHeight: 2, display: "flex", flexDirection: "column", gap: 18 }}>
            {paragraphs.map((para, i) => (
              <p key={i} style={{ margin: 0 }}>
                {para.map((s, j) => s.mark
                  ? <span key={j} className={`hl hl-${s.mark.kind === "strength" ? "strength" : "improve"}`}>{s.text}<sup>{s.mark.index + 1}</sup></span>
                  : <span key={j}>{s.text}</span>)}
              </p>
            ))}
          </div>
          {result.annotations.length > 0 && (
            <aside aria-label={t("results.notes")} className="fell" style={{ flex: "1 1 280px", minWidth: 0, borderLeft: "1px dashed var(--rule-strong)", padding: "32px 28px", display: "flex", flexDirection: "column", gap: 18, fontStyle: "italic", fontSize: 19, lineHeight: 1.45 }}>
              {result.annotations.map((a, i) => (
                <p key={i} style={{ margin: 0, color: a.kind === "strength" ? "var(--ink)" : "var(--pen-deep)" }}>
                  <strong className="note-num" style={{ fontStyle: "normal", fontFamily: "var(--font-type)", fontSize: 14 }}>{i + 1}</strong>{"  "}{a.note}
                </p>
              ))}
            </aside>
          )}
        </div>
      </section>

      <section aria-labelledby="try-h" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h2 id="try-h" className="h2">{t("results.tryTitle")}</h2>
        <ol className="sheet" style={{ listStyle: "none", margin: 0, padding: "22px 26px", display: "flex", flexDirection: "column", gap: 4, boxShadow: "0 1px 0 var(--shadow-line)" }}>
          {result.level_up_steps.map((text, i) => (
            <li key={i}>
              <label style={{ display: "flex", gap: 14, alignItems: "flex-start", minHeight: 44, padding: "8px 0", cursor: "pointer" }}>
                <input type="checkbox" checked={done[i]} onChange={() => setDone((d) => d.map((v, k) => (k === i ? !v : v)))}
                       style={{ marginTop: 5, width: 20, height: 20, accentColor: "var(--ink)" }} />
                <span style={done[i] ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}>
                  <strong className="fell" style={{ fontWeight: 400, marginRight: 8 }}>{toRoman(i + 1)}.</strong>{text}
                </span>
              </label>
            </li>
          ))}
        </ol>
      </section>

      {error && <p role="alert" className="alert" style={{ margin: 0 }}>{error}</p>}

      <section aria-labelledby="ideal-h" className="cta-band">
        <svg aria-hidden="true" width="96" height="96" viewBox="0 0 100 100" style={{ flex: "0 0 auto" }}>
          <path d="M50 4 C62 8 70 2 80 12 C88 20 86 30 94 40 C98 52 92 60 94 70 C90 82 80 84 72 92 C62 98 54 92 44 96 C32 96 26 88 16 82 C8 74 10 64 5 54 C2 42 10 34 10 24 C16 12 28 12 38 6 C42 4 46 4 50 4Z" fill="var(--pen)" />
          <circle cx="50" cy="50" r="30" fill="none" stroke="#C9715A" strokeWidth="2" />
          <text x="50" y="58" textAnchor="middle" fontFamily="var(--font-fell)" fontSize="26" fill="var(--paper)">{toRoman(result.max)}</text>
        </svg>
        <div style={{ flex: "1 1 420px", display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 id="ideal-h" className="h2" style={{ color: "#fff" }}>{t("results.idealTitle")}</h2>
          <p style={{ margin: 0, color: "#F1E4D2" }}>{t("results.idealBody", { max: result.max })}</p>
        </div>
        <button type="button" className="btn btn-light" onClick={onIdeal} disabled={idealBusy}>
          {idealBusy ? t("results.idealLoading") : t("results.idealCta")}
        </button>
      </section>

      <p className="muted" style={{ margin: 0, fontSize: 14 }}>{t("results.disclaimer")}</p>
      </div>
    </main>
  );
}

/** Group segments into paragraphs on blank lines, splitting segments that contain breaks. */
export function splitParagraphs<T extends { text: string }>(segments: T[]): T[][] {
  const out: T[][] = [[]];
  for (const s of segments) {
    const parts = s.text.split(/\n\s*\n/);
    parts.forEach((part, i) => {
      if (i > 0) out.push([]);
      if (part) out[out.length - 1].push({ ...s, text: part });
    });
  }
  return out.filter((p) => p.length > 0);
}

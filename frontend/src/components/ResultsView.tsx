"use client";

import { useState } from "react";
import type { GradeResult } from "@/lib/api";
import { t } from "@/lib/i18n";
import { formatClock, segmentByQuotes, toRoman } from "@/lib/text";

interface Props {
  result: GradeResult;
  answer: string;
  onBack: () => void;
  onIdeal: () => void;
  idealBusy: boolean;
  error: string | null;
}

const BackIcon = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M11 6l-6 6 6 6" /></svg>
);

function RatingDots({ rating }: { rating: GradeResult["objectives"][number]["rating"] }) {
  const filled = rating === "strong" ? 3 : rating === "developing" ? 2 : 1;
  const color = rating === "strong" ? "var(--ink)" : "var(--pen-deep)";
  return (
    <span className="dots" style={{ color }}>
      {[0, 1, 2].map((i) => <span key={i} aria-hidden="true" className={`dot${i < filled ? "" : " empty"}`} />)}
      {t(`results.rating.${rating}`)}
    </span>
  );
}

export function ResultsView({ result, answer, onBack, onIdeal, idealBusy, error }: Props) {
  const [selected, setSelected] = useState(result.level);
  const [done, setDone] = useState<boolean[]>(() => result.improvements.map(() => false));
  const levels = result.mark_scheme.levels;
  const sel = levels.find((l) => l.level === selected) ?? levels[0];
  const range = (l: typeof sel) => (l.min === l.max ? String(l.min) : `${l.min}–${l.max}`);
  const segments = segmentByQuotes(answer, result.annotations);
  const paragraphs = splitParagraphs(segments);
  const aoLabel = (code: string) => result.mark_scheme.objectives.find((o) => o.code === code);

  return (
    <main id="main" className="shell page" style={{ gap: 40 }}>
      <button type="button" className="linkish" onClick={onBack} style={{ alignSelf: "flex-start" }}><BackIcon />{t("results.back")}</button>

      <section aria-labelledby="mark-h" className="sheet" style={{ padding: "clamp(28px, 5vw, 48px)", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 48 }}>
        <div className="stamp">
          <span className="label" style={{ letterSpacing: ".32em" }}>{t("results.stamp")}</span>
          <h1 id="mark-h" className="stamp-score">{result.awarded}<small> / {result.max}</small></h1>
          <span className="label" style={{ fontSize: 15, letterSpacing: ".28em", borderTop: "1.5px solid var(--pen)", paddingTop: 4 }}>
            {t("results.level", { roman: toRoman(result.level) })}
          </span>
        </div>
        <div style={{ flex: "1 1 420px", display: "flex", flexDirection: "column", gap: 16 }}>
          <p className="fell" style={{ margin: 0, fontStyle: "italic", fontSize: "clamp(24px, 3vw, 34px)", lineHeight: 1.25 }}>“{result.level_summary}”</p>
          <p style={{ margin: 0, fontSize: 17, color: "var(--text-2)" }}>{result.examiner_summary}</p>
          <p className="label muted" style={{ margin: 0, fontWeight: 400, letterSpacing: ".16em", borderTop: "1px dashed var(--rule-strong)", paddingTop: 14 }}>
            {t("results.stats", {
              time: result.time_taken_seconds ? formatClock(result.time_taken_seconds) : t("results.noTime"),
              words: result.word_count, marks: result.max,
            })}
          </p>
        </div>
      </section>

      <section aria-labelledby="track-h" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <h2 id="track-h" className="h2">{t("results.trackTitle")}</h2>
        <p style={{ margin: 0, maxWidth: 760, color: "var(--text-2)" }}>{t("results.trackIntro")}</p>
        <div className="track">
          {levels.map((l) => (
            <button key={l.level} type="button" aria-pressed={selected === l.level} onClick={() => setSelected(l.level)}>
              <span className={`node${l.level === result.level ? " current" : l.level < result.level ? " reached" : ""}`}>{toRoman(l.level)}</span>
              <span className="muted" style={{ fontSize: 13, letterSpacing: ".1em" }}>{range(l)}</span>
              {l.level === result.level && <span className="label" style={{ fontSize: 12, color: "var(--pen)" }}>{t("results.you")}</span>}
            </button>
          ))}
        </div>
        <div style={{ background: "var(--paper-2)", border: "1px dashed var(--rule-strong)", borderRadius: 3, padding: "18px 22px", display: "flex", flexWrap: "wrap", gap: "6px 18px", alignItems: "baseline" }} aria-live="polite">
          <strong className="fell" style={{ fontWeight: 400, fontSize: 22 }}>{t("results.levelMarks", { roman: toRoman(sel.level), range: range(sel) })}</strong>
          <span style={{ flex: "1 1 360px" }}>{sel.student_summary}</span>
        </div>
        {result.mark_scheme.status === "draft" && <p className="muted" style={{ margin: 0, fontSize: 14 }}>{t("results.draftScheme")}</p>}
      </section>

      <section aria-labelledby="marked-h" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
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

      <div className="row">
        <section aria-labelledby="ao-h" style={{ flex: "1 1 420px", display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 id="ao-h" className="h2">{t("results.skillsTitle")}</h2>
          {result.objectives.map((o) => (
            <div key={o.code} className="sheet" style={{ padding: "22px 26px", display: "flex", flexDirection: "column", gap: 8, boxShadow: "0 1px 0 var(--shadow-line)" }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <strong style={{ letterSpacing: ".06em", textTransform: "uppercase" }}>{o.code} · {aoLabel(o.code)?.label}</strong>
                <RatingDots rating={o.rating} />
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 15 }}>{aoLabel(o.code)?.student_summary}</p>
              <p style={{ margin: 0 }}>{o.comment}</p>
            </div>
          ))}
          {result.strengths.length > 0 && (
            <div className="sheet" style={{ padding: "22px 26px", boxShadow: "0 1px 0 var(--shadow-line)" }}>
              <h3 className="label" style={{ margin: "0 0 8px" }}>{t("results.wellTitle")}</h3>
              <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
                {result.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
        </section>

        <section aria-labelledby="try-h" style={{ flex: "1 1 420px", display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 id="try-h" className="h2">{t("results.tryTitle")}</h2>
          <ul className="sheet" style={{ listStyle: "none", margin: 0, padding: "22px 26px", display: "flex", flexDirection: "column", gap: 4, boxShadow: "0 1px 0 var(--shadow-line)" }}>
            {result.improvements.map((text, i) => (
              <li key={i}>
                <label style={{ display: "flex", gap: 14, alignItems: "flex-start", minHeight: 44, padding: "8px 0", cursor: "pointer" }}>
                  <input type="checkbox" checked={done[i]} onChange={() => setDone((d) => d.map((v, k) => (k === i ? !v : v)))}
                         style={{ marginTop: 5, width: 20, height: 20, accentColor: "var(--ink)" }} />
                  <span style={done[i] ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}>{text}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      </div>

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

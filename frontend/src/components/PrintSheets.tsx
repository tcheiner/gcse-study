"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { Annotation, GradeResult, ModelAnswer } from "@/lib/api";
import { t } from "@/lib/i18n";
import { formatClock, segmentByQuotes, toRoman } from "@/lib/text";

// A4 (210 x 297 mm) minus the @page margins in globals.css, with a little safety room.
const MM = 96 / 25.4;
const PAGE_HEIGHT_MM = 297 - 14 - 14 - 3;
/** Below this the text gets too small to read; longer pieces carry on to a second page instead. */
const MIN_SCALE = 0.5;

/**
 * A print-only A4 sheet. Just before printing it measures itself at its fixed print width and,
 * if taller than one page, zooms down (uniformly, so line breaks don't change) to fit.
 */
function PrintPage({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.zoom = "";
      el.classList.add("ps-measure");
      const height = el.scrollHeight;
      el.classList.remove("ps-measure");
      const scale = Math.max(MIN_SCALE, Math.min(1, (PAGE_HEIGHT_MM * MM) / height));
      el.style.zoom = scale < 1 ? scale.toFixed(3) : "";
    };
    const reset = () => { el.style.zoom = ""; };
    window.addEventListener("beforeprint", fit);
    window.addEventListener("afterprint", reset);
    return () => { window.removeEventListener("beforeprint", fit); window.removeEventListener("afterprint", reset); };
  }, []);
  return <div ref={ref} className={`print-only ps ${className}`}>{children}</div>;
}

const paragraphs = (text: string) => text.split(/\n\s*\n/).filter((p) => p.trim());

/** Essay text with numbered, pen-style underlines for each quoted passage. */
function MarkedText({ text, marks }: { text: string; marks: { quote: string; kind: string }[] }) {
  const segs = segmentByQuotes(text, marks);
  const paras: (typeof segs)[] = [[]];
  for (const s of segs) {
    s.text.split(/\n\s*\n/).forEach((part, i) => {
      if (i > 0) paras.push([]);
      if (part) paras[paras.length - 1].push({ ...s, text: part });
    });
  }
  return (
    <div className="ps-text">
      {paras.filter((p) => p.length).map((para, i) => (
        <p key={i}>
          {para.map((s, j) => s.mark
            ? <span key={j} className={`ps-hl ps-hl-${s.mark.kind}`}>{s.text}<sup>{s.mark.index + 1}</sup></span>
            : <span key={j}>{s.text}</span>)}
        </p>
      ))}
    </div>
  );
}

function Head({ kicker, question, meta, children }: { kicker: string; question: string; meta: string; children?: ReactNode }) {
  return (
    <header className="ps-head">
      <div className="ps-head-text">
        <p className="ps-kicker">{kicker}</p>
        <h1 className="ps-q">{question}</h1>
        <p className="ps-meta">{meta}</p>
      </div>
      {children}
    </header>
  );
}

export function DraftPrint({ question, answer, words, marks }: { question: string; answer: string; words: number; marks: number }) {
  return (
    <PrintPage className="ps-draft">
      <Head kicker={t("print.draftKicker")} question={question} meta={t("print.draftMeta", { words, marks })} />
      <div className="ps-text">{paragraphs(answer).map((p, i) => <p key={i}>{p}</p>)}</div>
    </PrintPage>
  );
}

export function MarkedPrint({ result, question, answer }: { result: GradeResult; question: string; answer: string }) {
  const genre = t(`results.genre.${result.genre}`);
  const time = result.time_taken_seconds ? formatClock(result.time_taken_seconds) : t("results.noTime");
  const drop = result.level_drop;
  return (
    <PrintPage className="ps-marked">
      <Head kicker={t("print.markedKicker")} question={question} meta={t("print.markedMeta", { genre, words: result.word_count, time })}>
        <div className="ps-stamp">
          <span className="ps-stamp-label">{t("results.stamp")}</span>
          <span className="ps-stamp-score">{result.awarded}<small>/{result.max}</small></span>
          <span className="ps-stamp-label">{genre}</span>
        </div>
      </Head>

      <div className="ps-cols ps-grids">
        {result.grids.map((g) => (
          <section key={g.id} className="ps-box">
            <h2 className="ps-h"><span>{g.label}</span><b>{g.score}<small>/{g.max}</small></b></h2>
            <p className="ps-level">{g.level} · {g.level_summary}</p>
            <p>{g.justification}</p>
          </section>
        ))}
      </div>

      <p className={`ps-drop${drop.triggered ? " on" : ""}`}>
        <strong>{t(drop.triggered ? "results.dropYes" : "results.dropNo")}.</strong> {drop.explanation}
      </p>

      <div className="ps-cols ps-essay">
        <MarkedText text={answer} marks={result.annotations} />
        <aside className="ps-notes">
          <h2 className="ps-h">{t("print.notesTitle")}</h2>
          <ol className="ps-notelist">
            {result.annotations.map((a: Annotation, i) => (
              <li key={i} className={`ps-note-${a.kind}`}><b>{i + 1}</b>{a.note}</li>
            ))}
          </ol>
          <p className="ps-legend"><span className="ps-hl ps-hl-strength">{t("results.legendStrength")}</span> <span className="ps-hl ps-hl-improve">{t("results.legendImprove")}</span></p>
        </aside>
      </div>

      <section className="ps-steps">
        <h2 className="ps-h">{t("results.tryTitle")}</h2>
        <ol>{result.level_up_steps.map((s, i) => <li key={i}><span className="ps-box-tick" aria-hidden="true" /><b>{toRoman(i + 1)}.</b> {s}</li>)}</ol>
      </section>
      <p className="ps-foot">{t("results.disclaimer")}</p>
    </PrintPage>
  );
}

export function IdealPrint({ ideal, original, grade, question, view }: {
  ideal: ModelAnswer; original: string; grade: GradeResult; question: string; view: "ideal" | "both" | "mine";
}) {
  const changes = ideal.changes.map((c) => ({ quote: c.excerpt, kind: "change" }));
  const changeList = (
    <ol className="ps-changes">
      {ideal.changes.map((c, i) => <li key={i}><b>{i + 1}</b><div><strong>{c.what}</strong><span>{c.why}</span></div></li>)}
    </ol>
  );
  const originalCol = (
    <div><p className="ps-col-label">{t("ideal.originalLabel", { awarded: grade.awarded, max: grade.max })}</p>
      <div className="ps-text">{paragraphs(original).map((p, i) => <p key={i}>{p}</p>)}</div></div>
  );
  const idealCol = (
    <div><p className="ps-col-label">{t("ideal.idealLabel", { max: ideal.max })}</p><MarkedText text={ideal.rewritten} marks={changes} /></div>
  );
  return (
    <PrintPage className="ps-ideal">
      <Head kicker={t("print.idealKicker")} question={question}
            meta={t("print.idealMeta", { awarded: grade.awarded, max: grade.max })} />
      {view === "both" ? (
        <>
          <div className="ps-cols ps-pair">{originalCol}{idealCol}</div>
          <section><h2 className="ps-h">{t("ideal.changesTitle")}</h2>{changeList}</section>
        </>
      ) : view === "mine" ? (
        originalCol
      ) : (
        <div className="ps-cols ps-essay">
          {idealCol}
          <aside className="ps-notes"><h2 className="ps-h">{t("ideal.changesTitle")}</h2>{changeList}</aside>
        </div>
      )}
    </PrintPage>
  );
}

"use client";

import { useState } from "react";
import { appConfig } from "@/config/app";
import type { BoardInfo } from "@/lib/api";
import { t } from "@/lib/i18n";
import { wordCount } from "@/lib/text";
import { PrintButton } from "./PrintButton";
import { DraftPrint } from "./PrintSheets";
import { Stopwatch } from "./Stopwatch";

export interface Draft { board: string; marks: number; target: number; question: string; answer: string }

interface Props {
  boards: BoardInfo[];
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  seconds: number;
  running: boolean;
  onToggleTimer: () => void;
  onResetTimer: () => void;
  onSubmit: () => void;
  busy: boolean;
  error: string | null;
}

export function WriteView(p: Props) {
  const { draft } = p;
  const board = p.boards.find((b) => b.id === draft.board);
  const tariffs = board?.tariffs ?? [draft.marks];
  const words = wordCount(draft.answer);
  const digits = String(Math.min(words, 9999)).padStart(4, "0").split("");
  const [nextSample, setNextSample] = useState(0);

  function fillSample() {
    if ((draft.question.trim() || draft.answer.trim()) && !window.confirm(t("write.sampleConfirm"))) return;
    const id = appConfig.sampleIds[nextSample % appConfig.sampleIds.length];
    p.onChange({ question: t(`samples.${id}.question`), answer: t(`samples.${id}.answer`) });
    setNextSample((n) => n + 1);
  }

  return (
    <main id="main" className="shell page">
      <DraftPrint question={draft.question} answer={draft.answer} words={words} marks={draft.marks} />
      <div className="between screen-only">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="kicker">{t("write.kicker")}</span>
          <h1 className="display">{t("write.titleA")}<br /><em>{t("write.titleB")}</em></h1>
        </div>
        <ol className="steps" aria-label={t("steps.label")}>
          <li className="on" aria-current="step">{t("steps.write")}</li><li className="dash" aria-hidden="true">——</li>
          <li>{t("steps.mark")}</li><li className="dash" aria-hidden="true">——</li><li>{t("steps.improve")}</li>
        </ol>
      </div>

      <form className="row screen-only" onSubmit={(e) => { e.preventDefault(); p.onSubmit(); }} id="submission">
        <section aria-labelledby="card-h" className="index-card" style={{ flex: "1 1 340px", minWidth: 0 }}>
          <div className="between" style={{ alignItems: "baseline" }}>
            <h2 id="card-h" className="h2i" style={{ height: 34 }}>{t("write.cardTitle")}</h2>
            <button type="button" className="linkish" onClick={fillSample}>{t("write.sample")}</button>
          </div>

          <div className="field">
            <label htmlFor="board" className="label">{t("write.board")}</label>
            <select id="board" className="underline-input" style={{ fontSize: 15 }} value={draft.board}
                    onChange={(e) => p.onChange({ board: e.target.value })}>
              {p.boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          <div className="field">
            <span id="marks-label" className="label">{t("write.marks")}</span>
            {tariffs.length === 1 ? (
              <p className="fell" style={{ margin: 0, fontSize: 20 }}>{t("write.fixedMarks", { marks: tariffs[0] })}</p>
            ) : (
              <div role="radiogroup" aria-labelledby="marks-label" style={{ display: "flex", gap: 14 }}>
                {tariffs.map((m) => (
                  <button key={m} type="button" role="radio" className="key" aria-checked={draft.marks === m}
                          aria-label={t("write.marksAria", { marks: m })} onClick={() => p.onChange({ marks: m })}>{m}</button>
                ))}
              </div>
            )}
          </div>

          <div className="field">
            <span id="target-label" className="label">{t("write.target")} <span className="muted" style={{ fontWeight: 400, letterSpacing: ".05em", textTransform: "none" }}>{t("write.optional")}</span></span>
            <div role="radiogroup" aria-labelledby="target-label" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {appConfig.timerTargets.map((m) => (
                <button key={m} type="button" role="radio" className="chip" aria-checked={draft.target === m}
                        onClick={() => p.onChange({ target: m })}>{m === 0 ? t("write.noLimit") : t("write.minutes", { n: m })}</button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="question" className="label">{t("write.question")}</label>
            <textarea id="question" rows={5} className="lined-textarea" placeholder={t("write.questionPlaceholder")}
                      value={draft.question} onChange={(e) => p.onChange({ question: e.target.value })} />
          </div>
        </section>

        <section aria-labelledby="sheet-h" className="sheet-stack" style={{ flex: "999 1 560px", minWidth: 0 }}>
          <div className="sheet">
            <div className="sheet-bar">
              <h2 id="sheet-h" className="h2i">{t("write.answerTitle")}</h2>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 22 }}>
                <Stopwatch seconds={p.seconds} running={p.running} targetMinutes={draft.target} onToggle={p.onToggleTimer} onReset={p.onResetTimer} />
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="odometer" aria-hidden="true">{digits.map((d, i) => <span key={i}>{d}</span>)}</div>
                  <span className="label muted" style={{ fontSize: 12 }}>{t("write.words")}</span>
                  <span className="sr-only" aria-live="polite">{t("write.wordsAria", { n: words })}</span>
                </div>
              </div>
            </div>
            <label htmlFor="answer" className="sr-only">{t("write.answerLabel")}</label>
            <textarea id="answer" rows={18} className="essay" placeholder={t("write.answerPlaceholder")}
                      value={draft.answer} onChange={(e) => p.onChange({ answer: e.target.value })} />
          </div>
        </section>
      </form>

      {p.error && <p role="alert" className="alert screen-only" style={{ margin: 0 }}>{p.error}</p>}

      <div className="between screen-only" style={{ alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <p className="fell muted" style={{ margin: 0, fontStyle: "italic", fontSize: 19 }}>
            {t("write.footnote", { board: board?.name ?? "", marks: draft.marks })}
          </p>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>{t("write.keptLocal")}</p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 24 }}>
          <PrintButton labelKey="print.draft" />
        <button type="submit" form="submission" className="btn" disabled={p.busy}>
          {p.busy ? t("write.submitting") : t("write.submit")}
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
        </button>
        </div>
      </div>
    </main>
  );
}


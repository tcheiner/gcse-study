"use client";

import { useState } from "react";
import type { GradeResult, ModelAnswer } from "@/lib/api";
import { t } from "@/lib/i18n";
import { segmentByQuotes } from "@/lib/text";
import { PrintButton } from "./PrintButton";
import { splitParagraphs } from "./ResultsView";

type View = "ideal" | "both" | "mine";

interface Props { ideal: ModelAnswer; original: string; grade: GradeResult; onBack: () => void }

export function ModelAnswerView({ ideal, original, grade, onBack }: Props) {
  const [view, setView] = useState<View>("ideal");
  const [copied, setCopied] = useState(false);
  const segs = splitParagraphs(segmentByQuotes(ideal.rewritten, ideal.changes.map((c) => ({ quote: c.excerpt, kind: "change" }))));
  const mine = original.split(/\n\s*\n/).filter(Boolean);
  const views: [View, string][] = [["ideal", t("ideal.viewIdeal")], ["both", t("ideal.viewBoth")], ["mine", t("ideal.viewMine")]];

  async function copy() {
    try { await navigator.clipboard.writeText(ideal.rewritten); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  }

  return (
    <main id="main" className="shell page" style={{ gap: 32 }}>
      <button type="button" className="linkish no-print" onClick={onBack} style={{ alignSelf: "flex-start" }}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M11 6l-6 6 6 6" /></svg>
        {t("ideal.back")}
      </button>

      <div className="between">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="kicker">{t("ideal.kicker")}</span>
          <h1 className="display">{t("ideal.titleA")} <em>{t("ideal.titleB")}</em></h1>
          <p style={{ margin: 0, maxWidth: 640, color: "var(--text-2)" }}>{t("ideal.intro")}</p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <div role="radiogroup" aria-label={t("ideal.views")} className="segmented no-print">
            {views.map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={view === id} onClick={() => setView(id)}>{label}</button>
            ))}
          </div>
          <button type="button" className="btn btn-small no-print" onClick={copy} aria-live="polite">{copied ? t("ideal.copied") : t("ideal.copy")}</button>
          <PrintButton labelKey="print.ideal" className="btn btn-small" />
        </div>
      </div>

      <div className="row" style={{ gap: 28 }}>
        {view !== "ideal" && (
          <article aria-label={t("ideal.viewMine")} style={{ flex: "999 1 420px", minWidth: 0, background: "var(--paper-2)", borderRadius: 3, boxShadow: "0 1px 0 var(--shadow-line)", padding: "36px 40px", fontSize: 17, lineHeight: 2, color: "var(--text-2)", display: "flex", flexDirection: "column", gap: 16 }}>
            <span className="label muted" style={{ fontSize: 12, letterSpacing: ".24em" }}>{t("ideal.originalLabel", { awarded: grade.awarded, max: grade.max })}</span>
            {mine.map((p, i) => <p key={i} style={{ margin: 0, whiteSpace: "pre-wrap" }}>{p}</p>)}
          </article>
        )}
        {view !== "mine" && (
          <article aria-label={t("ideal.viewIdeal")} className="sheet" style={{ flex: "999 1 520px", minWidth: 0, padding: "40px 44px 44px clamp(44px, 7vw, 84px)", fontSize: 18, lineHeight: 2, backgroundImage: "linear-gradient(to right, transparent 62px, var(--margin) 62px, var(--margin) 63px, transparent 63px)", display: "flex", flexDirection: "column", gap: 18 }}>
            <span className="label" style={{ fontSize: 12, letterSpacing: ".24em", color: "var(--ink)" }}>{t("ideal.idealLabel", { max: ideal.max })}</span>
            {segs.map((para, i) => (
              <p key={i} style={{ margin: 0 }}>
                {para.map((s, j) => s.mark
                  ? <span key={j} className="hl hl-change">{s.text}<sup style={{ color: "var(--ink)" }}> {s.mark.index + 1}</sup></span>
                  : <span key={j}>{s.text}</span>)}
              </p>
            ))}
          </article>
        )}
        <aside aria-labelledby="changes-h" style={{ flex: "1 1 300px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          <h2 id="changes-h" className="h2">{t("ideal.changesTitle")}</h2>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            {ideal.changes.map((c, i) => (
              <li key={i} style={{ display: "flex", gap: 14, paddingBottom: 14, borderBottom: "1px dashed var(--rule-strong)" }}>
                <span aria-hidden="true" className="fell" style={{ flex: "0 0 34px", height: 34, borderRadius: "50%", border: "2px solid var(--ink)", color: "var(--ink)", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <strong style={{ fontSize: 15 }}>{c.what}</strong>
                  <span className="fell" style={{ fontStyle: "italic", fontSize: 18, lineHeight: 1.4, color: "var(--text-2)" }}>{c.why}</span>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </main>
  );
}

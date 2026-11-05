"use client";

import { useEffect, useRef, useState } from "react";
import { appConfig } from "@/config/app";
import { api, ApiError, KEY_ERRORS, type BoardInfo, type GradeResult, type ModelAnswer, type Submission } from "@/lib/api";
import { t } from "@/lib/i18n";
import { useKey } from "./KeyContext";
import { ModelAnswerView } from "./ModelAnswerView";
import { ResultsView } from "./ResultsView";
import { WriteView, type Draft } from "./WriteView";

const FALLBACK_BOARDS: BoardInfo[] = [
  { id: "cambridge-0990", name: "Cambridge IGCSE First Language English", specification: "", paper: 2, tariffs: [40], status: "official" },
];

type View = "write" | "results" | "ideal";

/** Single-page flow. Everything lives in memory only: nothing is saved to the browser or server. */
export function EnglishStudio({ boardId }: { boardId: string }) {
  const key = useKey();
  const [boards, setBoards] = useState<BoardInfo[]>(FALLBACK_BOARDS);
  const [draft, setDraft] = useState<Draft>({
    board: boardId, marks: appConfig.defaultTariff, target: appConfig.defaultTimerTarget, question: "", answer: "",
  });
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [view, setView] = useState<View>("write");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grade, setGrade] = useState<GradeResult | null>(null);
  const [ideal, setIdeal] = useState<ModelAnswer | null>(null);
  const submitted = useRef<Submission | null>(null);

  useEffect(() => {
    api.boards().then((b) => {
      if (!b.length) return;
      // The page's URL picks the board; fall back to the first one the backend offers.
      const chosen = b.find((x) => x.id === boardId) ?? b[0];
      setBoards(b);
      setDraft((d) => ({ ...d, board: chosen.id, marks: chosen.tariffs.at(-1) ?? d.marks }));
    }).catch(() => {});
  }, [boardId]);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [view]);

  function explain(err: unknown): string {
    return t(`errors.${err instanceof ApiError ? err.code : "generic"}`);
  }

  // `keyJustAdded` is set when resuming after the key dialog: this closure's key.status is from
  // the previous render and would still read "inactive".
  async function withKey(action: () => Promise<void>, keyJustAdded = false) {
    if (!keyJustAdded && !key.status.active) { key.openDialog(() => void withKey(action, true)); return; }
    setBusy(true); setError(null);
    try {
      await action();
    } catch (err) {
      if (err instanceof ApiError && KEY_ERRORS.has(err.code)) {
        await key.refresh();
        setError(explain(err));
        key.openDialog(() => void withKey(action, true));
      } else {
        setError(explain(err));
      }
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    void withKey(async () => {
      setRunning(false);
      const s: Submission = { board: draft.board, marks: draft.marks, question: draft.question, answer: draft.answer,
                              time_taken_seconds: seconds > 0 ? seconds : null };
      const result = await api.grade(s);
      submitted.current = s;
      setGrade(result); setIdeal(null); setView("results");
      void key.refresh();
    });
  }

  function requestIdeal() {
    if (ideal) { setView("ideal"); return; }
    const s = submitted.current;
    if (!s) return;
    void withKey(async () => {
      setIdeal(await api.modelAnswer(s));
      setView("ideal");
      void key.refresh();
    });
  }

  if (view === "ideal" && ideal && grade && submitted.current) {
    return <ModelAnswerView ideal={ideal} original={submitted.current.answer} question={submitted.current.question} grade={grade} onBack={() => setView("results")} />;
  }
  if (view !== "write" && grade && submitted.current) {
    return <ResultsView result={grade} question={submitted.current.question} answer={submitted.current.answer} onBack={() => { setError(null); setView("write"); }}
                        onIdeal={requestIdeal} idealBusy={busy} error={error} />;
  }
  return (
    <WriteView boards={boards} draft={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
               seconds={seconds} running={running} onToggleTimer={() => setRunning((r) => !r)}
               onResetTimer={() => { setRunning(false); setSeconds(0); }}
               onSubmit={submit} busy={busy} error={error} />
  );
}

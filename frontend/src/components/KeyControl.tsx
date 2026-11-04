"use client";

import { useEffect, useRef, useState } from "react";
import { appConfig } from "@/config/app";
import { ApiError } from "@/lib/api";
import { t } from "@/lib/i18n";
import { useKey } from "./KeyContext";

export function KeyControl() {
  const { status, minutesLeft, dialogOpen, openDialog, closeDialog, add, forget } = useKey();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (dialogOpen && !d.open) { setError(null); d.showModal(); input.current?.focus(); }
    if (!dialogOpen && d.open) d.close();
  }, [dialogOpen]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = input.current?.value ?? "";
    setBusy(true); setError(null);
    try {
      await add(value);
      if (input.current) input.current.value = "";   // never keep the key in the page
    } catch (err) {
      setError(t(`errors.${err instanceof ApiError ? err.code : "generic"}`));
    } finally {
      setBusy(false);
    }
  }

  const label = status.active
    ? (minutesLeft !== null && minutesLeft < 1 ? t("key.statusActiveSoon") : t("key.statusActive", { minutes: minutesLeft ?? 0 }))
    : t("key.statusNone");

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
      <span className="key-status" aria-live="polite">
        <span className={`lamp${status.active ? " on" : ""}`} aria-hidden="true" />
        {label}
      </span>
      {status.active
        ? <button type="button" className="btn btn-small btn-pen" onClick={() => void forget()}>{t("key.forget")}</button>
        : <button type="button" className="btn btn-small btn-ghost" onClick={() => openDialog()}>{t("key.add")}</button>}

      <dialog ref={dialog} className="key-dialog" onClose={closeDialog} aria-labelledby="key-title">
        <form onSubmit={submit} className="sheet" style={{ padding: "32px 34px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <h2 id="key-title" className="h2i">{t("key.title")}</h2>
            <button type="button" className="linkish" onClick={closeDialog}>{t("key.close")}</button>
          </div>
          <p style={{ margin: 0, color: "var(--text-2)" }}>{t("key.explain", { idle: appConfig.keySession.idleMinutes, absolute: appConfig.keySession.absoluteMinutes })}</p>
          <div className="field">
            <label htmlFor="api-key" className="label">{t("key.label")}</label>
            {/* type=text + masking so browsers don't offer to save it as a password */}
            <input ref={input} id="api-key" name="gcse-claude-key" type="text" className="underline-input masked"
                   autoComplete="off" spellCheck={false} autoCapitalize="off" data-1p-ignore data-lpignore="true"
                   placeholder={t("key.placeholder")} required />
          </div>
          {error && <p role="alert" className="alert" style={{ margin: 0 }}>{error}</p>}
          <button type="submit" className="btn" disabled={busy}>{busy ? t("key.saving") : t("key.save")}</button>
          <p style={{ margin: 0, fontSize: 14 }} className="muted">
            {t("key.tip")} <a href={appConfig.claudeConsoleUrl} target="_blank" rel="noreferrer">{t("key.console")}</a>
          </p>
        </form>
      </dialog>
    </div>
  );
}

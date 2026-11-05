"use client";

import { appConfig } from "@/config/app";
import { t } from "@/lib/i18n";

/** A round "?" button that pops up step-by-step instructions for getting a Claude API key.
 *  Uses the native popover API: it opens above the key dialog, and closes on Esc or an outside click. */
export function KeyHelp() {
  const id = "key-help";
  return (
    <>
      <button type="button" className="info-btn" popoverTarget={id} aria-label={t("key.help.open")} title={t("key.help.open")}>
        <span aria-hidden="true">?</span>
      </button>
      <div id={id} popover="auto" className="key-help sheet" role="dialog" aria-labelledby="key-help-title">
        <h3 id="key-help-title" className="h2i">{t("key.help.title")}</h3>
        <p className="muted">{t("key.help.intro")}</p>
        <p className="key-help-age">{t("key.help.age")}</p>
        <ol className="key-help-steps">
          {appConfig.keyHelpSteps.map((step) => (
            <li key={step.id}>
              {t(`key.help.steps.${step.id}`)}
              {"url" in step && (
                <> <a href={step.url} target="_blank" rel="noreferrer">{t(`key.help.links.${step.id}`)}</a></>
              )}
            </li>
          ))}
        </ol>
        <p className="muted key-help-safety">{t("key.help.safety")}</p>
        <button type="button" className="btn-raised" popoverTarget={id} popoverTargetAction="hide">{t("key.help.close")}</button>
      </div>
    </>
  );
}

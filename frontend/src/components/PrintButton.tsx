"use client";

import type { ReactNode } from "react";
import { t } from "@/lib/i18n";

const PrinterIcon = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="1" /><path d="M7 14h10v7H7z" /></svg>
);

/** Opens the browser's print dialog (paper or PDF). Each page prints its own sheet (PrintSheets.tsx). */
export function PrintButton() {
  return (
    <button type="button" className="btn-raised" onClick={() => window.print()}>
      <PrinterIcon />{t("print.label")}
    </button>
  );
}

/** Top bar used on every page, so Print is always in the same place: top right. */
export function PageBar({ back }: { back?: ReactNode }) {
  return (
    <div className="page-bar no-print">
      {back ?? <span />}
      <PrintButton />
    </div>
  );
}

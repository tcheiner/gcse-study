"use client";

import { t } from "@/lib/i18n";

const PrinterIcon = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="1" /><path d="M7 14h10v7H7z" /></svg>
);

/** Opens the browser's print dialog (paper or PDF). The print stylesheet in globals.css lays out the page. */
/** The one print button style, used on every page. */
export function PrintButton({ labelKey }: { labelKey: string }) {
  return (
    <button type="button" className="btn-raised no-print" onClick={() => window.print()}>
      <PrinterIcon />{t(labelKey)}
    </button>
  );
}

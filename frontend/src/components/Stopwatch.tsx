"use client";

import { formatClock } from "@/lib/text";
import { t } from "@/lib/i18n";

const TICKS = Array.from({ length: 12 }, (_, i) => {
  const a = (i * 30 * Math.PI) / 180;
  const long = i % 3 === 0;
  const r2 = long ? 27 : 30;
  // Rounded so server and browser render identical SVG (float trig can differ in the last digit).
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { x1: r(40 + 33 * Math.sin(a)), y1: r(40 - 33 * Math.cos(a)), x2: r(40 + r2 * Math.sin(a)), y2: r(40 - r2 * Math.cos(a)), w: long ? 2 : 1 };
});
const CIRC = 2 * Math.PI * 22;

interface Props { seconds: number; running: boolean; targetMinutes: number; onToggle: () => void; onReset: () => void }

export function Stopwatch({ seconds, running, targetMinutes, onToggle, onReset }: Props) {
  const goal = targetMinutes * 60;
  const over = targetMinutes > 0 && seconds > goal;
  const progress = targetMinutes > 0 ? Math.min(1, seconds / goal) : (seconds % 60) / 60;
  const clock = formatClock(seconds);
  const note = targetMinutes === 0 ? t("write.noTarget")
    : over ? t("write.past", { n: targetMinutes }) : t("write.remaining", { time: formatClock(goal - seconds) });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <svg role="img" aria-label={t("write.stopwatch", { time: clock })} width="64" height="64" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="36" fill="var(--paper-2)" stroke="var(--text)" strokeWidth="2" />
        {TICKS.map((k, i) => <line key={i} x1={k.x1} y1={k.y1} x2={k.x2} y2={k.y2} stroke="var(--text)" strokeWidth={k.w} strokeLinecap="round" />)}
        <circle cx="40" cy="40" r="22" fill="none" stroke="#E3D8BE" strokeWidth="5" />
        <circle cx="40" cy="40" r="22" fill="none" stroke={over ? "var(--pen)" : "var(--ink)"} strokeWidth="5"
                strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - progress)} transform="rotate(-90 40 40)" />
        <line x1="40" y1="40" x2="40" y2="12" stroke="var(--pen)" strokeWidth="2" strokeLinecap="round" transform={`rotate(${(seconds % 60) * 6} 40 40)`} />
        <circle cx="40" cy="40" r="3" fill="var(--text)" />
      </svg>
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
        <span style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: "tabular-nums" }} aria-hidden="true">{clock}</span>
        <span style={{ fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase" }} className="muted">{note}</span>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" className="btn btn-small btn-dark" style={{ minWidth: 84 }} onClick={onToggle}>
          {running ? t("write.pause") : seconds > 0 ? t("write.resume") : t("write.start")}
        </button>
        <button type="button" className="btn btn-small btn-ghost" style={{ padding: 0, width: 44 }} onClick={onReset} aria-label={t("write.reset")}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
        </button>
      </div>
    </div>
  );
}

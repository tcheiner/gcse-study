export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

const ROMAN: [number, string][] = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];

export function toRoman(n: number): string {
  if (n <= 0) return "0";
  let out = "";
  for (const [value, sym] of ROMAN) while (n >= value) { out += sym; n -= value; }
  return out;
}

export interface Segment { text: string; mark?: { index: number; kind: string } }

/**
 * Split `text` into plain and marked segments for the given verbatim quotes.
 * Quotes that don't appear, or overlap an earlier quote, are skipped.
 */
export function segmentByQuotes(text: string, quotes: { quote: string; kind: string }[]): Segment[] {
  const spans: { start: number; end: number; index: number; kind: string }[] = [];
  quotes.forEach((q, index) => {
    if (!q.quote) return;
    const start = text.indexOf(q.quote);
    if (start < 0) return;
    const end = start + q.quote.length;
    if (spans.some((s) => start < s.end && end > s.start)) return;
    spans.push({ start, end, index, kind: q.kind });
  });
  spans.sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let pos = 0;
  for (const s of spans) {
    if (s.start > pos) out.push({ text: text.slice(pos, s.start) });
    out.push({ text: text.slice(s.start, s.end), mark: { index: s.index, kind: s.kind } });
    pos = s.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}

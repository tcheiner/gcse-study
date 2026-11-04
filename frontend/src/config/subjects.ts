// One ink colour per subject on a shared vintage-paper base. Values become CSS variables.
export type SubjectId = "english" | "maths" | "science" | "history";

export interface SubjectTheme {
  id: SubjectId;
  enabled: boolean;
  ink: string;      // accent: buttons, links, selected states
  inkDeep: string;  // pressed / shadow
  inkSoft: string;  // highlights, tints
  ruling: "lined" | "squared" | "dotted" | "parchment";
}

export const subjects: Record<SubjectId, SubjectTheme> = {
  english: { id: "english", enabled: true, ink: "#5C3A1E", inkDeep: "#3F2814", inkSoft: "#F0DFC8", ruling: "lined" },
  maths: { id: "maths", enabled: false, ink: "#3E5468", inkDeep: "#2B3D4E", inkSoft: "#DDE3E6", ruling: "squared" },
  science: { id: "science", enabled: false, ink: "#3D6660", inkDeep: "#2A4A45", inkSoft: "#DCE6E0", ruling: "dotted" },
  history: { id: "history", enabled: false, ink: "#6E3B4A", inkDeep: "#4E2834", inkSoft: "#EEDDD9", ruling: "parchment" },
};

export function themeStyle(id: SubjectId): Record<string, string> {
  const t = subjects[id];
  return { "--ink": t.ink, "--ink-deep": t.inkDeep, "--ink-soft": t.inkSoft };
}

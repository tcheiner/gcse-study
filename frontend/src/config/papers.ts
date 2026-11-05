// Which exam papers have a page, and their URLs: /english/<board>/<paper>/<section>.
// Add an entry (plus its mark scheme in the backend) to publish another paper or section.
export interface PaperRoute {
  board: string;   // URL segment
  paper: string;   // URL segment
  section: string; // URL segment
  /** Backend board id (backends/english/config/mark_schemes/<boardId>). */
  boardId: string;
  /** Locale key under `papers.` holding board, paper, section, summary and marks labels. */
  labelKey: string;
}

export const englishPapers: PaperRoute[] = [
  { board: "cambridge-0990", paper: "paper-2", section: "section-b", boardId: "cambridge-0990", labelKey: "cambridge0990p2b" },
];

export const paperPath = (p: PaperRoute) => `/english/${p.board}/${p.paper}/${p.section}`;

/** Where /, /english and the header wordmark go. */
export const defaultEnglishPath = paperPath(englishPapers[0]);

export function findPaper(board: string, paper: string, section: string): PaperRoute | undefined {
  return englishPapers.find((p) => p.board === board && p.paper === paper && p.section === section);
}

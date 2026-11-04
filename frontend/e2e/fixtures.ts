import type { Page, Route } from "@playwright/test";

export const ANSWER =
  "The writer uses the metaphor a sea of grey faces to suggest the crowd is overwhelming.\n\n" +
  "The short sentence Nobody moved. slows the pace. Then the writer talks about the man at the front.";

export const GRADE = {
  board: "edexcel-igcse", word_count: 33, time_taken_seconds: null, awarded: 8, max: 12, level: 3,
  level_summary: "Clear and relevant. Add detail on structure and explore layers of meaning.",
  objectives: [
    { code: "AO1", rating: "strong", comment: "You select relevant details." },
    { code: "AO2", rating: "developing", comment: "Structure is only mentioned once." },
  ],
  strengths: ["Well-chosen quotation."],
  improvements: ["Explain why the focus narrows.", "Offer a second reading of grey."],
  annotations: [
    { quote: "a sea of grey faces", kind: "strength", note: "Well chosen, and you name the effect." },
    { quote: "Then the writer talks about the man at the front.", kind: "improve", note: "This is a structural shift: say why." },
  ],
  examiner_summary: "You pick strong quotations and explain their effect clearly.",
  mark_scheme: {
    overview: "Marked by levels.", status: "draft",
    objectives: [
      { code: "AO1", label: "Read and understand", student_summary: "Show you understand the text." },
      { code: "AO2", label: "Analyse language and structure", student_summary: "Explain HOW the writer creates effects." },
    ],
    levels: [
      { level: 0, min: 0, max: 0, student_summary: "Nothing yet earns marks." },
      { level: 1, min: 1, max: 3, student_summary: "You mostly describe what happens." },
      { level: 2, min: 4, max: 6, student_summary: "You spot techniques." },
      { level: 3, min: 7, max: 9, student_summary: "Clear and relevant." },
      { level: 4, min: 10, max: 12, student_summary: "Perceptive and critical throughout." },
    ],
  },
};

export const IDEAL = {
  board: "edexcel-igcse", max: 12,
  rewritten: "The writer builds tension through the metaphor of a sea of grey faces.\n\nStructurally, the focus narrows to one man, mirroring the narrator's fear.",
  changes: [
    { what: "Structure, not just language", why: "The top level needs both.", excerpt: "Structurally, the focus narrows to one man" },
  ],
};

const BOARDS = [{ id: "edexcel-igcse", name: "Pearson Edexcel International GCSE", specification: "English Language A (4EA1)", paper: 2, tariffs: [6, 9, 12], status: "draft" }];
const INACTIVE = { active: false, idle_expires_at: null, absolute_expires_at: null };
const active = () => {
  const now = Date.now() / 1000;
  return { active: true, idle_expires_at: now + 20 * 60, absolute_expires_at: now + 120 * 60 };
};

type Handler = (route: Route) => Promise<void> | void;
export interface MockOptions {
  keyActive?: boolean; addKey?: Handler; grade?: Handler; modelAnswer?: Handler; down?: boolean;
  /** Make the grade job finish with this error code instead of a result. */
  gradeJobError?: string;
}

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

/** Mock the English backend at the network layer; returns the requests seen. */
export async function mockBackend(page: Page, opts: MockOptions = {}) {
  let keyActive = opts.keyActive ?? false;
  const seen: { method: string; path: string; body: unknown }[] = [];
  // Background jobs: start returns 202 + id; the first poll is pending, the next one finishes.
  const jobs = new Map<string, { polls: number; done: unknown }>();
  const startJob = (route: Route, id: string, done: unknown) => {
    jobs.set(id, { polls: 0, done });
    return json(route, 202, { job_id: id, status: "pending" });
  };
  await page.route("**/api/english/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace("/api/english", "");
    seen.push({ method: req.method(), path, body: req.postDataJSON?.() ?? null });
    if (opts.down) return route.abort("connectionrefused");
    if (path === "/boards") return json(route, 200, BOARDS);
    if (path === "/session") return json(route, 200, keyActive ? active() : INACTIVE);
    if (path === "/session/key" && req.method() === "DELETE") { keyActive = false; return json(route, 200, INACTIVE); }
    if (path === "/session/key") {
      if (opts.addKey) return opts.addKey(route);
      keyActive = true; return json(route, 200, active());
    }
    if (path === "/grade") {
      if (opts.grade) return opts.grade(route);
      return startJob(route, "grade-1", opts.gradeJobError
        ? { status: "error", result: null, code: opts.gradeJobError, message: "x" }
        : { status: "done", result: GRADE, code: null, message: null });
    }
    if (path === "/model-answer") {
      if (opts.modelAnswer) return opts.modelAnswer(route);
      return startJob(route, "ideal-1", { status: "done", result: IDEAL, code: null, message: null });
    }
    if (path.startsWith("/jobs/")) {
      const job = jobs.get(path.slice("/jobs/".length));
      if (!job) return json(route, 404, { code: "job_missing", message: "gone" });
      job.polls += 1;
      return json(route, 200, job.polls === 1 ? { status: "pending", result: null, code: null, message: null } : job.done);
    }
    return json(route, 404, { code: "generic", message: "not mocked" });
  });
  return seen;
}

export async function fillAnswer(page: Page) {
  await page.getByLabel("Type or paste the question").fill("How does the writer create tension?");
  await page.getByRole("textbox", { name: "Your answer", exact: true }).fill(ANSWER);
}

export { json };

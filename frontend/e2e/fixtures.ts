import type { Page, Route } from "@playwright/test";

export const QUESTION = "Describe an object that has been broken for a long time.";
export const ANSWER =
  "The clock on the landing stopped years ago, its hands folded like a sleeper's.\n\n" +
  "Dust lies over the glass. Then I remembered my grandad winding it every Sunday.";

export const GRADE = {
  board: "cambridge-0990", word_count: 28, time_taken_seconds: null, awarded: 22, max: 40, genre: "descriptive",
  grids: [
    {
      id: "content_structure", label: "Content & Structure", student_summary: "Ideas, genre and shape (W1, W2).",
      score: 9, max: 16, level: "Level 4", level_summary: "On task but only partly developed.",
      justification: "The focus on the clock is clear but the picture is only partly developed.",
      levels: [
      { name: "Level 6", min: 14, max: 16, student_summary: "Complex, engaging and tightly focused." },
      { name: "Level 5", min: 11, max: 13, student_summary: "Well developed and mostly engaging." },
      { name: "Level 4", min: 8, max: 10, student_summary: "On task but only partly developed." },
      { name: "Level 3", min: 5, max: 7, student_summary: "Straightforward and briefly developed." },
      { name: "Level 2", min: 3, max: 4, student_summary: "Simple and unfocused." },
      { name: "Level 1", min: 1, max: 2, student_summary: "Hard to follow." },
      { name: "Level 0", min: 0, max: 0, student_summary: "Nothing yet earns marks." },
      ],
    },
    {
      id: "style_accuracy", label: "Style & Accuracy", student_summary: "Vocabulary, sentences and accuracy (W3–W5).",
      score: 13, max: 24, level: "Level 4", level_summary: "Sometimes precise and effective.",
      justification: "Some precise vocabulary; sentence structures are rarely varied for effect.",
      levels: [
      { name: "Level 6", min: 21, max: 24, student_summary: "Precise words, almost always accurate." },
      { name: "Level 5", min: 17, max: 20, student_summary: "Mostly precise and engaging." },
      { name: "Level 4", min: 13, max: 16, student_summary: "Sometimes precise and effective." },
      { name: "Level 3", min: 9, max: 12, student_summary: "Simple words and sentences." },
      { name: "Level 2", min: 5, max: 8, student_summary: "Limited or imprecise language." },
      { name: "Level 1", min: 1, max: 4, student_summary: "Frequently imprecise." },
      { name: "Level 0", min: 0, max: 0, student_summary: "Nothing yet earns marks." },
      ],
    },
  ],
  level_drop: { triggered: true, explanation: "The memory of grandad starts to turn the description into a story." },
  level_up_steps: ["Shift focus from the clock face to the stilled pendulum.", "Use a semicolon to balance past and present."],
  annotations: [
    { quote: "its hands folded like a sleeper's", kind: "strength", note: "A striking, quiet image." },
    { quote: "Then I remembered my grandad winding it every Sunday.", kind: "improve", note: "This drifts into narrative: keep describing." },
  ],
  overview: "Your composition is marked as a whole.", status: "official",
};

export const IDEAL = {
  board: "cambridge-0990", max: 40,
  rewritten: "The clock on the landing has not spoken for years; its hands are folded like a sleeper's.\n\nBeneath the glass, the pendulum hangs mid-swing, a held breath.",
  changes: [
    { what: "A shift of focus", why: "Level 6 descriptions vary their focus.", excerpt: "the pendulum hangs mid-swing, a held breath" },
  ],
};

const BOARDS = [{ id: "cambridge-0990", name: "Cambridge IGCSE First Language English", specification: "First Language English (0990)", paper: 2, tariffs: [40], status: "official" }];
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
  await page.getByLabel("Type or paste the question").fill(QUESTION);
  await page.getByRole("textbox", { name: "Your answer", exact: true }).fill(ANSWER);
}

export { json };

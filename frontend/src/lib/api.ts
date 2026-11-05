// Typed client for the English backend. All calls are same-origin (/api/english/*),
// so the HttpOnly key cookie is sent automatically and never touched by JS.
import { appConfig } from "@/config/app";

export interface BoardInfo { id: string; name: string; specification: string; paper: number; tariffs: number[]; status: string }
export interface SessionStatus { active: boolean; idle_expires_at: number | null; absolute_expires_at: number | null }
export interface Submission { board: string; marks: number; question: string; answer: string; time_taken_seconds: number | null }
export interface Annotation { quote: string; kind: "strength" | "improve"; note: string }
export interface LevelInfo { name: string; min: number; max: number; student_summary: string }
export interface GridResult {
  id: string; label: string; student_summary: string; score: number; max: number;
  level: string; level_summary: string; justification: string; levels: LevelInfo[];
}
export interface GradeResult {
  board: string; word_count: number; time_taken_seconds: number | null;
  awarded: number; max: number; genre: "descriptive" | "narrative"; grids: GridResult[];
  level_drop: { triggered: boolean; explanation: string };
  level_up_steps: string[]; annotations: Annotation[]; overview: string; status: string;
}
export interface Change { what: string; why: string; excerpt: string }
export interface ModelAnswer { board: string; max: number; rewritten: string; changes: Change[] }

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

const base = appConfig.apiPaths.english;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(base + path, {
      ...init,
      credentials: "same-origin",
      headers: init.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    throw new ApiError("network", "network", 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const code = data && typeof data.code === "string" ? data.code : "generic";
    throw new ApiError(code, data?.message ?? res.statusText, res.status);
  }
  return data as T;
}

interface JobStarted { job_id: string; status: "pending" }
interface JobStatus<T> { status: "pending" | "done" | "error"; result: T | null; code: string | null; message: string | null }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Start a slow job (202 + job id), then poll /jobs/{id} until it finishes. Each request is short,
 * so proxy time limits never apply however long Claude takes.
 */
export async function runJob<T>(path: string, body: unknown, opts: { pollMs: number; maxWaitMs: number } = appConfig.jobs): Promise<T> {
  const { job_id } = await request<JobStarted>(path, { method: "POST", body: JSON.stringify(body) });
  const deadline = Date.now() + opts.maxWaitMs;
  while (Date.now() < deadline) {
    await sleep(opts.pollMs);
    const s = await request<JobStatus<T>>(`/jobs/${encodeURIComponent(job_id)}`);
    if (s.status === "done" && s.result) return s.result;
    if (s.status === "error") throw new ApiError(s.code ?? "generic", s.message ?? "", 200);
  }
  throw new ApiError("timeout", "timeout", 0);
}

export const api = {
  boards: () => request<BoardInfo[]>("/boards"),
  session: () => request<SessionStatus>("/session"),
  addKey: (apiKey: string) => request<SessionStatus>("/session/key", { method: "POST", body: JSON.stringify({ api_key: apiKey }) }),
  forgetKey: () => request<SessionStatus>("/session/key", { method: "DELETE" }),
  grade: (s: Submission) => runJob<GradeResult>("/grade", s),
  modelAnswer: (s: Submission) => runJob<ModelAnswer>("/model-answer", s),
};

export const KEY_ERRORS = new Set(["key_required", "key_expired", "key_invalid"]);

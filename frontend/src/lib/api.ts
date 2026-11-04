// Typed client for the English backend. All calls are same-origin (/api/english/*),
// so the HttpOnly key cookie is sent automatically and never touched by JS.
import { appConfig } from "@/config/app";

export type Rating = "strong" | "developing" | "limited";

export interface BoardInfo { id: string; name: string; specification: string; paper: number; tariffs: number[]; status: string }
export interface SessionStatus { active: boolean; idle_expires_at: number | null; absolute_expires_at: number | null }
export interface Submission { board: string; marks: number; question: string; answer: string; time_taken_seconds: number | null }
export interface Annotation { quote: string; kind: "strength" | "improve"; note: string }
export interface Objective { code: string; rating: Rating; comment: string }
export interface LevelInfo { level: number; min: number; max: number; student_summary: string }
export interface GradeResult {
  board: string; word_count: number; time_taken_seconds: number | null;
  awarded: number; max: number; level: number; level_summary: string;
  objectives: Objective[]; strengths: string[]; improvements: string[]; annotations: Annotation[];
  examiner_summary: string;
  mark_scheme: { overview: string; objectives: { code: string; label: string; student_summary: string }[]; levels: LevelInfo[]; status: string };
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

export const api = {
  boards: () => request<BoardInfo[]>("/boards"),
  session: () => request<SessionStatus>("/session"),
  addKey: (apiKey: string) => request<SessionStatus>("/session/key", { method: "POST", body: JSON.stringify({ api_key: apiKey }) }),
  forgetKey: () => request<SessionStatus>("/session/key", { method: "DELETE" }),
  grade: (s: Submission) => request<GradeResult>("/grade", { method: "POST", body: JSON.stringify(s) }),
  modelAnswer: (s: Submission) => request<ModelAnswer>("/model-answer", { method: "POST", body: JSON.stringify(s) }),
};

export const KEY_ERRORS = new Set(["key_required", "key_expired", "key_invalid"]);

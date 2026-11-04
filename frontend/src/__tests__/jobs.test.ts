import { afterEach, describe, expect, it, vi } from "vitest";
import { runJob } from "@/lib/api";

afterEach(() => vi.unstubAllGlobals());

const res = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function stubSequence(...responses: Response[]) {
  const fn = vi.fn();
  responses.forEach((r) => fn.mockResolvedValueOnce(r));
  vi.stubGlobal("fetch", fn);
  return fn;
}

const fast = { pollMs: 1, maxWaitMs: 1000 };

describe("runJob", () => {
  it("starts the job, polls while pending, returns the result", async () => {
    const fetch = stubSequence(
      res(202, { job_id: "abc", status: "pending" }),
      res(200, { status: "pending", result: null, code: null, message: null }),
      res(200, { status: "done", result: { awarded: 8 }, code: null, message: null }),
    );
    await expect(runJob("/grade", { a: 1 }, fast)).resolves.toEqual({ awarded: 8 });
    expect(fetch.mock.calls.map((c) => c[0])).toEqual(["/api/english/grade", "/api/english/jobs/abc", "/api/english/jobs/abc"]);
    expect(fetch.mock.calls[0][1].method).toBe("POST");
  });

  it("surfaces a job error code", async () => {
    stubSequence(res(202, { job_id: "x" }), res(200, { status: "error", result: null, code: "refusal", message: "no" }));
    await expect(runJob("/grade", {}, fast)).rejects.toMatchObject({ code: "refusal" });
  });

  it("passes through start errors (e.g. validation)", async () => {
    stubSequence(res(422, { code: "answer_too_short", message: "x" }));
    await expect(runJob("/grade", {}, fast)).rejects.toMatchObject({ code: "answer_too_short", status: 422 });
  });

  it("reports a missing job", async () => {
    stubSequence(res(202, { job_id: "x" }), res(404, { code: "job_missing", message: "gone" }));
    await expect(runJob("/grade", {}, fast)).rejects.toMatchObject({ code: "job_missing" });
  });

  it("gives up after maxWaitMs", async () => {
    const pending = () => res(200, { status: "pending", result: null, code: null, message: null });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(res(202, { job_id: "x" })).mockImplementation(async () => pending()));
    await expect(runJob("/grade", {}, { pollMs: 5, maxWaitMs: 30 })).rejects.toMatchObject({ code: "timeout" });
  });
});

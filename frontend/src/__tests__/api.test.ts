import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("api", () => {
  it("posts JSON to the same-origin proxy with cookies", async () => {
    const fetch = stubFetch(200, { active: true, idle_expires_at: 1, absolute_expires_at: 2 });
    await api.addKey("sk-ant-x");
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("/api/english/session/key");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(JSON.parse(init.body)).toEqual({ api_key: "sk-ant-x" });
  });

  it("turns backend errors into ApiError codes", async () => {
    stubFetch(401, { code: "key_expired", message: "gone" });
    await expect(api.session()).rejects.toMatchObject({ code: "key_expired", status: 401 });
  });

  it("uses 'generic' when the error body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("oops", { status: 500 })));
    await expect(api.boards()).rejects.toMatchObject({ code: "generic", status: 500 });
  });

  it("reports network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("failed")));
    const err = await api.boards().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("network");
  });
});

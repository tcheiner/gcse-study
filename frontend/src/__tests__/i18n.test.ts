import { describe, expect, it } from "vitest";
import { has, t } from "@/lib/i18n";

describe("t", () => {
  it("fills placeholders and falls back to the key", () => {
    expect(t("write.remaining", { time: "05:00" })).toBe("05:00 remaining");
    expect(t("no.such.key")).toBe("no.such.key");
  });

  it("has a message for every error code the backend can return", () => {
    const codes = [
      "question_required", "question_too_long", "answer_too_short", "answer_too_long", "scheme_not_found",
      "rate_limited", "key_required", "key_expired", "key_invalid", "key_format", "invalid_api_key",
      "permission_denied", "refusal", "truncated", "unparseable", "connection_error", "upstream_error",
      "bad_origin", "job_missing", "timeout", "network", "generic",
    ];
    expect(codes.filter((c) => !has(`errors.${c}`))).toEqual([]);
  });
});

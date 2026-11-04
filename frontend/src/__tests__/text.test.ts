import { describe, expect, it } from "vitest";
import { formatClock, segmentByQuotes, toRoman, wordCount } from "@/lib/text";

describe("wordCount", () => {
  it("counts words across whitespace", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("   ")).toBe(0);
    expect(wordCount("The  writer\nuses\tlanguage.")).toBe(4);
  });
});

describe("formatClock", () => {
  it("formats mm:ss and clamps negatives", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(1122)).toBe("18:42");
    expect(formatClock(-5)).toBe("00:00");
  });
});

describe("toRoman", () => {
  it("handles levels and tariffs", () => {
    expect([0, 1, 2, 3, 4, 6, 9, 12].map(toRoman)).toEqual(["0", "I", "II", "III", "IV", "VI", "IX", "XII"]);
  });
});

describe("segmentByQuotes", () => {
  const text = "A sea of grey faces. Nobody moved. Then the man spoke.";
  it("marks verbatim quotes in order and keeps the rest", () => {
    const segs = segmentByQuotes(text, [
      { quote: "Nobody moved.", kind: "strength" },
      { quote: "A sea of grey faces", kind: "improve" },
    ]);
    expect(segs.map((s) => s.text).join("")).toBe(text);
    expect(segs.filter((s) => s.mark).map((s) => [s.text, s.mark!.index, s.mark!.kind])).toEqual([
      ["A sea of grey faces", 1, "improve"],
      ["Nobody moved.", 0, "strength"],
    ]);
  });
  it("skips missing, empty and overlapping quotes", () => {
    const segs = segmentByQuotes(text, [
      { quote: "grey faces", kind: "strength" },
      { quote: "sea of grey", kind: "improve" },
      { quote: "not here", kind: "improve" },
      { quote: "", kind: "improve" },
    ]);
    expect(segs.filter((s) => s.mark).map((s) => s.text)).toEqual(["grey faces"]);
  });
});

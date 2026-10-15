import { describe, expect, it } from "vitest";
import { lighthouseSeverity, sortLighthouseAudits } from "./lighthouse";

describe("lighthouseSeverity", () => {
  it("is critical from 300 ms or 150 KB of savings, or a score under 0.5", () => {
    expect(lighthouseSeverity({ score: 0.8, savingsMs: 300 })).toBe("critical");
    expect(lighthouseSeverity({ score: 0.8, savingsBytes: 150 * 1024 })).toBe("critical");
    expect(lighthouseSeverity({ score: 0.49 })).toBe("critical");
  });

  it("is a warning from 100 ms or 50 KB of savings, or a score under 0.9", () => {
    expect(lighthouseSeverity({ score: 0.95, savingsMs: 100 })).toBe("warning");
    expect(lighthouseSeverity({ score: 0.95, savingsMs: 299 })).toBe("warning");
    expect(lighthouseSeverity({ score: 0.95, savingsBytes: 50 * 1024 })).toBe("warning");
    expect(lighthouseSeverity({ score: 0.5 })).toBe("warning");
    expect(lighthouseSeverity({ score: 0.89 })).toBe("warning");
  });

  it("is info otherwise", () => {
    expect(lighthouseSeverity({ score: 0.9 })).toBe("info");
    expect(lighthouseSeverity({ score: 0.95, savingsMs: 99 })).toBe("info");
  });

  it("reads 0–100 scores the same as 0–1", () => {
    expect(lighthouseSeverity({ score: 40 })).toBe("critical");
    expect(lighthouseSeverity({ score: 85 })).toBe("warning");
    expect(lighthouseSeverity({ score: 95 })).toBe("info");
  });
});

describe("sortLighthouseAudits", () => {
  it("puts the most serious first, then the biggest saving, then the lowest score", () => {
    const sorted = sortLighthouseAudits([
      { id: "a", score: 0.95 },
      { id: "b", score: 0.6, savingsMs: 150 },
      { id: "c", score: 0.7, savingsMs: 900 },
      { id: "d", score: 0.3 },
      { id: "e", score: 0.6, savingsMs: 250 },
    ]);
    expect(sorted.map((a) => [a.id, a.severity])).toEqual([
      ["c", "critical"],
      ["d", "critical"],
      ["e", "warning"],
      ["b", "warning"],
      ["a", "info"],
    ]);
  });
});

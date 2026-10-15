import { describe, expect, it } from "vitest";
import { monthlyPrice, monthlyText, runPrice, whereText } from "@/components/tracking/rank";
import { optInt, oneOf, splitLines, toSave, urlPath } from "@/components/research/util";
import { compact, usd } from "./api";
import { compareValues, hostOf, safeHref } from "./url";

describe("prices shown before a run", () => {
  it("prices a rank run from one page per check to the full depth", () => {
    expect(runPrice(100, 2, 30)).toEqual({ checks: 200, min: 2, max: 6 });
    expect(runPrice(3, 1, 10)).toEqual({ checks: 3, min: 0.03, max: 0.03 });
  });

  it("projects a monthly price from the schedule", () => {
    expect(monthlyPrice({ min: 1, max: 2 }, "weekly")).toEqual({ runs: 4.35, min: 4.35, max: 8.7 });
    expect(monthlyPrice({ min: 1, max: 2 }, "manual")).toBeNull();
    expect(monthlyText({ min: 1, max: 1 }, "daily")).toBe("$30.00 / month");
    expect(monthlyText({ min: 1, max: 1 }, "manual")).toBe("manual runs only");
  });

  it("formats money without rounding small costs away", () => {
    expect(usd(0.024)).toBe("$0.024");
    expect(usd(1.5)).toBe("$1.50");
    expect(usd(null)).toBe("—");
    expect(compact(1500)).toBe("1.5K");
  });
});

describe("sorting", () => {
  it("puts empty values last in both directions and sorts numbers in text naturally", () => {
    const values = [3, null, 1, Number.NaN, 2];
    expect([...values].sort((a, b) => compareValues(a, b, "asc"))).toEqual([1, 2, 3, null, Number.NaN]);
    expect([...values].sort((a, b) => compareValues(a, b, "desc")).slice(0, 3)).toEqual([3, 2, 1]);
    expect(["item 10", "item 2", ""].sort((a, b) => compareValues(a, b, "asc"))).toEqual(["item 2", "item 10", ""]);
  });
});

describe("urls", () => {
  it("only links http(s) and reads hosts from URLs or bare domains", () => {
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
    expect(safeHref("https://a.com/x")).toBe("https://a.com/x");
    expect(hostOf("https://www.Example.com/a")).toBe("example.com");
    expect(hostOf("example.com")).toBe("example.com");
    expect(hostOf(null)).toBe("");
    expect(urlPath("https://a.com/x?y=1")).toBe("/x?y=1");
  });

  it("describes a tracker location", () => {
    expect(whereText({ locationName: "Austin,Texas,United States", latitude: null, longitude: null })).toBe("Austin, Texas, United States");
    expect(whereText({ locationName: "Here", latitude: 30.26721, longitude: -97.7431 })).toBe("Here (30.2672, -97.7431)");
  });
});

describe("form helpers", () => {
  it("parses optional integers and enum values", () => {
    expect(optInt("", 0)).toBeUndefined();
    expect(optInt("12.6", 0, 10)).toBe(10);
    expect(optInt("abc")).toBeUndefined();
    expect(oneOf("b", ["a", "b"] as const, "a")).toBe("b");
    expect(oneOf("z", ["a", "b"] as const, "a")).toBe("a");
  });

  it("splits pasted lists into unique entries", () => {
    expect(splitLines("a\n\n b \na")).toEqual(["a", "b"]);
    expect(splitLines("a, b\nc", { commas: true })).toEqual(["a", "b", "c"]);
  });

  it("builds a saveable keyword: integer metrics and only trend points with a volume", () => {
    expect(
      toSave({
        keyword: "k",
        volume: 10.4,
        difficulty: 33.7,
        cpc: Number.NaN,
        trend: [
          { month: "2026-01", volume: 5 },
          { month: "2026-02", volume: null as unknown as number },
        ],
      }),
    ).toEqual({ keyword: "k", volume: 10, cpc: null, competition: null, difficulty: 34, intent: null, trend: [{ month: "2026-01", volume: 5 }] });
    expect(toSave({ keyword: "k", trend: [{ month: "2026-01", volume: null as unknown as number }] }).trend).toBeNull();
  });
});

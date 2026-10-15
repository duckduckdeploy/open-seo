import { describe, expect, it } from "vitest";
import { analyseAnswer, brandKey, cleanSources, cleanSourceUrl, firstMention, isBrandedPrompt, proseForMatching } from "./brand-analysis";
import { hostMatches, toDomain } from "./domain";
import { buildGrid } from "./geo";
import { firstRunAt, nextRunAfter } from "./pool";

describe("firstMention", () => {
  it("matches whole words only, case-insensitively", () => {
    expect(firstMention("Try acme for this", ["Acme"])).toBe(4);
    expect(firstMention("Acmeology is unrelated", ["Acme"])).toBe(-1);
    expect(firstMention("Use Ahrefs (ahrefs.com).", ["ahrefs.com"])).toBe(12);
  });
});

describe("analyseAnswer", () => {
  const brands = [
    { name: "Acme", domain: "acme.com", aliases: ["Acme Tools"] },
    { name: "Globex", domain: "globex.io" },
    { name: "Initech" },
  ];

  it("orders brands by first mention and detects citations by domain", () => {
    const hits = analyseAnswer(
      "Globex is the usual pick. Acme Tools is a newer option.",
      [{ url: "https://blog.acme.com/guide" }, { url: "https://example.org" }],
      brands,
    );
    expect(hits).toEqual([
      { name: "Acme", mentioned: true, cited: true, position: 2 },
      { name: "Globex", mentioned: true, cited: false, position: 1 },
      { name: "Initech", mentioned: false, cited: false, position: null },
    ]);
  });

  it("reports cited without a mention", () => {
    const [own] = analyseAnswer("No names here.", [{ url: "https://www.acme.com/" }], brands);
    expect(own).toEqual({ name: "Acme", mentioned: false, cited: true, position: null });
  });

  it("does not count links, emails or citation markers as mentions", () => {
    for (const text of [
      "See https://acme.com/guide for details.",
      "Read more at www.acme.com today.",
      "Sources: [acme.com](https://acme.com/guide) and [1](https://acme.com).",
      "Write to hello@acme.com for help.",
    ]) {
      expect(analyseAnswer(text, [], brands)[0]?.mentioned, text).toBe(false);
    }
  });

  it("still counts the brand in link text that is words, and in plain prose", () => {
    expect(analyseAnswer("Try [Acme Tools](https://acme.com) first.", [], brands)[0]).toMatchObject({ mentioned: true, position: 1 });
    expect(analyseAnswer("Many teams use acme.com for this [2].", [], brands)[0]?.mentioned).toBe(true);
  });

  it("keeps positions in answer order after blanking", () => {
    const hits = analyseAnswer("[1] https://acme.com Globex comes first, then Acme.", [], brands);
    expect(hits.slice(0, 2)).toEqual([
      { name: "Acme", mentioned: true, cited: false, position: 2 },
      { name: "Globex", mentioned: true, cited: false, position: 1 },
    ]);
  });
});

describe("proseForMatching", () => {
  it("keeps the length of the text", () => {
    const text = "A [b](https://c.d) e [1] f@g.hi www.x.y";
    expect(proseForMatching(text)).toHaveLength(text.length);
  });
});

describe("firstMention", () => {
  it("ignores terms under two characters", () => {
    expect(firstMention("X marks the spot", ["X"])).toBe(-1);
    expect(firstMention("Use HP for this", ["HP"])).toBe(4);
  });
});

describe("branded prompts", () => {
  const acme = { name: "Acme", aliases: ["Acme Tools"], domain: "acme.com" };
  it("detects prompts that name the brand, an alias or its domain", () => {
    expect(isBrandedPrompt("Is Acme any good?", acme)).toBe(true);
    expect(isBrandedPrompt("acme tools vs globex", acme)).toBe(true);
    expect(isBrandedPrompt("Reviews of acme.com", acme)).toBe(true);
    expect(isBrandedPrompt("Best plumbing software?", acme)).toBe(false);
  });

  it("keys answers by brand name and domain", () => {
    expect(brandKey({ name: " Acme ", domain: "Acme.com" })).toBe("acme|acme.com");
    expect(brandKey({ name: "Acme" })).toBe("acme|");
  });
});

describe("cleanSources", () => {
  it("strips tracking parameters and fragments, drops duplicates and non-web links", () => {
    expect(
      cleanSources([
        { url: "https://acme.com/guide?utm_source=chatgpt.com&id=4#top", title: "Guide" },
        { url: "https://acme.com/guide?id=4&gclid=abc" },
        { url: "mailto:hi@acme.com" },
        { url: "not a url" },
        { url: "https://globex.io/?fbclid=1&msclkid=2" },
      ]),
    ).toEqual([{ url: "https://acme.com/guide?id=4", title: "Guide" }, { url: "https://globex.io/" }]);
    expect(cleanSourceUrl("ftp://acme.com/file")).toBeNull();
  });
});

describe("domain helpers", () => {
  it("normalises input and matches subdomains", () => {
    expect(toDomain("https://www.Example.com/path?q=1")).toBe("example.com");
    expect(hostMatches("blog.example.com", "example.com")).toBe(true);
    expect(hostMatches("notexample.com", "example.com")).toBe(false);
  });
});

describe("schedules", () => {
  const at = (iso: string) => new Date(iso);

  it("places a new schedule one period out, between 04:00 and 09:59 UTC", () => {
    const now = at("2026-10-15T17:42:00Z");
    expect(firstRunAt("manual", now)).toBeNull();
    expect(firstRunAt("daily", now, () => 0)?.toISOString()).toBe("2026-10-16T04:00:00.000Z");
    expect(firstRunAt("weekly", now, () => 0.999)?.toISOString()).toBe("2026-10-22T09:59:00.000Z");
    expect(firstRunAt("monthly", now, () => 0.5)?.toISOString()).toBe("2026-11-15T07:00:00.000Z");
  });

  it("advances from the anchor, not from when the run happened, so it does not drift", () => {
    const anchor = at("2026-10-15T05:30:00Z");
    // The tick that claims it runs 4 minutes late; the next run keeps 05:30.
    expect(nextRunAfter("weekly", anchor, at("2026-10-15T05:34:00Z"))?.toISOString()).toBe("2026-10-22T05:30:00.000Z");
    // A worker that was down for days skips the missed periods instead of running them back to back.
    expect(nextRunAfter("daily", anchor, at("2026-10-18T12:00:00Z"))?.toISOString()).toBe("2026-10-19T05:30:00.000Z");
    expect(nextRunAfter("manual", anchor)).toBeNull();
  });

  it("keeps the day of the month, or the last day when the month is shorter", () => {
    const now = at("2026-01-31T06:00:00Z");
    expect(nextRunAfter("monthly", at("2026-01-31T06:00:00Z"), now)?.toISOString()).toBe("2026-02-28T06:00:00.000Z");
    expect(nextRunAfter("monthly", at("2026-03-15T06:00:00Z"), at("2026-03-15T06:00:00Z"))?.toISOString()).toBe("2026-04-15T06:00:00.000Z");
  });
});

describe("buildGrid", () => {
  it("centres the grid and spaces points by the requested distance", () => {
    const grid = buildGrid(30.2672, -97.7431, 3, 1000);
    expect(grid).toHaveLength(9);
    const centre = grid[4];
    expect(centre).toMatchObject({ row: 1, col: 1, lat: 30.2672, lng: -97.7431 });
    const north = grid[1];
    expect(((north?.lat ?? 0) - 30.2672) * 111_320).toBeCloseTo(1000, 0);
    expect(grid[0]?.lng).toBeLessThan(grid[2]?.lng ?? 0);
  });
});

import { describe, expect, it } from "vitest";
import { decrypt, encrypt, newApiKey, sha256 } from "../src/lib/crypto";
import { isInvalidInput, parse, uuidParam } from "../src/lib/errors";
import { z } from "zod";

describe("crypto", () => {
  it("round-trips with a fresh IV each time and rejects tampering", () => {
    const a = encrypt("yep_sk_secret");
    const b = encrypt("yep_sk_secret");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("yep_sk_secret");
    const [iv, tag, data] = a.split(".");
    const flipped = Buffer.from(data!, "base64");
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    expect(() => decrypt([iv, tag, flipped.toString("base64")].join("."))).toThrow();
    expect(() => decrypt("garbage")).toThrow();
  });

  it("makes API keys with a 12-character prefix and a SHA-256 hash", () => {
    const { key, prefix, hash } = newApiKey();
    expect(key).toMatch(/^oseo_[A-Za-z0-9_-]{43}$/);
    expect(prefix).toBe(key.slice(0, 12));
    expect(hash).toBe(sha256(key));
  });
});

describe("errors", () => {
  it("turns schema failures into a validation error naming the field", () => {
    expect(() => parse(z.object({ name: z.string().min(2) }), { name: "x" })).toThrow(/name:/);
  });

  it("treats a malformed id as not found and recognises Postgres invalid input", () => {
    expect(() => uuidParam("nope", "Run")).toThrow("Run not found");
    expect(uuidParam("00000000-0000-0000-0000-000000000000", "Run")).toBe("00000000-0000-0000-0000-000000000000");
    expect(isInvalidInput({ cause: { code: "22P02" } })).toBe(true);
    expect(isInvalidInput(new Error("x"))).toBe(false);
  });
});

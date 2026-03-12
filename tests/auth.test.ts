import { describe, expect, it } from "vitest";
import { extractBearerToken, tokensMatch } from "../src/auth.js";

describe("tokensMatch", () => {
  it("returns true for identical tokens", () => {
    expect(tokensMatch("abc123", "abc123")).toBe(true);
  });

  it("returns false for different tokens", () => {
    expect(tokensMatch("abc123", "xyz789")).toBe(false);
  });

  it("returns false for empty vs non-empty", () => {
    expect(tokensMatch("", "abc123")).toBe(false);
  });

  it("returns true for both empty strings", () => {
    expect(tokensMatch("", "")).toBe(true);
  });

  it("trims leading/trailing whitespace before comparing", () => {
    expect(tokensMatch("  abc123  ", "abc123")).toBe(true);
    expect(tokensMatch("abc123", "  abc123  ")).toBe(true);
  });

  it("is case-sensitive", () => {
    expect(tokensMatch("AbC123", "abc123")).toBe(false);
  });

  it("handles very long tokens", () => {
    const long = "x".repeat(10_000);
    expect(tokensMatch(long, long)).toBe(true);
    expect(tokensMatch(long, long + "y")).toBe(false);
  });

  it("returns false for tokens differing by one character", () => {
    expect(tokensMatch("abc123", "abc124")).toBe(false);
  });
});

describe("extractBearerToken", () => {
  it("extracts token from 'Bearer abc123'", () => {
    expect(extractBearerToken("Bearer abc123")).toBe("abc123");
  });

  it("is case-insensitive for Bearer prefix", () => {
    expect(extractBearerToken("bearer abc123")).toBe("abc123");
    expect(extractBearerToken("BEARER abc123")).toBe("abc123");
  });

  it("returns undefined for missing Bearer prefix", () => {
    expect(extractBearerToken("abc123")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(extractBearerToken("")).toBeUndefined();
  });

  it("returns undefined for undefined input", () => {
    expect(extractBearerToken(undefined)).toBeUndefined();
  });

  it("returns undefined when only 'Bearer ' with no token", () => {
    expect(extractBearerToken("Bearer ")).toBeUndefined();
  });

  it("trims extra whitespace after Bearer prefix", () => {
    expect(extractBearerToken("Bearer   abc123  ")).toBe("abc123");
  });

  it("returns undefined for 'BearerNoSpace'", () => {
    expect(extractBearerToken("BearerNoSpace")).toBeUndefined();
  });

  it("preserves token case", () => {
    expect(extractBearerToken("Bearer AbCdEf")).toBe("AbCdEf");
  });

  it("handles token with special characters", () => {
    expect(extractBearerToken("Bearer sk-ant_abc.123+xyz")).toBe("sk-ant_abc.123+xyz");
  });

  it("returns undefined for 'Basic abc123'", () => {
    expect(extractBearerToken("Basic abc123")).toBeUndefined();
  });

  it("handles mixed-case prefix 'BeArEr token'", () => {
    expect(extractBearerToken("BeArEr token")).toBe("token");
  });
});

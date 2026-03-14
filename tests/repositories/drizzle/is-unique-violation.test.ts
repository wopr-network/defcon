import { describe, it, expect } from "vitest";
import { isUniqueViolation } from "../../../src/repositories/drizzle/is-unique-violation.js";

describe("isUniqueViolation", () => {
  it("returns true for error with code 23505", () => {
    const err = new Error("duplicate key value violates unique constraint");
    (err as NodeJS.ErrnoException).code = "23505";
    expect(isUniqueViolation(err)).toBe(true);
  });

  it("returns false for error with different code", () => {
    const err = new Error("some other error");
    (err as NodeJS.ErrnoException).code = "42P01";
    expect(isUniqueViolation(err)).toBe(false);
  });

  it("returns false for error without code", () => {
    expect(isUniqueViolation(new Error("plain error"))).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isUniqueViolation("string")).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation(42)).toBe(false);
  });
});

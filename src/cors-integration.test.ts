import { describe, expect, it } from "vitest";
import { resolveCorsOrigin } from "./cors.js";

describe("CORS origin enforcement (integration)", () => {
  it("non-loopback host without env var throws actionable error", () => {
    expect(() => resolveCorsOrigin({ host: "0.0.0.0", corsEnv: undefined })).toThrow(/DEFCON_CORS_ORIGIN must be set/);
  });

  it("non-loopback host with env var succeeds", () => {
    const result = resolveCorsOrigin({ host: "0.0.0.0", corsEnv: "https://app.example.com" });
    expect(result.origin).toBe("https://app.example.com");
  });

  it("loopback host without env var returns null (default pattern)", () => {
    const result = resolveCorsOrigin({ host: "127.0.0.1", corsEnv: undefined });
    expect(result.origin).toBeNull();
  });

  it("error message mentions the bound host", () => {
    try {
      resolveCorsOrigin({ host: "10.0.0.5", corsEnv: undefined });
      expect.unreachable("should have thrown");
    } catch (e) {
      expect((e as Error).message).toContain("10.0.0.5");
    }
  });

  it("whitespace-only DEFCON_CORS_ORIGIN treated as unset", () => {
    expect(() => resolveCorsOrigin({ host: "0.0.0.0", corsEnv: "   " })).toThrow(/DEFCON_CORS_ORIGIN must be set/);
  });
});

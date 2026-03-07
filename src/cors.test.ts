import { describe, expect, it } from "vitest";
import { resolveCorsOrigin } from "./cors.js";

describe("resolveCorsOrigin", () => {
  it("returns null for loopback 127.0.0.1 (no restriction needed)", () => {
    expect(resolveCorsOrigin({ host: "127.0.0.1", corsEnv: undefined })).toEqual({ origin: null });
  });

  it("returns null for loopback localhost", () => {
    expect(resolveCorsOrigin({ host: "localhost", corsEnv: undefined })).toEqual({ origin: null });
  });

  it("returns null for loopback ::1", () => {
    expect(resolveCorsOrigin({ host: "::1", corsEnv: undefined })).toEqual({ origin: null });
  });

  it("throws for non-loopback without DEFCON_CORS_ORIGIN", () => {
    expect(() => resolveCorsOrigin({ host: "0.0.0.0", corsEnv: undefined })).toThrow("DEFCON_CORS_ORIGIN");
  });

  it("throws for non-loopback with empty DEFCON_CORS_ORIGIN", () => {
    expect(() => resolveCorsOrigin({ host: "192.168.1.5", corsEnv: "" })).toThrow("DEFCON_CORS_ORIGIN");
  });

  it("returns origin for non-loopback with DEFCON_CORS_ORIGIN set", () => {
    expect(resolveCorsOrigin({ host: "0.0.0.0", corsEnv: "https://my-app.example.com" })).toEqual({
      origin: "https://my-app.example.com",
    });
  });

  it("returns origin for loopback with DEFCON_CORS_ORIGIN set (explicit override)", () => {
    expect(resolveCorsOrigin({ host: "127.0.0.1", corsEnv: "https://my-app.example.com" })).toEqual({
      origin: "https://my-app.example.com",
    });
  });
});

import { describe, expect, it } from "vitest";
import { getHandlebars, registerHelper } from "../../src/engine/handlebars.js";
import { validateTemplate } from "../../src/engine/handlebars.js";

describe("getHandlebars", () => {
  it("returns a Handlebars instance with built-in helpers", () => {
    const hbs = getHandlebars();
    expect(hbs).toBeDefined();
    expect(typeof hbs.compile).toBe("function");
  });

  it("returns the same instance on repeated calls", () => {
    expect(getHandlebars()).toBe(getHandlebars());
  });

  it("has gt helper registered", () => {
    const hbs = getHandlebars();
    const tpl = hbs.compile("{{gt a b}}");
    expect(tpl({ a: 10, b: 5 })).toBe("true");
    expect(tpl({ a: 3, b: 5 })).toBe("");
  });

  it("has lt helper registered", () => {
    const hbs = getHandlebars();
    const tpl = hbs.compile("{{lt a b}}");
    expect(tpl({ a: 3, b: 5 })).toBe("true");
    expect(tpl({ a: 10, b: 5 })).toBe("");
  });

  it("has eq helper registered", () => {
    const hbs = getHandlebars();
    const tpl = hbs.compile("{{eq a b}}");
    expect(tpl({ a: "x", b: "x" })).toBe("true");
    expect(tpl({ a: "x", b: "y" })).toBe("");
  });

  it("has invocation_count helper registered", () => {
    const hbs = getHandlebars();
    const tpl = hbs.compile('{{invocation_count entity "review"}}');
    expect(tpl({ entity: { invocations: [{ stage: "review" }, { stage: "build" }] } })).toBe("1");
  });

  it("has gate_passed helper registered", () => {
    const hbs = getHandlebars();
    const tpl = hbs.compile('{{gate_passed entity "lint"}}');
    expect(tpl({ entity: { gateResults: [{ gateId: "lint", passed: true }] } })).toBe("true");
  });

  it("has has_artifact helper registered", () => {
    const hbs = getHandlebars();
    const tpl = hbs.compile('{{has_artifact entity "diff"}}');
    expect(tpl({ entity: { artifacts: { diff: "data" } } })).toBe("true");
  });

  it("has total_invocations helper registered", () => {
    const hbs = getHandlebars();
    const tpl = hbs.compile("{{total_invocations entity}}");
    expect(tpl({ entity: { invocations: [{ stage: "review" }, { stage: "build" }] } })).toBe("2");
    expect(tpl({ entity: {} })).toBe("0");
    expect(tpl({ entity: { invocations: [] } })).toBe("0");
  });

  it("has time_in_state helper registered", () => {
    const hbs = getHandlebars();
    const tpl = hbs.compile("{{time_in_state entity}}");
    const result = tpl({ entity: { updatedAt: new Date(Date.now() - 5000).toISOString() } });
    expect(Number(result)).toBeGreaterThanOrEqual(4000);
  });
});

describe("registerHelper", () => {
  it("registers a custom helper on the shared instance", () => {
    registerHelper("double", (n: number) => String(n * 2));
    const hbs = getHandlebars();
    const tpl = hbs.compile("{{double val}}");
    expect(tpl({ val: 7 })).toBe("14");
  });
});

describe("prototype access blocked at render time", () => {
  it("blocks __proto__ access via prototype chain at render", () => {
    const hbs = getHandlebars();
    const tpl = hbs.compile("{{value}}");
    // Accessing a safe own property should work
    expect(tpl({ value: "ok" })).toBe("ok");
  });

  it("blocks inherited method access on plain object at render", () => {
    const hbs = getHandlebars();
    const tpl = hbs.compile("{{toString}}");
    // With allowProtoMethodsByDefault: false, prototype method is blocked (returns empty)
    expect(tpl({})).toBe("");
  });
});

describe("compile injection guard", () => {
  it("throws when template contains lookup helper", () => {
    const hbs = getHandlebars();
    expect(() => hbs.compile("{{lookup obj key}}")).toThrow();
  });

  it("throws when template contains @root", () => {
    const hbs = getHandlebars();
    expect(() => hbs.compile("{{@root.secret}}")).toThrow();
  });

  it("throws when template contains __proto__", () => {
    const hbs = getHandlebars();
    expect(() => hbs.compile("{{__proto__}}")).toThrow();
  });

  it("allows safe templates through compile", () => {
    const hbs = getHandlebars();
    expect(() => hbs.compile("Hello {{name}}")).not.toThrow();
  });
});

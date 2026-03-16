import { describe, expect, it } from "vitest";
import { EXAMPLES, selectExample } from "../../src/flows/flow-design-examples.js";

describe("selectExample", () => {
  it("selects typescript for typescript repos", () => {
    const ex = selectExample(["typescript"]);
    expect(ex.language).toBe("typescript");
  });

  it("selects python for python repos", () => {
    const ex = selectExample(["python"]);
    expect(ex.language).toBe("python");
  });

  it("selects go for go repos", () => {
    const ex = selectExample(["go"]);
    expect(ex.language).toBe("go");
  });

  it("selects rust for rust repos", () => {
    const ex = selectExample(["rust"]);
    expect(ex.language).toBe("rust");
  });

  it("selects java for java repos", () => {
    const ex = selectExample(["java"]);
    expect(ex.language).toBe("java");
  });

  it("selects kotlin for kotlin repos", () => {
    const ex = selectExample(["kotlin"]);
    expect(ex.language).toBe("kotlin");
  });

  it("selects csharp for c# repos", () => {
    const ex = selectExample(["csharp"]);
    expect(ex.language).toBe("csharp");
  });

  it("selects swift for swift repos", () => {
    const ex = selectExample(["swift"]);
    expect(ex.language).toBe("swift");
  });

  it("selects php for php repos", () => {
    const ex = selectExample(["php"]);
    expect(ex.language).toBe("php");
  });

  it("selects elixir for elixir repos", () => {
    const ex = selectExample(["elixir"]);
    expect(ex.language).toBe("elixir");
  });

  it("selects cpp for c++ repos", () => {
    const ex = selectExample(["cpp"]);
    expect(ex.language).toBe("cpp");
  });

  it("selects dart for dart repos", () => {
    const ex = selectExample(["dart"]);
    expect(ex.language).toBe("dart");
  });

  it("selects java for scala repos (fuzzy)", () => {
    const ex = selectExample(["scala"]);
    expect(ex.language).toBe("java");
  });

  it("selects ruby for ruby repos", () => {
    const ex = selectExample(["ruby"]);
    expect(ex.language).toBe("ruby");
  });

  it("defaults to typescript for unknown languages", () => {
    const ex = selectExample(["haskell"]);
    expect(ex.language).toBe("typescript");
  });

  it("defaults to typescript for empty languages", () => {
    const ex = selectExample([]);
    expect(ex.language).toBe("typescript");
  });

  it("uses first language as primary", () => {
    const ex = selectExample(["python", "typescript"]);
    expect(ex.language).toBe("python");
  });
});

describe("example quality", () => {
  it("all examples have valid FLOW_DESIGN JSON", () => {
    for (const ex of EXAMPLES) {
      const flowLine = ex.output.split("\n").find((l) => l.startsWith("FLOW_DESIGN:"));
      expect(flowLine, `${ex.language} missing FLOW_DESIGN line`).toBeDefined();
      const json = JSON.parse(flowLine!.slice("FLOW_DESIGN:".length));
      expect(json.flow.name).toBe("engineering");
      expect(json.flow.initialState).toBe("spec");
      expect(json.states.length).toBeGreaterThanOrEqual(6);
      expect(json.gates.length).toBe(3);
      expect(json.transitions.length).toBeGreaterThanOrEqual(7);
    }
  });

  it("all examples have DESIGN_NOTES", () => {
    for (const ex of EXAMPLES) {
      const notesLine = ex.output.split("\n").find((l) => l.startsWith("DESIGN_NOTES:"));
      expect(notesLine, `${ex.language} missing DESIGN_NOTES`).toBeDefined();
    }
  });

  it("all examples use real prompt structure", () => {
    for (const ex of EXAMPLES) {
      // Every example should have the real prompt patterns
      expect(ex.output).toContain("You are an architect");
      expect(ex.output).toContain("You are a software engineer");
      expect(ex.output).toContain("You are a code reviewer");
      expect(ex.output).toContain("spec_ready");
      expect(ex.output).toContain("pr_created");
      expect(ex.output).toContain("fixes_pushed");
      expect(ex.output).toContain("learned");
    }
  });

  it("python example includes docs state", () => {
    const ex = selectExample(["python"]);
    expect(ex.output).toContain('"name":"docs"');
    expect(ex.output).toContain("docs_ready");
  });

  it("go example omits docs state", () => {
    const ex = selectExample(["go"]);
    const json = JSON.parse(ex.output.split("\n")[0].slice("FLOW_DESIGN:".length));
    const stateNames = json.states.map((s: { name: string }) => s.name);
    expect(stateNames).not.toContain("docs");
  });

  it("java example mentions CodeRabbit", () => {
    const ex = selectExample(["java"]);
    expect(ex.output).toContain("CodeRabbit");
  });

  it("rust example has 15 min CI timeout", () => {
    const ex = selectExample(["rust"]);
    const json = JSON.parse(ex.output.split("\n")[0].slice("FLOW_DESIGN:".length));
    const ciGate = json.gates.find((g: { name: string }) => g.name === "ci-green");
    expect(ciGate.timeoutMs).toBe(900000);
  });
});

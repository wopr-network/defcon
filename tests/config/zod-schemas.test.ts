import { describe, it, expect } from "vitest";
import {
  FlowDefinitionSchema,
  StateDefinitionSchema,
  GateDefinitionSchema,
  TransitionRuleSchema,
  IntegrationConfigSchema,
  SeedFileSchema,
} from "../../src/config/zod-schemas.js";

// ─── FlowDefinitionSchema ───

describe("FlowDefinitionSchema", () => {
  it("accepts a valid flow", () => {
    const result = FlowDefinitionSchema.safeParse({
      name: "pr-review",
      description: "PR review pipeline",
      initialState: "open",
      maxConcurrent: 5,
    });
    expect(result.success).toBe(true);
  });

  it("applies defaults for optional fields", () => {
    const result = FlowDefinitionSchema.parse({
      name: "pr-review",
      initialState: "open",
    });
    expect(result.maxConcurrent).toBe(0);
    expect(result.maxConcurrentPerRepo).toBe(0);
    expect(result.version).toBe(1);
  });

  it("rejects empty name", () => {
    const result = FlowDefinitionSchema.safeParse({
      name: "",
      initialState: "open",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing initialState", () => {
    const result = FlowDefinitionSchema.safeParse({
      name: "pr-review",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative maxConcurrent", () => {
    const result = FlowDefinitionSchema.safeParse({
      name: "pr-review",
      initialState: "open",
      maxConcurrent: -1,
    });
    expect(result.success).toBe(false);
  });
});

// ─── StateDefinitionSchema ───

describe("StateDefinitionSchema", () => {
  it("accepts a valid state", () => {
    const result = StateDefinitionSchema.safeParse({
      name: "open",
      flowName: "pr-review",
      agentRole: "reviewer",
      modelTier: "sonnet",
      mode: "active",
    });
    expect(result.success).toBe(true);
  });

  it("defaults mode to passive", () => {
    const result = StateDefinitionSchema.parse({
      name: "open",
      flowName: "pr-review",
    });
    expect(result.mode).toBe("passive");
  });

  it("rejects invalid mode", () => {
    const result = StateDefinitionSchema.safeParse({
      name: "open",
      flowName: "pr-review",
      mode: "turbo",
    });
    expect(result.success).toBe(false);
  });
});

// ─── GateDefinitionSchema ───

describe("GateDefinitionSchema", () => {
  it("accepts a command gate", () => {
    const result = GateDefinitionSchema.safeParse({
      name: "lint-check",
      type: "command",
      command: "pnpm lint",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a function gate", () => {
    const result = GateDefinitionSchema.safeParse({
      name: "custom-check",
      type: "function",
      functionRef: "validators.checkCoverage",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an api gate", () => {
    const result = GateDefinitionSchema.safeParse({
      name: "sonar-gate",
      type: "api",
      apiConfig: { url: "https://sonar.example.com/api/check", method: "POST" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects command gate without command field", () => {
    const result = GateDefinitionSchema.safeParse({
      name: "lint-check",
      type: "command",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown gate type", () => {
    const result = GateDefinitionSchema.safeParse({
      name: "x",
      type: "magic",
    });
    expect(result.success).toBe(false);
  });

  it("defaults timeoutMs to 30000", () => {
    const result = GateDefinitionSchema.parse({
      name: "lint-check",
      type: "command",
      command: "pnpm lint",
    });
    expect(result.timeoutMs).toBe(30000);
  });
});

// ─── TransitionRuleSchema ───

describe("TransitionRuleSchema", () => {
  it("accepts a valid transition", () => {
    const result = TransitionRuleSchema.safeParse({
      flowName: "pr-review",
      fromState: "open",
      toState: "reviewing",
      trigger: "claim",
    });
    expect(result.success).toBe(true);
  });

  it("defaults priority to 0", () => {
    const result = TransitionRuleSchema.parse({
      flowName: "pr-review",
      fromState: "open",
      toState: "reviewing",
      trigger: "claim",
    });
    expect(result.priority).toBe(0);
  });

  it("rejects missing trigger", () => {
    const result = TransitionRuleSchema.safeParse({
      flowName: "pr-review",
      fromState: "open",
      toState: "reviewing",
    });
    expect(result.success).toBe(false);
  });
});

// ─── IntegrationConfigSchema ───

describe("IntegrationConfigSchema", () => {
  it("accepts a valid integration", () => {
    const result = IntegrationConfigSchema.safeParse({
      capability: "notifications",
      adapter: "discord",
      config: { webhookUrl: "https://discord.com/api/webhooks/..." },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing adapter", () => {
    const result = IntegrationConfigSchema.safeParse({
      capability: "notifications",
    });
    expect(result.success).toBe(false);
  });
});

// ─── SeedFileSchema (cross-reference validation) ───

describe("SeedFileSchema", () => {
  const validSeed = {
    flows: [{ name: "pr-review", initialState: "open" }],
    states: [
      { name: "open", flowName: "pr-review" },
      { name: "reviewing", flowName: "pr-review" },
    ],
    gates: [{ name: "lint-pass", type: "command" as const, command: "pnpm lint" }],
    transitions: [
      {
        flowName: "pr-review",
        fromState: "open",
        toState: "reviewing",
        trigger: "claim",
        gateName: "lint-pass",
      },
    ],
  };

  it("accepts a valid seed file", () => {
    const result = SeedFileSchema.safeParse(validSeed);
    expect(result.success).toBe(true);
  });

  it("rejects state referencing unknown flow", () => {
    const seed = {
      ...validSeed,
      states: [
        ...validSeed.states,
        { name: "orphan", flowName: "nonexistent" },
      ],
    };
    const result = SeedFileSchema.safeParse(seed);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("nonexistent"))).toBe(true);
    }
  });

  it("rejects flow whose initialState is not a defined state", () => {
    const seed = {
      ...validSeed,
      flows: [{ name: "pr-review", initialState: "nonexistent" }],
    };
    const result = SeedFileSchema.safeParse(seed);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("initialState"))).toBe(true);
    }
  });

  it("rejects transition referencing unknown flow", () => {
    const seed = {
      ...validSeed,
      transitions: [
        { flowName: "nonexistent", fromState: "a", toState: "b", trigger: "go" },
      ],
    };
    const result = SeedFileSchema.safeParse(seed);
    expect(result.success).toBe(false);
  });

  it("rejects transition with fromState not in flow", () => {
    const seed = {
      ...validSeed,
      transitions: [
        {
          flowName: "pr-review",
          fromState: "nonexistent",
          toState: "reviewing",
          trigger: "go",
        },
      ],
    };
    const result = SeedFileSchema.safeParse(seed);
    expect(result.success).toBe(false);
  });

  it("rejects transition with toState not in flow", () => {
    const seed = {
      ...validSeed,
      transitions: [
        {
          flowName: "pr-review",
          fromState: "open",
          toState: "nonexistent",
          trigger: "go",
        },
      ],
    };
    const result = SeedFileSchema.safeParse(seed);
    expect(result.success).toBe(false);
  });

  it("rejects transition referencing unknown gate", () => {
    const seed = {
      ...validSeed,
      transitions: [
        {
          flowName: "pr-review",
          fromState: "open",
          toState: "reviewing",
          trigger: "go",
          gateName: "nonexistent-gate",
        },
      ],
    };
    const result = SeedFileSchema.safeParse(seed);
    expect(result.success).toBe(false);
  });

  it("rejects transition with spawnFlow referencing unknown flow", () => {
    const seed = {
      ...validSeed,
      transitions: [
        {
          flowName: "pr-review",
          fromState: "open",
          toState: "reviewing",
          trigger: "go",
          spawnFlow: "nonexistent-flow",
        },
      ],
    };
    const result = SeedFileSchema.safeParse(seed);
    expect(result.success).toBe(false);
  });

  it("defaults gates and integrations to empty arrays", () => {
    const seed = {
      flows: [{ name: "simple", initialState: "start" }],
      states: [{ name: "start", flowName: "simple" }],
      transitions: [
        { flowName: "simple", fromState: "start", toState: "start", trigger: "loop" },
      ],
    };
    const result = SeedFileSchema.safeParse(seed);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gates).toEqual([]);
      expect(result.data.integrations).toEqual([]);
    }
  });
});

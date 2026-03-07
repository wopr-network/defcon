import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Entity, Gate, IGateRepository } from "../repositories/interfaces.js";
import { validateGateCommand } from "./gate-command-validator.js";

export interface GateEvalResult {
  passed: boolean;
  output: string;
}

const PROJECT_ROOT = realpathSync(resolve(fileURLToPath(import.meta.url), "../../.."));

/**
 * Evaluate a gate against an entity. Records the result in gateRepo.
 * Supports "command", "function", and "api" gate types.
 */
export async function evaluateGate(gate: Gate, entity: Entity, gateRepo: IGateRepository): Promise<GateEvalResult> {
  let passed = false;
  let output = "";

  if (gate.type === "command") {
    if (!gate.command) {
      return { passed: false, output: "Gate command is not configured" };
    }
    // Defense-in-depth: validate command path even though schema should have caught it
    const validation = validateGateCommand(gate.command);
    if (!validation.valid) {
      const msg = `Gate command not allowed: ${validation.error}`;
      await gateRepo.record(entity.id, gate.id, false, msg);
      return { passed: false, output: msg };
    }
    const [, ...args] = gate.command.split(/\s+/);
    const resolvedPath = validation.resolvedPath ?? gate.command.split(/\s+/)[0];
    const result = await runCommand(resolvedPath, args, gate.timeoutMs);
    passed = result.exitCode === 0;
    output = result.output;
  } else if (gate.type === "function") {
    try {
      if (!gate.functionRef) {
        const result = { passed: false, output: "Gate functionRef is not configured" };
        await gateRepo.record(entity.id, gate.id, result.passed, result.output);
        return result;
      }
      const result = await runFunction(gate.functionRef, entity, gate);
      passed = result.passed;
      output = result.output;
    } catch (err) {
      passed = false;
      output = err instanceof Error ? err.message : String(err);
    }
  } else if (gate.type === "api") {
    if (!gate.apiConfig) {
      passed = false;
      output = "Gate apiConfig is not configured";
    } else {
      let url: string;
      try {
        const hbs = (await import("./handlebars.js")).getHandlebars();
        url = hbs.compile(gate.apiConfig.url as string)(entity);
      } catch (err) {
        passed = false;
        output = `Template error: ${err instanceof Error ? err.message : String(err)}`;
        await gateRepo.record(entity.id, gate.id, passed, output);
        return { passed, output };
      }
      if (!url.startsWith("https://")) {
        passed = false;
        output = `URL protocol not allowed: ${url.split("://")[0] ?? "unknown"}`;
        await gateRepo.record(entity.id, gate.id, passed, output);
        return { passed, output };
      }
      const method = (gate.apiConfig.method as string) ?? "GET";
      const expectStatus = (gate.apiConfig.expectStatus as number) ?? 200;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), gate.timeoutMs ?? 10000);
      try {
        const res = await fetch(url, { method, signal: controller.signal });
        passed = res.status === expectStatus;
        output = `HTTP ${res.status}`;
      } catch (err) {
        passed = false;
        output = err instanceof Error ? err.message : String(err);
      } finally {
        clearTimeout(timeout);
      }
    }
  } else {
    throw new Error(`Unknown gate type: ${gate.type}`);
  }

  await gateRepo.record(entity.id, gate.id, passed, output);
  return { passed, output };
}

async function runFunction(
  functionRef: string,
  entity: Entity,
  gate: Gate,
): Promise<{ passed: boolean; output: string }> {
  const lastColon = functionRef.lastIndexOf(":");
  if (lastColon === -1) {
    throw new Error(`Invalid functionRef "${functionRef}" — expected "path:exportName"`);
  }
  const modulePath = functionRef.slice(0, lastColon);
  const exportName = functionRef.slice(lastColon + 1);

  const absPath = resolve(PROJECT_ROOT, modulePath);
  let realPath: string;
  try {
    realPath = realpathSync(absPath);
  } catch {
    throw new Error(`Gate module not found: ${modulePath}`);
  }
  const rel = realPath.startsWith(PROJECT_ROOT + "/") || realPath === PROJECT_ROOT
    ? realPath.slice(PROJECT_ROOT.length)
    : null;
  if (rel === null) {
    throw new Error(`Gate module path traversal rejected: ${modulePath}`);
  }

  const { pathToFileURL } = await import("node:url");
  const moduleUrl = pathToFileURL(realPath).href;

  const mod = await import(moduleUrl);
  const fn = mod[exportName];
  if (typeof fn !== "function") {
    throw new Error(`Gate function "${exportName}" not found in ${modulePath}`);
  }

  const timeout = gate.timeoutMs ?? 30000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    Promise.resolve(fn(entity, gate)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Function gate timed out after ${timeout}ms`)), timeout);
    }),
  ]);
  clearTimeout(timer);

  return { passed: result.passed, output: result.output ?? "" };
}

function runCommand(file: string, args: string[], timeoutMs: number): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: timeoutMs }, (error, stdout, stderr) => {
      resolve({
        exitCode: error ? 1 : 0,
        output: (stdout + stderr).trim(),
      });
    });
  });
}

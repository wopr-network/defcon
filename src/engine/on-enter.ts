import { execFile } from "node:child_process";
import type { AdapterRegistry } from "../integrations/registry.js";
import type { PrimitiveOp } from "../integrations/types.js";
import type { Entity, Flow, IEntityRepository, OnEnterConfig } from "../repositories/interfaces.js";
import { getHandlebars } from "./handlebars.js";

export interface OnEnterResult {
  skipped: boolean;
  artifacts: Record<string, unknown> | null;
  error: string | null;
  timedOut: boolean;
}

export async function executeOnEnter(
  onEnter: OnEnterConfig,
  entity: Entity,
  entityRepo: IEntityRepository,
  flow?: Flow | null,
  adapterRegistry?: AdapterRegistry | null,
): Promise<OnEnterResult> {
  // Idempotency: skip if all named artifacts already present
  const existingArtifacts = entity.artifacts ?? {};
  const allPresent = onEnter.artifacts.every((key) => existingArtifacts[key] !== undefined);
  if (allPresent) {
    return { skipped: true, artifacts: null, error: null, timedOut: false };
  }

  // Primitive op path — no shell, runs through the adapter registry
  if (onEnter.op) {
    return executePrimitiveOnEnter(onEnter, entity, entityRepo, flow, adapterRegistry);
  }

  // Render command via Handlebars
  const hbs = getHandlebars();
  let renderedCommand: string;
  // Merge artifact refs into entity.refs so onEnter command templates like
  // {{entity.refs.github.repo}} resolve correctly for REST-created entities.
  const artifactRefs =
    entity.artifacts !== null &&
    typeof entity.artifacts === "object" &&
    "refs" in entity.artifacts &&
    entity.artifacts.refs !== null &&
    typeof entity.artifacts.refs === "object"
      ? (entity.artifacts.refs as Record<string, unknown>)
      : {};
  const entityForContext = { ...entity, refs: { ...artifactRefs, ...(entity.refs ?? {}) } };

  try {
    renderedCommand = hbs.compile(onEnter.command)({ entity: entityForContext });
  } catch (err) {
    const error = `onEnter template error: ${err instanceof Error ? err.message : String(err)}`;
    await entityRepo.updateArtifacts(entity.id, {
      onEnter_error: {
        command: onEnter.command,
        error,
        failedAt: new Date().toISOString(),
      },
    });
    return { skipped: false, artifacts: null, error, timedOut: false };
  }

  // Execute command
  const timeoutMs = onEnter.timeout_ms ?? 30000;
  const { exitCode, stdout, stderr, timedOut } = await runOnEnterCommand(renderedCommand, timeoutMs);

  if (timedOut) {
    const error = `onEnter command timed out after ${timeoutMs}ms`;
    await entityRepo.updateArtifacts(entity.id, {
      onEnter_error: {
        command: renderedCommand,
        error,
        stderr,
        failedAt: new Date().toISOString(),
      },
    });
    return { skipped: false, artifacts: null, error, timedOut: true };
  }

  if (exitCode !== 0) {
    const error = `onEnter command exited with code ${exitCode}: ${stderr || stdout}`;
    await entityRepo.updateArtifacts(entity.id, {
      onEnter_error: {
        command: renderedCommand,
        error,
        failedAt: new Date().toISOString(),
      },
    });
    return { skipped: false, artifacts: null, error, timedOut: false };
  }

  // Parse JSON stdout
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    const error = `onEnter stdout is not valid JSON: ${stdout.slice(0, 200)}`;
    await entityRepo.updateArtifacts(entity.id, {
      onEnter_error: {
        command: renderedCommand,
        error,
        failedAt: new Date().toISOString(),
      },
    });
    return { skipped: false, artifacts: null, error, timedOut: false };
  }

  // Extract named artifact keys
  const missingKeys = onEnter.artifacts.filter((key) => parsed[key] === undefined);
  if (missingKeys.length > 0) {
    const error = `onEnter stdout missing expected artifact keys: ${missingKeys.join(", ")}`;
    await entityRepo.updateArtifacts(entity.id, {
      onEnter_error: {
        command: renderedCommand,
        error,
        failedAt: new Date().toISOString(),
      },
    });
    return { skipped: false, artifacts: null, error, timedOut: false };
  }

  const mergedArtifacts: Record<string, unknown> = {};
  for (const key of onEnter.artifacts) {
    mergedArtifacts[key] = parsed[key];
  }

  // Merge into entity
  await entityRepo.updateArtifacts(entity.id, mergedArtifacts);

  return { skipped: false, artifacts: mergedArtifacts, error: null, timedOut: false };
}

async function executePrimitiveOnEnter(
  onEnter: OnEnterConfig,
  entity: Entity,
  entityRepo: IEntityRepository,
  flow?: Flow | null,
  adapterRegistry?: AdapterRegistry | null,
): Promise<OnEnterResult> {
  const op = onEnter.op as PrimitiveOp;

  if (!adapterRegistry) {
    const error = "AdapterRegistry not available for primitive onEnter op";
    await entityRepo.updateArtifacts(entity.id, { onEnter_error: { op, error } });
    return { skipped: false, artifacts: null, error, timedOut: false };
  }

  const opCategory = op.split(".")[0];
  const integrationId = opCategory === "issue_tracker" ? flow?.issueTrackerIntegrationId : flow?.vcsIntegrationId;

  if (!integrationId) {
    const error = `Flow has no ${opCategory} integration configured`;
    await entityRepo.updateArtifacts(entity.id, { onEnter_error: { op, error } });
    return { skipped: false, artifacts: null, error, timedOut: false };
  }

  // Render params via Handlebars
  const hbs = getHandlebars();
  const artifactRefs =
    entity.artifacts !== null &&
    typeof entity.artifacts === "object" &&
    "refs" in entity.artifacts &&
    entity.artifacts.refs !== null &&
    typeof entity.artifacts.refs === "object"
      ? (entity.artifacts.refs as Record<string, unknown>)
      : {};
  const entityForContext = { ...entity, refs: { ...artifactRefs, ...(entity.refs ?? {}) } };

  let renderedParams: Record<string, unknown>;
  try {
    const rawParams = onEnter.params ?? {};
    renderedParams = Object.fromEntries(
      Object.entries(rawParams).map(([k, v]) => [
        k,
        typeof v === "string" ? hbs.compile(v)({ entity: entityForContext }) : v,
      ]),
    );
  } catch (err) {
    const error = `Primitive onEnter template error: ${err instanceof Error ? err.message : String(err)}`;
    await entityRepo.updateArtifacts(entity.id, { onEnter_error: { op, error } });
    return { skipped: false, artifacts: null, error, timedOut: false };
  }

  let opResult: Record<string, unknown>;
  try {
    opResult = await adapterRegistry.execute(integrationId, op, renderedParams);
  } catch (err) {
    const error = `Primitive onEnter op failed: ${err instanceof Error ? err.message : String(err)}`;
    await entityRepo.updateArtifacts(entity.id, { onEnter_error: { op, error } });
    return { skipped: false, artifacts: null, error, timedOut: false };
  }

  // Extract named artifact keys
  const missingKeys = onEnter.artifacts.filter((key) => opResult[key] === undefined);
  if (missingKeys.length > 0) {
    const error = `Primitive onEnter op missing expected artifact keys: ${missingKeys.join(", ")}`;
    await entityRepo.updateArtifacts(entity.id, { onEnter_error: { op, error } });
    return { skipped: false, artifacts: null, error, timedOut: false };
  }

  const mergedArtifacts: Record<string, unknown> = {};
  for (const key of onEnter.artifacts) {
    mergedArtifacts[key] = opResult[key];
  }

  await entityRepo.updateArtifacts(entity.id, mergedArtifacts);
  return { skipped: false, artifacts: mergedArtifacts, error: null, timedOut: false };
}

function runOnEnterCommand(
  command: string,
  timeoutMs: number,
): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = execFile("/bin/sh", ["-c", command], { timeout: timeoutMs }, (error, stdout, stderr) => {
      const timedOut = error !== null && child.killed === true;
      resolve({
        exitCode: error ? ((error as NodeJS.ErrnoException & { code?: number }).code ?? 1) : 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        timedOut,
      });
    });
  });
}

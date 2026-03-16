/**
 * Runner-backed AdapterRegistry — delegates all primitive gate ops to the
 * holyshipper runner instead of resolving credentials and calling APIs locally.
 *
 * Drop-in replacement for AdapterRegistry. The gate evaluator calls
 * registry.execute(integrationId, op, params, signal) — this implementation
 * proxies to the runner's POST /gate endpoint. The cloud never touches
 * provider APIs or credentials for gate evaluation.
 */

import { logger } from "../logger.js";

/** Primitive op identifier, e.g. "vcs.ci_status". Matches integrations/types.ts when available. */
type PrimitiveOp = string;
/** Result from a primitive op. Matches integrations/types.ts when available. */
type PrimitiveOpResult = Record<string, unknown>;

export interface RunnerRegistryConfig {
  /** Resolve the runner URL for an entity. Called with the integration ID. */
  resolveRunnerUrl: (integrationId: string) => Promise<string | null>;
  /** HTTP request timeout in ms. Default 30s. */
  requestTimeoutMs?: number;
}

export class RunnerAdapterRegistry {
  private readonly resolveRunnerUrl: RunnerRegistryConfig["resolveRunnerUrl"];
  private readonly requestTimeoutMs: number;

  constructor(config: RunnerRegistryConfig) {
    this.resolveRunnerUrl = config.resolveRunnerUrl;
    this.requestTimeoutMs = config.requestTimeoutMs ?? 30_000;
  }

  async execute(
    integrationId: string,
    op: PrimitiveOp,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<PrimitiveOpResult> {
    const runnerUrl = await this.resolveRunnerUrl(integrationId);
    if (!runnerUrl) {
      return { outcome: "error", message: "No runner available" };
    }

    const gateId = `gate-${integrationId}-${Date.now()}`;
    const url = `${runnerUrl.replace(/\/$/, "")}/gate`;

    logger.info(`[runner-registry] delegating ${op} to runner`, {
      integrationId,
      op,
      runnerUrl,
      gateId,
    });

    const controller = new AbortController();
    // If caller provides a signal, forward abort (handle already-aborted case)
    if (signal) {
      if (signal.aborted) {
        controller.abort();
      } else {
        signal.addEventListener("abort", () => controller.abort(), { once: true });
      }
    }
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gateId,
          entityId: integrationId,
          op,
          params,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        logger.error(`[runner-registry] runner error`, { op, status: res.status, body: text.slice(0, 200) });
        return { outcome: "error", message: `Runner error: HTTP ${res.status}` };
      }

      const result = (await res.json()) as PrimitiveOpResult;
      logger.info(`[runner-registry] result`, { op, outcome: result.outcome });
      return result;
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      const message = isTimeout
        ? `Runner gate timed out after ${this.requestTimeoutMs}ms`
        : `Runner gate error: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(`[runner-registry] failed`, { op, error: message, isTimeout });
      return { outcome: isTimeout ? "timeout" : "error", message };
    } finally {
      clearTimeout(timer);
    }
  }
}

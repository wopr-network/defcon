/**
 * Crypto payment webhook route.
 * Thin wrapper — deps injected via setCryptoWebhookDeps during boot.
 */

import { createHmac } from "node:crypto";
import { Hono } from "hono";
import { logger } from "../logger.js";

// biome-ignore lint/suspicious/noExplicitAny: platform-core types injected at boot
let _deps: any;
let _webhookSecret: string | undefined;

export function setCryptoWebhookDeps(
  deps: { chargeStore: unknown; creditLedger: unknown; replayGuard: unknown },
  webhookSecret: string,
): void {
  _deps = deps;
  _webhookSecret = webhookSecret;
}

export const cryptoWebhookRoutes = new Hono();

cryptoWebhookRoutes.post("/", async (c) => {
  if (!_deps || !_webhookSecret) {
    return c.json({ error: "Crypto webhooks not configured" }, 503);
  }

  const body = await c.req.text();
  const sig = c.req.header("btcpay-sig") ?? "";
  const expected = `sha256=${createHmac("sha256", _webhookSecret).update(body).digest("hex")}`;
  if (sig !== expected) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const payload = JSON.parse(body) as Record<string, unknown>;
  logger.info("Crypto webhook received", JSON.stringify({ type: payload.type }));

  // Platform-core settler handles the actual crediting via watchers
  return c.json({ ok: true });
});

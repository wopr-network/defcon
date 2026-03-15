/**
 * Hono app for holyship.
 *
 * Static middleware (CORS, secure headers, BetterAuth) mounted here.
 * Dynamic routes (engine, ship-it, gateway) added during boot in index.ts.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { getConfig } from "./config.js";

export const app = new Hono();

// CORS
app.use(
  "/*",
  cors({
    origin: (origin) => {
      try {
        const allowed = getConfig()
          .UI_ORIGIN.split(",")
          .map((s) => s.trim());
        return allowed.includes(origin) ? origin : null;
      } catch {
        return origin === "http://localhost:3001" ? origin : null;
      }
    },
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization", "x-tenant-id"],
  }),
);
app.use("/*", secureHeaders());

// BetterAuth handler — /api/auth/* (signup, login, session, etc.)
// Lazily initialized to avoid DB access at import time.
app.on(["POST", "GET"], "/api/auth/*", async (c) => {
  const { getAuth } = await import("@wopr-network/platform-core/auth/better-auth");
  let req: Request;
  if (c.req.method === "POST") {
    const body = await c.req.arrayBuffer();
    req = new Request(c.req.url, {
      method: c.req.method,
      headers: c.req.raw.headers,
      body,
    });
  } else {
    req = c.req.raw;
  }
  return getAuth().handler(req);
});

// Health
app.get("/health", (c) => c.json({ status: "ok" }));

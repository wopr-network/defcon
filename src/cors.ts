const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export interface CorsOriginResult {
  /** Explicit allowed origin, or null meaning "loopback-only default pattern" */
  origin: string | null;
}

export function resolveCorsOrigin(opts: { host: string; corsEnv: string | undefined }): CorsOriginResult {
  const corsValue = opts.corsEnv?.trim() || undefined;
  const isLoopback = LOOPBACK_HOSTS.has(opts.host);

  // If explicit origin provided, always use it (even on loopback)
  if (corsValue) {
    return { origin: corsValue };
  }

  // Non-loopback without explicit origin — refuse to start
  if (!isLoopback) {
    throw new Error(
      `DEFCON_CORS_ORIGIN must be set when binding to non-loopback address "${opts.host}". ` +
        "Without an explicit CORS origin, any website on the network can make cross-origin requests to this server. " +
        'Set DEFCON_CORS_ORIGIN to the allowed origin (e.g. "https://my-app.example.com") or use a loopback address.',
    );
  }

  // Loopback without explicit origin — use default pattern
  return { origin: null };
}

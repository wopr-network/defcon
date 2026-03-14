/**
 * Detect Postgres unique-constraint violation (error code 23505).
 * Works with both node-postgres and PGlite drivers, including when
 * the DB error is wrapped in a Drizzle DrizzleQueryError (cause chain).
 */
export function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if ("code" in err && (err as NodeJS.ErrnoException).code === "23505") return true;
  if (err.cause != null) return isUniqueViolation(err.cause);
  return false;
}

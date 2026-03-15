/**
 * Root tRPC router for holyship.
 *
 * Composes platform-core procedures (billing, profile, settings, org)
 * with holyship-specific procedures (engine status, entity ops).
 */

import { publicProcedure, router } from "@wopr-network/platform-core/trpc";

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: "ok" })),
});

export type AppRouter = typeof appRouter;

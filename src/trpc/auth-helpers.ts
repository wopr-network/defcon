import { TRPCError } from "@trpc/server";
import type { IOrgMemberRepository } from "@wopr-network/platform-core/tenancy/org-member-repository";
import { logger } from "../logger.js";

let _orgMemberRepo: IOrgMemberRepository | null = null;

export function setAuthHelperOrgMemberRepo(repo: IOrgMemberRepository): void {
  _orgMemberRepo = repo;
}

/**
 * Assert the caller is an admin or owner of the tenant org.
 * For personal tenants (tenantId === userId), this is a no-op.
 * When org member repo is not wired (dev mode), logs a warning and skips.
 */
export async function assertOrgAdminOrOwner(tenantId: string, userId: string): Promise<void> {
  if (tenantId === userId) return;
  if (!_orgMemberRepo) {
    logger.warn("assertOrgAdminOrOwner: org member repo not wired, skipping role check");
    return;
  }
  const member = await _orgMemberRepo.findMember(tenantId, userId);
  if (!member || (member.role !== "owner" && member.role !== "admin")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Organization admin access required" });
  }
}

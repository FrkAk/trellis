import "server-only";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * Check whether the caller can administer their active team. Delegates
 * to Better Auth's `/organization/has-permission` API, which reads the
 * caller's role from `neon_auth.member` and consults the active access-
 * control policy. Returns `false` (never throws) so callers can collapse
 * the result into a typed `forbidden` failure.
 *
 * Probes `invitation:create` — both `owner` and `admin` hold this by
 * default; plain `member` does not. Compatible with the custom roles
 * configured via the organization plugin's `roles` option (MYMR-69) since
 * those preserve `invitation:create` in the admin/owner statements.
 *
 * @returns True when the caller may rotate / revoke invite codes.
 */
export async function isOrgAdmin(): Promise<boolean> {
  try {
    const reqHeaders = await headers();
    const result = await auth.api.hasPermission({
      headers: reqHeaders,
      body: { permissions: { invitation: ["create"] } },
    });
    return result.success === true;
  } catch {
    return false;
  }
}

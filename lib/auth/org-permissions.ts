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

/**
 * Check whether the caller is the owner of a specific team. Probes
 * `organization:delete`, which only the `owner` role holds in BA's default
 * ACL. Use for actions stricter than admin: deleting the team and
 * promoting another member to owner.
 *
 * BA's `hasPermission` looks up the caller's `member` row for the supplied
 * `organizationId` (defaulting to the session's `activeOrganizationId` if
 * omitted) and checks that role. Non-members surface as `false` because
 * BA throws `USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION`, which is caught
 * here. This means callers can safely pass an arbitrary `organizationId`
 * from a request body — the check is properly scoped to the target team
 * and not the caller's session active org.
 *
 * @param organizationId - Optional target team. Defaults to session active org.
 * @returns True when the caller is the owner of the target team.
 */
export async function isOrgOwner(organizationId?: string): Promise<boolean> {
  try {
    const reqHeaders = await headers();
    const result = await auth.api.hasPermission({
      headers: reqHeaders,
      body: {
        ...(organizationId !== undefined ? { organizationId } : {}),
        permissions: { organization: ["delete"] },
      },
    });
    return result.success === true;
  } catch {
    return false;
  }
}

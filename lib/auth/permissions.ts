import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

/**
 * Project-resource actions guarded by RBAC. `create`/`read`/`update` are
 * member-allowed; `delete`/`rename` require admin or owner. `rename` is
 * called out separately because it silently breaks external task refs in
 * PRs, docs, and commit messages — it deserves an explicit gate rather
 * than being folded into `delete`.
 */
const projectActions = ["create", "read", "update", "delete", "rename"] as const;
const memberProjectActions = ["create", "read", "update"] as const;

/**
 * Statement extending Better Auth's organization defaults with the
 * Mymir-specific `project` resource. Mirroring `defaultStatements` keeps
 * BA's built-in `organization`/`member`/`invitation`/`team`/`ac` policy
 * intact so team-management endpoints continue to enforce admin gating.
 */
export const statement = {
  ...defaultStatements,
  project: projectActions,
} as const;

export const ac = createAccessControl(statement);

export const owner = ac.newRole({
  ...ownerAc.statements,
  project: projectActions,
});

export const admin = ac.newRole({
  ...adminAc.statements,
  project: projectActions,
});

export const member = ac.newRole({
  ...memberAc.statements,
  project: memberProjectActions,
});

/** Lookup by BA role name. Used to evaluate comma-separated multi-role strings. */
const ROLES = { owner, admin, member } as const;

/** Action a caller can perform against the project resource. */
export type ProjectAction = (typeof projectActions)[number];

/**
 * Synchronous permission check against a Better Auth role string. BA stores
 * multi-role memberships as a comma-separated string in `member.role`, so
 * the input is split before evaluation; the caller passes if any sub-role
 * holds every requested action.
 *
 * Uses `Role.authorize()` (no DB hit) so callers can chain this onto an
 * existing JOIN that already loaded `member.role`.
 *
 * @param role - Raw `member.role` value (e.g. "admin" or "admin,member").
 * @param actions - Required project actions; AND-ed (default connector).
 * @returns True when at least one parsed sub-role grants every action.
 */
export function roleHasProjectPermission(
  role: string,
  actions: readonly ProjectAction[],
): boolean {
  const parts = role
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  for (const r of parts) {
    const def = ROLES[r as keyof typeof ROLES];
    if (!def) {
      console.warn(
        `[rbac] unknown role '${r}' in member.role; treating as no permissions. Add it to lib/auth/permissions.ts ROLES if intentional.`,
      );
      continue;
    }
    const result = def.authorize({ project: [...actions] });
    if (result.success) return true;
  }
  return false;
}

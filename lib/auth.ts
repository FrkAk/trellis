import { betterAuth } from "better-auth";
import { organization, jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { asc, eq } from "drizzle-orm";
import * as authSchema from "@/lib/db/auth-schema";
import { member } from "@/lib/db/auth-schema";
import { clearOrgMembershipArtifacts } from "@/lib/auth/membership-cleanup";
import { ac, owner, admin, member as memberRole } from "@/lib/auth/permissions";

/**
 * Auth DB connection. Uses the same DATABASE_URL as the app.
 * Table names are schema-qualified via pgSchema("neon_auth") in
 * auth-schema.ts, so no search_path override is needed.
 * This works correctly with Neon's connection pooler (PgBouncer).
 */
const authSql = postgres(process.env.DATABASE_URL!);
const authDb = drizzle(authSql, { schema: authSchema });

/**
 * Better Auth server instance.
 * Uses Neon Auth's existing schema (neon_auth) via drizzleAdapter.
 * Provides email/password auth and organization-based team management.
 */
export const auth = betterAuth({
  database: drizzleAdapter(authDb, {
    provider: "pg",
    schema: authSchema,
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: { enabled: true },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,      // 1 day
  },
  rateLimit: {
    enabled: true,
    window: 10,
    max: 100,
    storage: "memory",
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
    },
  },
  trustedOrigins: process.env.BETTER_AUTH_URL
    ? [process.env.BETTER_AUTH_URL]
    : [],
  advanced: {
    database: {
      generateId: false,
    },
    ipAddress: {
      ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for", "x-real-ip"],
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          if (session.activeOrganizationId) return { data: session };
          const [earliest] = await authDb
            .select({ organizationId: member.organizationId })
            .from(member)
            .where(eq(member.userId, session.userId))
            .orderBy(asc(member.createdAt))
            .limit(1);
          if (!earliest) return { data: session };
          return {
            data: { ...session, activeOrganizationId: earliest.organizationId },
          };
        },
      },
    },
  },
  // organization() must precede any future customSession() — see
  // better-auth issue #3233 (activeOrganizationId is type-erased otherwise).
  plugins: [
    jwt(),
    organization({
      ac,
      roles: { owner, admin, member: memberRole },
      organizationHooks: {
        afterRemoveMember: async ({ member: removed, organization: org }) => {
          await clearOrgMembershipArtifacts(removed.userId, org.id);
        },
        beforeDeleteOrganization: async ({ organization: org }) => {
          const rows = await authDb
            .select({ userId: member.userId })
            .from(member)
            .where(eq(member.organizationId, org.id));
          await Promise.all(
            rows.map((r) => clearOrgMembershipArtifacts(r.userId, org.id)),
          );
        },
      },
    }),
    oauthProvider({
      loginPage: "/sign-in",
      consentPage: "/consent",
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      validAudiences: process.env.BETTER_AUTH_URL
        ? [process.env.BETTER_AUTH_URL, `${process.env.BETTER_AUTH_URL}/api/mcp`]
        : ["http://localhost:3000", "http://localhost:3000/api/mcp"],
      // consentReferenceId runs at consent time with the authenticated session,
      // so it captures activeOrganizationId for clients registered via
      // unauthenticated DCR. clientReference (registration-time) does not work
      // here because Claude Code's DCR has no session.
      postLogin: {
        page: "/onboarding/team",
        consentReferenceId: ({ session }) =>
          (session?.activeOrganizationId as string | undefined) ?? undefined,
        shouldRedirect: () => false,
      },
      customAccessTokenClaims: ({ referenceId }) => ({
        active_org: referenceId ?? null,
      }),
      silenceWarnings: { oauthAuthServerConfig: true },
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;

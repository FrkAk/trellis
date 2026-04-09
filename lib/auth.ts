import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ac, owner, admin, member } from "@/lib/auth/permissions";
import * as authSchema from "@/lib/db/auth-schema";

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
  trustedOrigins: process.env.BETTER_AUTH_URL
    ? [process.env.BETTER_AUTH_URL]
    : [],
  advanced: {
    database: {
      generateId: false,
    },
  },
  plugins: [
    organization({
      ac,
      roles: { owner, admin, member },
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;

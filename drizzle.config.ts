import { readFileSync, existsSync } from "fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit doesn't auto-load .env.local — load it manually
const envPath = ".env.local";
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim();
    }
  }
}

// Migrations run as `service_role` (BYPASSRLS + CREATE on schema public +
// USAGE/CREATE on the pre-provisioned `drizzle` schema for migration
// tracking). `app_user` (the runtime DATABASE_URL role) has no CREATE
// privilege and MUST NEVER run migrations. Falls back to DATABASE_URL
// for legacy setups without DATABASE_SERVICE_ROLE_URL configured.
const migrationUrl =
  process.env.DATABASE_SERVICE_ROLE_URL ?? process.env.DATABASE_URL;

if (!migrationUrl) {
  throw new Error(
    "DATABASE_SERVICE_ROLE_URL (or DATABASE_URL) is required for drizzle-kit",
  );
}

export default defineConfig({
  out: "./drizzle",
  schema: ["./lib/db/schema.ts"],
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: {
    url: migrationUrl,
  },
});

-- Requires Neon pg_cron extension enabled in the project console. Apply manually after init-auth.sql.
-- Schedules a nightly janitor that purges revoked or expired OAuth refresh
-- tokens and expired access tokens. Belt-and-braces alongside the cascade
-- hooks in lib/auth.ts: tokens that survive a crashed hook still get
-- collected here. Idempotent — re-running re-schedules the same job.

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('purge-oauth-tokens')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-oauth-tokens');
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'purge-oauth-tokens',
  '0 3 * * *',
  $$
  DELETE FROM neon_auth."oauthRefreshToken"
   WHERE revoked IS NOT NULL OR "expiresAt" < now();
  DELETE FROM neon_auth."oauthAccessToken"
   WHERE "expiresAt" < now();
  $$
);

ALTER TABLE "projects" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
INSERT INTO "neon_auth"."organization" ("id", "name", "slug", "createdAt")
SELECT gen_random_uuid(), 'Mymir', 'mymir', now()
WHERE EXISTS (SELECT 1 FROM "projects")
  AND NOT EXISTS (SELECT 1 FROM "neon_auth"."organization" WHERE "slug" = 'mymir');--> statement-breakpoint
INSERT INTO "neon_auth"."member" ("organizationId", "userId", "role", "createdAt")
SELECT o."id", u."id", 'owner', now()
FROM "neon_auth"."user" u
CROSS JOIN "neon_auth"."organization" o
WHERE o."slug" = 'mymir'
  AND NOT EXISTS (
    SELECT 1 FROM "neon_auth"."member" m
    WHERE m."userId" = u."id" AND m."organizationId" = o."id"
  );--> statement-breakpoint
UPDATE "projects"
SET "organization_id" = (SELECT "id" FROM "neon_auth"."organization" WHERE "slug" = 'mymir')
WHERE "organization_id" IS NULL;--> statement-breakpoint
UPDATE "neon_auth"."session"
SET "activeOrganizationId" = (SELECT "id" FROM "neon_auth"."organization" WHERE "slug" = 'mymir')::text
WHERE "activeOrganizationId" IS NULL
  AND EXISTS (SELECT 1 FROM "neon_auth"."organization" WHERE "slug" = 'mymir');--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "neon_auth"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "projects_organization_id_idx" ON "projects" USING btree ("organization_id");

-- Announcements (SCRUM-51, US-31). Only new objects: a type, a table, its indexes and keys, a
-- unique index on roles(id, academy_id) that every existing row satisfies (id is already the
-- primary key), and two permission rows. No existing row is changed or removed.

-- CreateEnum
CREATE TYPE "announcement_audience" AS ENUM ('all', 'role', 'users');

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "academy_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" "announcement_audience" NOT NULL,
    "role_id" UUID,
    "role_academy_id" UUID,
    "recipient_count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcements_academy_id_created_at_idx" ON "announcements"("academy_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "announcements_id_academy_id_key" ON "announcements"("id", "academy_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_id_academy_id_key" ON "roles"("id", "academy_id");

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_sender_id_academy_id_fkey" FOREIGN KEY ("sender_id", "academy_id") REFERENCES "users"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_role_id_role_academy_id_fkey" FOREIGN KEY ("role_id", "role_academy_id") REFERENCES "roles"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Constraints Prisma cannot express.

-- A role announcement names its role; the other audiences name none.
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_role_audience_check"
  CHECK (("audience" = 'role') = ("role_id" IS NOT NULL));
-- The nullable reference keeps its mirror column: set together, and equal to academy_id.
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_role_academy_check"
  CHECK (("role_id" IS NULL AND "role_academy_id" IS NULL)
      OR ("role_id" IS NOT NULL AND "role_academy_id" = "academy_id"));
-- An announcement that reached nobody is never stored.
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_recipient_count_check"
  CHECK ("recipient_count" >= 1);
-- The same limits the API validates (ANNOUNCEMENT_TITLE_MAX and ANNOUNCEMENT_BODY_MAX).
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_title_check"
  CHECK (char_length("title") BETWEEN 1 AND 100);
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_body_check"
  CHECK (char_length("body") BETWEEN 1 AND 1000);

-- The permission to send announcements. It is in the original catalog and the seed grants it to
-- Admin, but the deploy never runs the seed, so it is also written here (like reports.read:any).
-- Running it twice changes nothing.
INSERT INTO "permissions" ("id", "key", "description", "created_at", "updated_at")
VALUES (gen_random_uuid(), 'announcements.send:any', 'Send announcements', now(), now())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."key" = 'announcements.send:any'
WHERE r."name" = 'Admin' AND r."is_system"
ON CONFLICT DO NOTHING;

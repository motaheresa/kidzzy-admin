-- Required student evaluations (SCRUM-87, US-42): the table, the academy setting (off by default),
-- a notification type and the three permissions. Production impact: SAFE (see the pull request).


-- CreateEnum
CREATE TYPE "evaluation_source" AS ENUM ('cycle_due', 'admin');

-- CreateEnum
CREATE TYPE "evaluation_status" AS ENUM ('pending', 'submitted', 'cancelled');

-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE 'evaluation_request';

-- AlterTable
ALTER TABLE "academies" ADD COLUMN     "evaluations_required" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "student_evaluations" (
    "id" UUID NOT NULL,
    "academy_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "instructor_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "cycle_id" UUID,
    "cycle_academy_id" UUID,
    "source" "evaluation_source" NOT NULL,
    "status" "evaluation_status" NOT NULL DEFAULT 'pending',
    "requested_by" UUID,
    "requested_by_academy_id" UUID,
    "requested_at" TIMESTAMPTZ(3) NOT NULL,
    "overall_rating" SMALLINT,
    "summary" TEXT,
    "strengths" TEXT,
    "to_improve" TEXT,
    "submitted_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "student_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_evaluations_instructor_id_status_idx" ON "student_evaluations"("instructor_id", "status");

-- CreateIndex
CREATE INDEX "student_evaluations_student_id_submitted_at_idx" ON "student_evaluations"("student_id", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "student_evaluations_id_academy_id_key" ON "student_evaluations"("id", "academy_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_evaluations_student_pending_key" ON "student_evaluations"("student_id") WHERE (status = 'pending');

-- AddForeignKey
ALTER TABLE "student_evaluations" ADD CONSTRAINT "student_evaluations_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_evaluations" ADD CONSTRAINT "student_evaluations_student_id_academy_id_fkey" FOREIGN KEY ("student_id", "academy_id") REFERENCES "students"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_evaluations" ADD CONSTRAINT "student_evaluations_instructor_id_academy_id_fkey" FOREIGN KEY ("instructor_id", "academy_id") REFERENCES "users"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_evaluations" ADD CONSTRAINT "student_evaluations_group_id_academy_id_fkey" FOREIGN KEY ("group_id", "academy_id") REFERENCES "groups"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_evaluations" ADD CONSTRAINT "student_evaluations_cycle_id_cycle_academy_id_fkey" FOREIGN KEY ("cycle_id", "cycle_academy_id") REFERENCES "payment_cycles"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_evaluations" ADD CONSTRAINT "student_evaluations_requested_by_requested_by_academy_id_fkey" FOREIGN KEY ("requested_by", "requested_by_academy_id") REFERENCES "users"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Custom SQL: check constraints, which Prisma cannot express (ADR-0002).
-- A submitted evaluation has its rating, its summary and its time; any other status has none of them.
ALTER TABLE "student_evaluations" ADD CONSTRAINT "student_evaluations_submitted_check"
  CHECK (("status" = 'submitted') = ("overall_rating" IS NOT NULL AND "summary" IS NOT NULL AND "submitted_at" IS NOT NULL));
-- A cancelled request has the time it was cancelled, and only a cancelled one does.
ALTER TABLE "student_evaluations" ADD CONSTRAINT "student_evaluations_cancelled_check"
  CHECK (("status" = 'cancelled') = ("cancelled_at" IS NOT NULL));
ALTER TABLE "student_evaluations" ADD CONSTRAINT "student_evaluations_rating_check"
  CHECK ("overall_rating" IS NULL OR "overall_rating" BETWEEN 1 AND 5);
-- The nullable references keep their mirror column: set together, and equal to academy_id.
ALTER TABLE "student_evaluations" ADD CONSTRAINT "student_evaluations_cycle_academy_check"
  CHECK (("cycle_id" IS NULL AND "cycle_academy_id" IS NULL)
      OR ("cycle_id" IS NOT NULL AND "cycle_academy_id" = "academy_id"));
ALTER TABLE "student_evaluations" ADD CONSTRAINT "student_evaluations_requested_by_academy_check"
  CHECK (("requested_by" IS NULL AND "requested_by_academy_id" IS NULL)
      OR ("requested_by" IS NOT NULL AND "requested_by_academy_id" = "academy_id"));
-- A cycle_due request names its cycle and no admin; an admin request names its admin and no cycle.
ALTER TABLE "student_evaluations" ADD CONSTRAINT "student_evaluations_source_check"
  CHECK (("source" = 'cycle_due' AND "cycle_id" IS NOT NULL AND "requested_by" IS NULL)
      OR ("source" = 'admin' AND "requested_by" IS NOT NULL AND "cycle_id" IS NULL));

-- The evaluation permissions (SCRUM-87, US-42). The deploy never runs the seed, so the keys and
-- their grants to every academy's system roles are written here, like reports.read:any. The
-- seed's catalog and SYSTEM_ROLE_PERMISSIONS hold the same keys, so a new academy gets them too.
-- Only new rows: nothing existing is changed or removed, and running it twice changes nothing.
INSERT INTO "permissions" ("id", "key", "description", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'evaluations.write:own', 'Write the evaluations asked of you', now(), now()),
  (gen_random_uuid(), 'evaluations.read:any', 'View student evaluations', now(), now()),
  (gen_random_uuid(), 'evaluations.manage:any', 'Request and cancel evaluations, and set the rule', now(), now())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."key" IN ('evaluations.read:any', 'evaluations.manage:any')
WHERE r."name" = 'Admin' AND r."is_system"
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."key" = 'evaluations.write:own'
WHERE r."name" = 'Instructor' AND r."is_system"
ON CONFLICT DO NOTHING;

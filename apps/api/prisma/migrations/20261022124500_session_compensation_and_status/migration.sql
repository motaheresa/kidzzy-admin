-- US-12 (SCRUM-24): the columns the session read model and the later write stories share.
-- A make-up points at the cancelled session it replaces (US-16). Who marked a session held or
-- cancelled, and when, is recorded (ERD) but not returned by the API.

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "compensates_academy_id" UUID,
ADD COLUMN     "compensates_session_id" UUID,
ADD COLUMN     "status_changed_at" TIMESTAMPTZ(3),
ADD COLUMN     "status_changed_by" UUID,
ADD COLUMN     "status_changed_by_academy_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "sessions_one_makeup_key" ON "sessions"("compensates_session_id") WHERE (compensates_session_id IS NOT NULL);

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_status_changed_by_status_changed_by_academy_id_fkey" FOREIGN KEY ("status_changed_by", "status_changed_by_academy_id") REFERENCES "users"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_compensates_session_id_compensates_academy_id_fkey" FOREIGN KEY ("compensates_session_id", "compensates_academy_id") REFERENCES "sessions"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Custom SQL: check constraints, which Prisma cannot express (ADR-0002).

-- Each optional composite foreign key is checked by Postgres only when BOTH columns are set.
-- So they are set together, and the mirror is always this session's academy (SCRUM-57).
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_compensates_academy_check"
  CHECK (("compensates_session_id" IS NULL) = ("compensates_academy_id" IS NULL)
    AND ("compensates_academy_id" IS NULL OR "compensates_academy_id" = "academy_id"));

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_status_changed_by_academy_check"
  CHECK (("status_changed_by" IS NULL) = ("status_changed_by_academy_id" IS NULL)
    AND ("status_changed_by_academy_id" IS NULL OR "status_changed_by_academy_id" = "academy_id"));

-- BR-04: only a make-up names the session it replaces, and it cannot replace itself.
-- Same group and "the target is cancelled" are enforced in the service (US-16).
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_compensates_check"
  CHECK ("compensates_session_id" IS NULL
    OR ("is_makeup" AND "id" <> "compensates_session_id"));

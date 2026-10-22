-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "compensates_academy_id" UUID,
ADD COLUMN     "compensates_session_id" UUID;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_compensates_session_id_compensates_academy_id_fkey" FOREIGN KEY ("compensates_session_id", "compensates_academy_id") REFERENCES "sessions"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- BR-04: a cancelled session has at most one make-up. Nulls compensate nothing.
CREATE UNIQUE INDEX "sessions_one_makeup_key" ON "sessions"("compensates_session_id") WHERE (compensates_session_id IS NOT NULL);

-- Custom SQL: check constraints, which Prisma cannot express (ADR-0002).

-- The optional composite foreign key is checked by Postgres only when BOTH columns are set.
-- So they are set together, and the mirror is always this session's academy (SCRUM-57).
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_compensates_academy_check"
  CHECK (("compensates_session_id" IS NULL) = ("compensates_academy_id" IS NULL)
    AND ("compensates_academy_id" IS NULL OR "compensates_academy_id" = "academy_id"));

-- Only a make-up names the session it replaces, and it cannot replace itself.
-- Same group and "the target is cancelled" are enforced in the service (US-16).
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_compensates_check"
  CHECK ("compensates_session_id" IS NULL
    OR ("is_makeup" AND "id" <> "compensates_session_id"));

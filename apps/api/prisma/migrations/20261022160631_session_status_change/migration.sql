-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "status_changed_at" TIMESTAMPTZ(3),
ADD COLUMN     "status_changed_by" UUID,
ADD COLUMN     "status_changed_by_academy_id" UUID;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_status_changed_by_status_changed_by_academy_id_fkey" FOREIGN KEY ("status_changed_by", "status_changed_by_academy_id") REFERENCES "users"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Custom SQL: a check constraint, which Prisma cannot express (ADR-0002).
-- The optional composite foreign key is checked by Postgres only when BOTH columns are set.
-- So they are set together, and the mirror is always this session's academy (SCRUM-57).
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_status_changed_by_academy_check"
  CHECK (("status_changed_by" IS NULL) = ("status_changed_by_academy_id" IS NULL)
    AND ("status_changed_by_academy_id" IS NULL OR "status_changed_by_academy_id" = "academy_id"));

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "actual_ended_at" TIMESTAMPTZ(3),
ADD COLUMN     "actual_started_at" TIMESTAMPTZ(3);

-- The actual start and end go together, and the end is after the start. Prisma cannot express a
-- check, so it lives here. Every row that exists has a null in both columns, so it satisfies it.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_actual_times_check"
  CHECK (
    ("actual_started_at" IS NULL AND "actual_ended_at" IS NULL)
    OR ("actual_started_at" IS NOT NULL AND "actual_ended_at" IS NOT NULL
        AND "actual_ended_at" > "actual_started_at")
  );

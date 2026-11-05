-- AlterTable
ALTER TABLE "attendance" ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "topic" TEXT;

-- A topic and a note are stored trimmed, and a blank one is stored as null. Same shape as
-- payments_note_check. Every row that exists has a null in both columns, so it satisfies them.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_topic_check"
  CHECK ("topic" IS NULL OR ("topic" = btrim("topic") AND btrim("topic") <> ''));

ALTER TABLE "attendance" ADD CONSTRAINT "attendance_note_check"
  CHECK ("note" IS NULL OR ("note" = btrim("note") AND btrim("note") <> ''));

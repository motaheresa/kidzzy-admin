-- US-11 (SCRUM-22): the sessions table, with composite foreign keys (SCRUM-57).
-- The two unique indexes need no WHERE: Postgres treats NULLs as distinct, so rows without a slot
-- or without a number never conflict, which is what a partial index would give.

-- CreateEnum
CREATE TYPE "session_status" AS ENUM ('scheduled', 'held', 'cancelled');

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "academy_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "instructor_id" UUID NOT NULL,
    "slot_id" UUID,
    "slot_academy_id" UUID,
    "occurrence_date" DATE,
    "scheduled_at" TIMESTAMPTZ(3) NOT NULL,
    "duration_min" SMALLINT NOT NULL,
    "status" "session_status" NOT NULL DEFAULT 'scheduled',
    "session_number" INTEGER,
    "is_makeup" BOOLEAN NOT NULL DEFAULT false,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sessions_group_id_scheduled_at_idx" ON "sessions"("group_id", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_slot_id_occurrence_date_key" ON "sessions"("slot_id", "occurrence_date");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_group_id_session_number_key" ON "sessions"("group_id", "session_number");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_id_academy_id_key" ON "sessions"("id", "academy_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_group_id_academy_id_fkey" FOREIGN KEY ("group_id", "academy_id") REFERENCES "groups"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_instructor_id_academy_id_fkey" FOREIGN KEY ("instructor_id", "academy_id") REFERENCES "users"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_slot_id_slot_academy_id_fkey" FOREIGN KEY ("slot_id", "slot_academy_id") REFERENCES "schedule_slots"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Custom SQL: check constraints, which Prisma cannot express (ADR-0002). They hold whoever writes
-- the row; the API writes the same forms, so it never trips them.

-- The optional composite foreign key (slot_id, slot_academy_id) is only checked by Postgres when
-- BOTH columns are set. So they are set together, and the mirror is always the session's own
-- academy: a session can never point at another academy's slot (SCRUM-57).
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_slot_academy_check"
  CHECK (("slot_id" IS NULL) = ("slot_academy_id" IS NULL)
    AND ("slot_academy_id" IS NULL OR "slot_academy_id" = "academy_id"));

-- A generated session knows which day of its slot it replaces; a make-up has no slot and no day.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_occurrence_check"
  CHECK (("slot_id" IS NULL) = ("occurrence_date" IS NULL));

-- BR-04: a make-up belongs to no slot.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_makeup_check"
  CHECK (NOT "is_makeup" OR "slot_id" IS NULL);

-- BR-03: only held sessions are numbered, and numbers start at 1.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_number_check"
  CHECK ("session_number" IS NULL OR ("status" = 'held' AND "session_number" >= 1));

-- A cancelled session always says why (the reason is optional otherwise).
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_cancel_reason_check"
  CHECK ("status" <> 'cancelled' OR ("cancel_reason" IS NOT NULL AND btrim("cancel_reason") <> ''));

-- Same bounds as schedule_slots.duration_min.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_duration_check"
  CHECK ("duration_min" BETWEEN 15 AND 240);

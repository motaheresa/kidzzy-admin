-- US-10 (SCRUM-26): a slot that sessions still point at is retired, not deleted, when the weekly
-- schedule changes. A retired slot stops generating and leaves the group's schedule; its Held and
-- Cancelled sessions keep their slot as history. NULL means the slot is in use.

-- AlterTable
ALTER TABLE "schedule_slots" ADD COLUMN     "retired_at" TIMESTAMPTZ(3);

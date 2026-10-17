-- US-07 (SCRUM-20): groups and their weekly schedule slots, with composite foreign keys (SCRUM-57).
-- users gets unique (id, academy_id) so groups can reference (instructor_id, academy_id).

-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL,
    "academy_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "search_text" TEXT NOT NULL,
    "instructor_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_slots" (
    "id" UUID NOT NULL,
    "academy_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "start_time" TIME(0) NOT NULL,
    "duration_min" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "schedule_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "groups_academy_id_instructor_id_idx" ON "groups"("academy_id", "instructor_id");

-- CreateIndex
CREATE UNIQUE INDEX "groups_id_academy_id_key" ON "groups"("id", "academy_id");

-- CreateIndex
CREATE INDEX "schedule_slots_group_id_idx" ON "schedule_slots"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_slots_id_academy_id_key" ON "schedule_slots"("id", "academy_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_id_academy_id_key" ON "users"("id", "academy_id");

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_instructor_id_academy_id_fkey" FOREIGN KEY ("instructor_id", "academy_id") REFERENCES "users"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_group_id_academy_id_fkey" FOREIGN KEY ("group_id", "academy_id") REFERENCES "groups"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Custom SQL: check constraints, which Prisma cannot express (ADR-0002). They hold whoever
-- writes the row; GroupRepository writes the same forms, so the API never trips them.

-- Names and levels are never blank (the API trims them first).
ALTER TABLE "groups" ADD CONSTRAINT "groups_names_not_blank_check"
  CHECK (btrim("name") <> '' AND btrim("level") <> '');

-- weekday: 0 = Sunday ... 6 = Saturday (ERD).
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_weekday_check"
  CHECK ("weekday" BETWEEN 0 AND 6);

-- A session lasts from 15 minutes (openapi.yaml: ScheduleSlot.durationMin minimum) to 4 hours.
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_duration_check"
  CHECK ("duration_min" BETWEEN 15 AND 240);

-- A slot ends by midnight, so one slot never spills into the next weekday.
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_within_day_check"
  CHECK (extract(epoch FROM "start_time") / 60 + "duration_min" <= 1440);
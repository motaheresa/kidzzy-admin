-- US-08 (SCRUM-21): enrollments, payment plan versions and payment cycles, with composite foreign
-- keys (SCRUM-57). The references that may be null (a plan or a cycle is for a student OR an
-- instructor) go through mirror columns, like sessions.slot_id. The partial unique indexes come
-- from schema.prisma (previewFeatures "partialIndexes"), so they are not drift.

-- CreateEnum
CREATE TYPE "payee_type" AS ENUM ('student', 'instructor');

-- CreateEnum
CREATE TYPE "cycle_status" AS ENUM ('in_progress', 'due', 'paid');

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "academy_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_plans" (
    "id" UUID NOT NULL,
    "academy_id" UUID NOT NULL,
    "payee_type" "payee_type" NOT NULL,
    "student_id" UUID,
    "student_academy_id" UUID,
    "instructor_id" UUID,
    "instructor_academy_id" UUID,
    "version" INTEGER NOT NULL,
    "sessions_per_cycle" SMALLINT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "effective_from_cycle" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_cycles" (
    "id" UUID NOT NULL,
    "academy_id" UUID NOT NULL,
    "payee_type" "payee_type" NOT NULL,
    "student_id" UUID,
    "student_academy_id" UUID,
    "instructor_id" UUID,
    "instructor_academy_id" UUID,
    "plan_id" UUID NOT NULL,
    "sessions_per_cycle" SMALLINT NOT NULL,
    "cycle_number" INTEGER NOT NULL,
    "opening_count" SMALLINT NOT NULL DEFAULT 0,
    "sessions_counted" SMALLINT NOT NULL,
    "status" "cycle_status" NOT NULL DEFAULT 'in_progress',
    "due_at" TIMESTAMPTZ(3),
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "enrollments_student_id_start_date_idx" ON "enrollments"("student_id", "start_date");

-- CreateIndex
CREATE INDEX "enrollments_group_id_idx" ON "enrollments"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_id_academy_id_key" ON "enrollments"("id", "academy_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_student_open_key" ON "enrollments"("student_id") WHERE (end_date IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "payment_plans_id_academy_id_key" ON "payment_plans"("id", "academy_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_plans_id_academy_id_sessions_per_cycle_key" ON "payment_plans"("id", "academy_id", "sessions_per_cycle");

-- CreateIndex
CREATE UNIQUE INDEX "payment_plans_student_id_version_key" ON "payment_plans"("student_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "payment_plans_instructor_id_version_key" ON "payment_plans"("instructor_id", "version");

-- CreateIndex
CREATE INDEX "payment_cycles_plan_id_idx" ON "payment_cycles"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_cycles_id_academy_id_key" ON "payment_cycles"("id", "academy_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_cycles_student_id_cycle_number_key" ON "payment_cycles"("student_id", "cycle_number");

-- CreateIndex
CREATE UNIQUE INDEX "payment_cycles_instructor_id_cycle_number_key" ON "payment_cycles"("instructor_id", "cycle_number");

-- CreateIndex
CREATE UNIQUE INDEX "payment_cycles_student_open_key" ON "payment_cycles"("student_id") WHERE (status = 'in_progress');

-- CreateIndex
CREATE UNIQUE INDEX "payment_cycles_instructor_open_key" ON "payment_cycles"("instructor_id") WHERE (status = 'in_progress');

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_academy_id_fkey" FOREIGN KEY ("student_id", "academy_id") REFERENCES "students"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_group_id_academy_id_fkey" FOREIGN KEY ("group_id", "academy_id") REFERENCES "groups"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_student_id_student_academy_id_fkey" FOREIGN KEY ("student_id", "student_academy_id") REFERENCES "students"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_instructor_id_instructor_academy_id_fkey" FOREIGN KEY ("instructor_id", "instructor_academy_id") REFERENCES "users"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_cycles" ADD CONSTRAINT "payment_cycles_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_cycles" ADD CONSTRAINT "payment_cycles_student_id_student_academy_id_fkey" FOREIGN KEY ("student_id", "student_academy_id") REFERENCES "students"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_cycles" ADD CONSTRAINT "payment_cycles_instructor_id_instructor_academy_id_fkey" FOREIGN KEY ("instructor_id", "instructor_academy_id") REFERENCES "users"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_cycles" ADD CONSTRAINT "payment_cycles_plan_id_academy_id_sessions_per_cycle_fkey" FOREIGN KEY ("plan_id", "academy_id", "sessions_per_cycle") REFERENCES "payment_plans"("id", "academy_id", "sessions_per_cycle") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Custom SQL: check constraints, which Prisma cannot express (ADR-0002). They hold whoever writes
-- the row; the API writes the same forms, so it never trips them.

-- Leaving on day D sets end_date = D - 1 (the days are start_date..end_date, both included), so
-- leaving on the first day gives an enrollment that covered no day: end_date = start_date - 1.
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_dates_check"
  CHECK ("end_date" IS NULL OR "end_date" >= "start_date" - 1);

-- Exactly the payee column of payee_type is set, with its mirror equal to the row's academy.
-- The optional composite foreign keys are only checked when both of their columns are set.
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_payee_check"
  CHECK (
    ("payee_type" = 'student'
      AND "student_id" IS NOT NULL AND "student_academy_id" = "academy_id"
      AND "instructor_id" IS NULL AND "instructor_academy_id" IS NULL)
    OR ("payee_type" = 'instructor'
      AND "instructor_id" IS NOT NULL AND "instructor_academy_id" = "academy_id"
      AND "student_id" IS NULL AND "student_academy_id" IS NULL));

ALTER TABLE "payment_cycles" ADD CONSTRAINT "payment_cycles_payee_check"
  CHECK (
    ("payee_type" = 'student'
      AND "student_id" IS NOT NULL AND "student_academy_id" = "academy_id"
      AND "instructor_id" IS NULL AND "instructor_academy_id" IS NULL)
    OR ("payee_type" = 'instructor'
      AND "instructor_id" IS NOT NULL AND "instructor_academy_id" = "academy_id"
      AND "student_id" IS NULL AND "student_academy_id" IS NULL));

-- A plan: N from 1 to 100, a positive amount, and version 1 applies from cycle 1 (BR-10).
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_values_check"
  CHECK ("sessions_per_cycle" BETWEEN 1 AND 100
    AND "amount" > 0
    AND "version" >= 1
    AND "effective_from_cycle" >= 1
    AND ("version" > 1 OR "effective_from_cycle" = 1));

-- A cycle's counters (BR-14, AC-10): the starting point is 0..N-1 and only on cycle 1; the
-- counter starts there and never passes N.
ALTER TABLE "payment_cycles" ADD CONSTRAINT "payment_cycles_counts_check"
  CHECK ("cycle_number" >= 1
    AND "opening_count" >= 0 AND "opening_count" < "sessions_per_cycle"
    AND ("cycle_number" = 1 OR "opening_count" = 0)
    AND "sessions_counted" BETWEEN "opening_count" AND "sessions_per_cycle");

-- BR-08: a cycle is in progress exactly while it has fewer than N sessions; due_at is set when it
-- becomes due, and paid_at only on a paid cycle.
ALTER TABLE "payment_cycles" ADD CONSTRAINT "payment_cycles_status_check"
  CHECK ((("status" = 'in_progress') = ("sessions_counted" < "sessions_per_cycle"))
    AND (("status" = 'in_progress') = ("due_at" IS NULL))
    AND (("status" = 'paid') = ("paid_at" IS NOT NULL)));

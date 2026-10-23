/*
  Warnings:

  - A unique constraint covering the columns `[instructor_id,group_id,cycle_number]` on the table `payment_cycles` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[instructor_id,group_id]` on the table `payment_cycles` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[instructor_id,group_id,version]` on the table `payment_plans` will be added. If there are existing duplicate values, this will fail.

*/
-- Guard (ADR-0015): an instructor is now paid per group, so every instructor plan and cycle
-- needs a group, and an existing one cannot be given one by guessing. Production only holds
-- test data here. This fails clearly, before anything is changed, while any instructor plan or
-- cycle exists. Delete them first: cycle_sessions of the instructor cycles, then the instructor
-- cycles, then the instructor plans (in a transaction, counting first).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "payment_plans" WHERE "payee_type" = 'instructor')
    OR EXISTS (SELECT 1 FROM "payment_cycles" WHERE "payee_type" = 'instructor') THEN
    RAISE EXCEPTION 'delete instructor plans and cycles first';
  END IF;
END
$$;

-- DropIndex
DROP INDEX "payment_cycles_instructor_id_cycle_number_key";

-- DropIndex
DROP INDEX "payment_cycles_instructor_open_key";

-- DropIndex
DROP INDEX "payment_plans_instructor_id_version_key";

-- AlterTable
ALTER TABLE "payment_cycles" ADD COLUMN     "group_academy_id" UUID,
ADD COLUMN     "group_id" UUID;

-- AlterTable
ALTER TABLE "payment_plans" ADD COLUMN     "group_academy_id" UUID,
ADD COLUMN     "group_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "payment_cycles_instructor_id_group_id_cycle_number_key" ON "payment_cycles"("instructor_id", "group_id", "cycle_number");

-- CreateIndex
CREATE UNIQUE INDEX "payment_cycles_instructor_open_key" ON "payment_cycles"("instructor_id", "group_id") WHERE (status = 'in_progress');

-- CreateIndex
CREATE UNIQUE INDEX "payment_plans_instructor_id_group_id_version_key" ON "payment_plans"("instructor_id", "group_id", "version");

-- AddForeignKey
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_group_id_group_academy_id_fkey" FOREIGN KEY ("group_id", "group_academy_id") REFERENCES "groups"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_cycles" ADD CONSTRAINT "payment_cycles_group_id_group_academy_id_fkey" FOREIGN KEY ("group_id", "group_academy_id") REFERENCES "groups"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Custom SQL: check constraints, which Prisma cannot express (ADR-0002).
-- The group is set exactly for an instructor's plan or cycle (never for a student's), and its
-- mirror column is set together with it and equals the row's academy, like slot_academy_id: the
-- optional composite foreign key is checked by Postgres only when both columns are set (SCRUM-57).
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_group_check"
  CHECK (("payee_type" = 'instructor') = ("group_id" IS NOT NULL)
    AND ("group_id" IS NULL) = ("group_academy_id" IS NULL)
    AND ("group_academy_id" IS NULL OR "group_academy_id" = "academy_id"));

ALTER TABLE "payment_cycles" ADD CONSTRAINT "payment_cycles_group_check"
  CHECK (("payee_type" = 'instructor') = ("group_id" IS NOT NULL)
    AND ("group_id" IS NULL) = ("group_academy_id" IS NULL)
    AND ("group_academy_id" IS NULL OR "group_academy_id" = "academy_id"));

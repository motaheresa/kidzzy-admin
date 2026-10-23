-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('present', 'absent');

-- CreateTable
CREATE TABLE "attendance" (
    "id" UUID NOT NULL,
    "academy_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "performance_rating" SMALLINT,
    "homework_rating" SMALLINT,
    "recorded_by" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_student_id_idx" ON "attendance"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_id_academy_id_key" ON "attendance"("id", "academy_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_session_id_student_id_key" ON "attendance"("session_id", "student_id");

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_session_id_academy_id_fkey" FOREIGN KEY ("session_id", "academy_id") REFERENCES "sessions"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_student_id_academy_id_fkey" FOREIGN KEY ("student_id", "academy_id") REFERENCES "students"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_recorded_by_academy_id_fkey" FOREIGN KEY ("recorded_by", "academy_id") REFERENCES "users"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Custom SQL: check constraints, which Prisma cannot express (ADR-0002).
-- A rating is 1 to 5, or null. homework_rating null means there was no homework.
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_ratings_range_check"
  CHECK (("performance_rating" IS NULL OR "performance_rating" BETWEEN 1 AND 5)
    AND ("homework_rating" IS NULL OR "homework_rating" BETWEEN 1 AND 5));

-- An absent student cannot be rated.
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_absent_unrated_check"
  CHECK ("status" <> 'absent' OR ("performance_rating" IS NULL AND "homework_rating" IS NULL));

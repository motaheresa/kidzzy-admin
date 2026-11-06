-- CreateEnum
CREATE TYPE "session_report_kind" AS ENUM ('held', 'cancelled', 'unmarked');

-- CreateTable
CREATE TABLE "session_reports" (
    "id" UUID NOT NULL,
    "academy_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "kind" "session_report_kind" NOT NULL,
    "sent_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "session_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "session_reports_id_academy_id_key" ON "session_reports"("id", "academy_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_reports_session_id_kind_key" ON "session_reports"("session_id", "kind");

-- AddForeignKey
ALTER TABLE "session_reports" ADD CONSTRAINT "session_reports_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_reports" ADD CONSTRAINT "session_reports_session_id_academy_id_fkey" FOREIGN KEY ("session_id", "academy_id") REFERENCES "sessions"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

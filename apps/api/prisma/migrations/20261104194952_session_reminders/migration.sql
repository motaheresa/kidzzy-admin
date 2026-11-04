-- CreateTable
CREATE TABLE "session_reminders" (
    "id" UUID NOT NULL,
    "academy_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "lead_minutes" SMALLINT NOT NULL,
    "instructor_id" UUID NOT NULL,
    "sent_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "session_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "session_reminders_id_academy_id_key" ON "session_reminders"("id", "academy_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_reminders_session_id_lead_minutes_key" ON "session_reminders"("session_id", "lead_minutes");

-- CreateIndex
CREATE INDEX "sessions_academy_id_status_scheduled_at_idx" ON "sessions"("academy_id", "status", "scheduled_at");

-- AddForeignKey
ALTER TABLE "session_reminders" ADD CONSTRAINT "session_reminders_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_reminders" ADD CONSTRAINT "session_reminders_session_id_academy_id_fkey" FOREIGN KEY ("session_id", "academy_id") REFERENCES "sessions"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_reminders" ADD CONSTRAINT "session_reminders_instructor_id_academy_id_fkey" FOREIGN KEY ("instructor_id", "academy_id") REFERENCES "users"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

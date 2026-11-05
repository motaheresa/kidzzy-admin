-- CreateTable
CREATE TABLE "payment_reminders" (
    "id" UUID NOT NULL,
    "academy_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "sessions_left" SMALLINT NOT NULL,
    "sent_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_reminders_id_academy_id_key" ON "payment_reminders"("id", "academy_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_reminders_cycle_id_sessions_left_key" ON "payment_reminders"("cycle_id", "sessions_left");

-- AddForeignKey
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_cycle_id_academy_id_fkey" FOREIGN KEY ("cycle_id", "academy_id") REFERENCES "payment_cycles"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- sessions_left is 0 for Due. Any later lead (SCRUM-47) stays allowed; only a negative is refused.
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_sessions_left_check" CHECK ("sessions_left" >= 0);

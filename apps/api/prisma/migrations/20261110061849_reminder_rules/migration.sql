-- CreateEnum
CREATE TYPE "reminder_rule_type" AS ENUM ('session_reminder', 'student_payment', 'instructor_payment');

-- CreateTable
CREATE TABLE "reminder_rules" (
    "id" UUID NOT NULL,
    "academy_id" UUID NOT NULL,
    "type" "reminder_rule_type" NOT NULL,
    "lead_minutes" SMALLINT,
    "sessions_before_end" SMALLINT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reminder_rules_id_academy_id_key" ON "reminder_rules"("id", "academy_id");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_rules_academy_id_type_lead_minutes_key" ON "reminder_rules"("academy_id", "type", "lead_minutes");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_rules_academy_id_type_sessions_before_end_key" ON "reminder_rules"("academy_id", "type", "sessions_before_end");

-- AddForeignKey
ALTER TABLE "reminder_rules" ADD CONSTRAINT "reminder_rules_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A session rule has a lead and no session count; a payment rule has the reverse. Prisma cannot
-- express a check, so it lives here. Both values are positive. The same value twice in a type is
-- refused by the two unique indexes above: the check keeps one of the two columns null, and a
-- null never conflicts. The ranges (30..10080, 1..20) are enforced by the API, not here, so they
-- can change without a migration.
ALTER TABLE "reminder_rules" ADD CONSTRAINT "reminder_rules_fields_check" CHECK (
    (
        "type" = 'session_reminder'
        AND "lead_minutes" IS NOT NULL AND "lead_minutes" > 0
        AND "sessions_before_end" IS NULL
    )
    OR (
        "type" IN ('student_payment', 'instructor_payment')
        AND "sessions_before_end" IS NOT NULL AND "sessions_before_end" > 0
        AND "lead_minutes" IS NULL
    )
);

-- The rules every academy starts with: exactly what was hardcoded before this change (session
-- reminders one day and one hour before; payment reminders at 2 and 1 sessions left, for
-- students and for instructors), so what is sent does not change. Rows are inserted only into
-- the new table, for each academy that exists now.
INSERT INTO "reminder_rules" ("id", "academy_id", "type", "lead_minutes", "sessions_before_end")
SELECT gen_random_uuid(), a."id", d."type"::"reminder_rule_type", d."lead_minutes", d."sessions_before_end"
FROM "academies" a
CROSS JOIN (
    VALUES
        ('session_reminder', 1440, NULL::int),
        ('session_reminder', 60, NULL::int),
        ('student_payment', NULL::int, 2),
        ('student_payment', NULL::int, 1),
        ('instructor_payment', NULL::int, 2),
        ('instructor_payment', NULL::int, 1)
) AS d("type", "lead_minutes", "sessions_before_end");

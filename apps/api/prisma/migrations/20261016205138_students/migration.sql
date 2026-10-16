-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "academy_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" SMALLINT,
    "parent_name" TEXT NOT NULL,
    "parent_phone" TEXT NOT NULL,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "students_academy_id_code_key" ON "students"("academy_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "students_id_academy_id_key" ON "students"("id", "academy_id");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Custom SQL: check constraints, which Prisma cannot express (ADR-0002). They hold whoever
-- writes the row; StudentRepository writes the same forms, so the API never trips them.

-- The code is stored trimmed and uppercase, so "kc-001" and "KC-001 " are the same code and the
-- unique (academy_id, code) index catches the duplicate.
ALTER TABLE "students" ADD CONSTRAINT "students_code_normalized_check"
  CHECK ("code" = upper(btrim("code")) AND "code" <> '');

-- The parent's phone in the normalized form, the same rule as users_phone_format_check
-- (normalizePhone in apps/api/src/common/normalize/login-identifiers.ts).
ALTER TABLE "students" ADD CONSTRAINT "students_parent_phone_format_check"
  CHECK ("parent_phone" ~ '^\+?[0-9]{6,20}$');

-- Ages 3 to 25 (openapi.yaml: StudentCreate.age); null when unknown.
ALTER TABLE "students" ADD CONSTRAINT "students_age_range_check"
  CHECK ("age" IS NULL OR "age" BETWEEN 3 AND 25);

ALTER TABLE "students" ADD CONSTRAINT "students_name_not_blank_check"
  CHECK (btrim("name") <> '' AND btrim("parent_name") <> '');

-- Custom SQL only (no schema.prisma change): Prisma cannot express check constraints (ADR-0002).
-- Stores email and phone in the one form the login compares (SCRUM-56). The rules match
-- normalizeEmail and normalizePhone in apps/api/src/common/normalize/login-identifiers.ts.

-- 1. Normalize existing rows.
--    email: trimmed and lowercase.
UPDATE "users" SET "email" = lower(btrim("email")) WHERE "email" IS NOT NULL;

--    phone: digits only, keeping a leading "+" ("010 1234-5678" -> "01012345678").
UPDATE "users"
SET "phone" = CASE WHEN btrim("phone") LIKE '+%' THEN '+' ELSE '' END
              || regexp_replace("phone", '[^0-9]', '', 'g')
WHERE "phone" IS NOT NULL;

-- 2. Reject anything else from now on, whoever writes it.
ALTER TABLE "users" ADD CONSTRAINT "users_email_normalized_check"
  CHECK ("email" = lower(btrim("email")) AND "email" <> '');

ALTER TABLE "users" ADD CONSTRAINT "users_phone_format_check"
  CHECK ("phone" ~ '^\+?[0-9]{6,20}$');

-- Absolute lifetime of a session (SCRUM-54): every token of a family ends, at the latest, when the
-- session does, 30 days after its login. The column is added nullable, filled for every existing
-- token from its family's first token, and only then made NOT NULL, so it works on a table that
-- already has rows.

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN "session_expires_at" TIMESTAMPTZ(3);

-- Backfill: the family's first token (the login) plus 30 days. A family older than 30 days gets a
-- date in the past, so its next refresh answers 401 and the user signs in again (by design).
UPDATE "refresh_tokens" AS t
SET "session_expires_at" = f."first_created_at" + INTERVAL '30 days'
FROM (
  SELECT "family_id", MIN("created_at") AS "first_created_at"
  FROM "refresh_tokens"
  GROUP BY "family_id"
) AS f
WHERE t."family_id" = f."family_id";

-- AlterTable
-- The default is a safety net for the deploy: this migration runs while the previous API, which
-- does not know the column, still serves logins and inserts tokens without it.
ALTER TABLE "refresh_tokens"
  ALTER COLUMN "session_expires_at" SET DEFAULT (now() + '30 days'::interval),
  ALTER COLUMN "session_expires_at" SET NOT NULL;

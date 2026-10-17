-- US-06 (SCRUM-19): a name_search column on students and users, the name in its search form.
-- The app writes it on every write of a name (normalizeSearchText in
-- apps/api/src/common/normalize/search-text.ts); this migration fills it for existing rows.
--
-- Prisma generated "ADD COLUMN ... NOT NULL", which fails on a table that already has rows.
-- So: add it nullable, fill it, then make it NOT NULL.

-- 1. The same rules as normalizeSearchText, in SQL. IMMUTABLE: the same input always gives the
--    same output. test/search.e2e-spec.ts checks it agrees with the TypeScript function.
--    - translate: أ إ آ ٱ -> ا, ة -> ه, ى -> ي, Arabic-Indic and Persian digits -> 0-9
--    - remove tashkeel (U+064B..U+065F), the superscript alef (U+0670) and tatweel (U+0640)
--    - lower case, runs of whitespace as one space, trimmed
CREATE FUNCTION "kidzzy_normalize_search"(value TEXT) RETURNS TEXT
LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE
AS $$
  SELECT btrim(regexp_replace(
    lower(regexp_replace(
      translate(value, 'أإآٱةى٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', 'ااااهي01234567890123456789'),
      '[ً-ٰٟـ]', '', 'g')),
    '\s+', ' ', 'g'))
$$;

-- 2. Add the columns, fill them, then require them.
ALTER TABLE "students" ADD COLUMN "name_search" TEXT;
ALTER TABLE "users" ADD COLUMN "name_search" TEXT;

UPDATE "students" SET "name_search" = "kidzzy_normalize_search"("name");
UPDATE "users" SET "name_search" = "kidzzy_normalize_search"("name");

ALTER TABLE "students" ALTER COLUMN "name_search" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "name_search" SET NOT NULL;

-- No index: a search is LIKE '%text%', which a b-tree index cannot use. If a list grows to
-- many thousands of rows, a pg_trgm GIN index is the next step.

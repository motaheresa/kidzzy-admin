-- Material links (SCRUM-36, US-32). Only new objects: a table, its indexes and key, and
-- permission rows. No existing row is changed or removed.

-- CreateTable
CREATE TABLE "material_links" (
    "id" UUID NOT NULL,
    "academy_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "material_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "material_links_id_academy_id_key" ON "material_links"("id", "academy_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_links_academy_id_sort_order_key" ON "material_links"("academy_id", "sort_order");

-- AddForeignKey
ALTER TABLE "material_links" ADD CONSTRAINT "material_links_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Constraints Prisma cannot express. The same limits the API validates (MATERIAL_LINK_TITLE_MAX
-- and MATERIAL_LINK_URL_MAX). There is none on sort_order: a reorder passes through negative
-- values inside its transaction.
ALTER TABLE "material_links" ADD CONSTRAINT "material_links_title_check"
  CHECK (char_length("title") BETWEEN 1 AND 100);
-- A link is opened in the browser, so only a web address is ever stored.
ALTER TABLE "material_links" ADD CONSTRAINT "material_links_url_check"
  CHECK (char_length("url") <= 2048 AND "url" ~* '^https?://');

-- The permissions of the material links. They are in the original catalog and the seed grants
-- them, but the deploy never runs the seed, so they are also written here (like
-- announcements.send:any). Running it twice changes nothing.
INSERT INTO "permissions" ("id", "key", "description", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'materials.read:any', 'View material links', now(), now()),
  (gen_random_uuid(), 'materials.manage:any', 'Add, edit and order material links', now(), now())
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."key" IN ('materials.read:any', 'materials.manage:any')
WHERE r."name" = 'Admin' AND r."is_system"
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."key" = 'materials.read:any'
WHERE r."name" = 'Instructor' AND r."is_system"
ON CONFLICT DO NOTHING;

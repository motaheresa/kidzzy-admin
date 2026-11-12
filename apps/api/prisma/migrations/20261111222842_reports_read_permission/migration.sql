-- The reports permission (SCRUM-82, US-38). The deploy never runs the seed, so the permission and
-- its grant to every academy's Admin system role are written here. The seed's catalog and
-- SYSTEM_ROLE_PERMISSIONS hold the same key, so a new academy gets it too.
--
-- Only new rows: nothing existing is changed or removed, and running it twice changes nothing.

-- The permission itself (permissions is global, keyed by "key").
INSERT INTO "permissions" ("id", "key", "description", "created_at", "updated_at")
VALUES (gen_random_uuid(), 'reports.read:any', 'View reports', now(), now())
ON CONFLICT ("key") DO NOTHING;

-- Granted to the Admin system role of every academy that exists now.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."key" = 'reports.read:any'
WHERE r."name" = 'Admin' AND r."is_system"
ON CONFLICT DO NOTHING;

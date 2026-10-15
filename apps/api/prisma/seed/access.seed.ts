import { PERMISSIONS, SYSTEM_ROLE_PERMISSIONS, SystemRole } from '@kidzzy/shared';
import type { PrismaClient } from '../../src/generated/prisma/client';

// Seeding crosses academies by nature, so it uses the unscoped client (ADR-0006).
// Every function is idempotent: running the seed again changes nothing that is already right.

/** Inserts or updates the global permission catalog. */
export async function seedPermissions(prisma: PrismaClient): Promise<void> {
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { key },
      create: { key, description },
      update: { description },
    });
  }
}

/** Returns the academy with this name, creating it if needed (V1 runs one academy). */
export async function seedAcademy(
  prisma: PrismaClient,
  name: string,
  timezone: string,
): Promise<{ id: string }> {
  const existing = await prisma.academy.findFirst({ where: { name }, select: { id: true } });
  if (existing) return existing;
  return prisma.academy.create({ data: { name, timezone }, select: { id: true } });
}

/**
 * Creates the Admin and Instructor system roles of an academy and makes their permissions
 * match SYSTEM_ROLE_PERMISSIONS exactly: missing grants are added, removed ones are revoked.
 */
export async function seedSystemRoles(prisma: PrismaClient, academyId: string): Promise<void> {
  const permissions = await prisma.permission.findMany({ select: { id: true, key: true } });
  const idByKey = new Map(permissions.map((p) => [p.key, p.id]));

  for (const roleName of Object.values(SystemRole)) {
    const role = await prisma.role.upsert({
      where: { academyId_name: { academyId, name: roleName } },
      create: { academyId, name: roleName, isSystem: true },
      update: { isSystem: true },
    });

    const wanted = SYSTEM_ROLE_PERMISSIONS[roleName].map((key) => {
      const id = idByKey.get(key);
      if (!id) throw new Error(`Permission ${key} is missing; run seedPermissions first`);
      return id;
    });

    await prisma.$transaction([
      prisma.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId: { notIn: wanted } },
      }),
      prisma.rolePermission.createMany({
        data: wanted.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      }),
    ]);
  }
}

/** The full access seed for one academy. */
export async function seedAccess(
  prisma: PrismaClient,
  academy: { name: string; timezone: string },
): Promise<{ academyId: string }> {
  await seedPermissions(prisma);
  const { id } = await seedAcademy(prisma, academy.name, academy.timezone);
  await seedSystemRoles(prisma, id);
  return { academyId: id };
}

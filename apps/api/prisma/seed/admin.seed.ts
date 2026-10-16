import { SystemRole } from '@kidzzy/shared';
import { hash } from '@node-rs/argon2';
import { normalizeEmail } from '../../src/common/normalize/login-identifiers';
import type { PrismaClient } from '../../src/generated/prisma/client';

/**
 * Creates the first admin of an academy, so someone can log in on a fresh database.
 * Does nothing if a user with this email already exists: an existing password is never reset here.
 */
export async function seedAdmin(
  prisma: PrismaClient,
  academyId: string,
  admin: { name: string; email: string; password: string },
): Promise<'created' | 'exists'> {
  if (admin.password.length < 8) throw new Error('SEED_ADMIN_PASSWORD needs at least 8 characters');

  const email = normalizeEmail(admin.email);
  const existing = await prisma.user.findFirst({
    where: { academyId, email },
    select: { id: true },
  });
  if (existing) return 'exists';

  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { academyId_name: { academyId, name: SystemRole.Admin } },
    select: { id: true },
  });
  await prisma.user.create({
    data: {
      academyId,
      name: admin.name,
      email,
      passwordHash: await hash(admin.password),
      roles: { create: { roleId: adminRole.id } },
    },
  });
  return 'created';
}

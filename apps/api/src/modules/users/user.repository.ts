import { Injectable } from '@nestjs/common';
import { normalizeEmail, normalizePhone } from '../../common/normalize/login-identifiers';
import { PrismaService } from '../prisma/prisma.service';

/** An active user whose password may match a login attempt. */
export interface LoginCandidate {
  id: string;
  academyId: string;
  passwordHash: string;
}

/** A user with what the Me response needs: academy, roles and their permission keys. */
export interface UserWithAccess {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  mustChangePassword: boolean;
  academy: { id: string; name: string; timezone: string };
  roles: { role: { name: string; permissions: { permission: { key: string } }[] } }[];
}

/**
 * Reads and writes users (the User aggregate: a user with its role assignments).
 * The only class that queries the users table; services call these intent-named methods.
 * Email and phone are normalized here, so every lookup and write matches the stored form
 * (check constraints in the normalize_login_fields migration).
 */
@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * LOGIN LOOKUP, UNSCOPED ON PURPOSE: before login no academy is known, so this is the one
   * user query that crosses academies. Emails and phones are unique per academy only, so it may
   * return one candidate per academy; the caller's password check picks the account.
   *
   * Exact match on the normalized value. Never `mode: 'insensitive'`: Prisma sends it as ILIKE,
   * where % and _ are wildcards, so "%@%" would match every user. Deactivated users are left
   * out, so they cannot hide an active account with the same login.
   */
  findLoginCandidates(login: { email: string } | { phone: string }): Promise<LoginCandidate[]> {
    const where =
      'email' in login
        ? { email: normalizeEmail(login.email) }
        : { phone: normalizePhone(login.phone) };
    return this.prisma.unscoped.user.findMany({
      where: { ...where, isActive: true },
      select: { id: true, academyId: true, passwordHash: true },
    });
  }

  /** The user with academy, roles and permissions, in the current academy; throws if absent. */
  findWithAccess(userId: string): Promise<UserWithAccess> {
    return this.prisma.db.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        mustChangePassword: true,
        academy: { select: { id: true, name: true, timezone: true } },
        roles: {
          select: {
            role: {
              select: {
                name: true,
                permissions: { select: { permission: { select: { key: true } } } },
              },
            },
          },
        },
      },
    });
  }
}

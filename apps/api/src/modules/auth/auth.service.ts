import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode, type Me } from '@kidzzy/shared';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AppException } from '../../common/errors/app.exception';
import { normalizePhone } from '../../common/normalize/login-identifiers';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenancy/tenant-context';
import { REFRESH_TOKEN_TTL_SECONDS, type AccessTokenPayload } from './auth.config';
import { PasswordService } from './password.service';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContext,
    private readonly jwt: JwtService,
    private readonly passwords: PasswordService,
  ) {}

  /**
   * Checks the credentials and starts a session.
   * Unknown login, wrong password and deactivated account all give the same INVALID_CREDENTIALS,
   * so the response never tells an attacker which accounts exist or are active.
   */
  async login(login: string, password: string): Promise<{ me: Me; tokens: IssuedTokens }> {
    // No tenant is known before login, so this lookup crosses academies on purpose (unscoped).
    // Emails and phones are unique per academy only; in V1 there is one academy, and if a login
    // ever matches users in several academies, the password picks the account.
    const candidates = await this.prisma.unscoped.user.findMany({
      where: login.includes('@')
        ? { email: { equals: login, mode: 'insensitive' } }
        : { phone: normalizePhone(login) },
      select: { id: true, academyId: true, passwordHash: true, isActive: true },
    });

    let user: (typeof candidates)[number] | undefined;
    for (const candidate of candidates) {
      if (await this.passwords.verify(candidate.passwordHash, password)) {
        user = candidate;
        break;
      }
    }
    if (candidates.length === 0) await this.passwords.verifyNothing(password);
    if (!user || !user.isActive) throw invalidCredentials();

    const sessionId = randomUUID();
    const tokens = await this.issueTokens(user.id, user.academyId, sessionId);

    // From here on this request belongs to the user's academy.
    this.tenant.set(user.academyId, user.id);
    return { me: await this.loadMe(user.id), tokens };
  }

  /**
   * Exchanges a refresh token for a new pair (rotation). Each refresh token works once:
   * presenting one that was already used means it leaked, so the whole session is revoked.
   */
  async refresh(rawToken: string | undefined): Promise<IssuedTokens> {
    if (!rawToken) throw unauthenticated();

    // The refresh request has no access token, so no tenant yet: unscoped lookup by hash.
    const token = await this.prisma.unscoped.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { user: { select: { isActive: true } } },
    });
    const now = new Date();
    if (!token || token.revokedAt || token.expiresAt <= now) throw unauthenticated();

    if (token.usedAt || !token.user.isActive) {
      await this.revokeSession(token.familyId);
      throw unauthenticated();
    }

    // Claim the token atomically: if two requests race with the same token, only one wins,
    // and the loser is treated as reuse.
    const claimed = await this.prisma.unscoped.refreshToken.updateMany({
      where: { id: token.id, usedAt: null, revokedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) {
      await this.revokeSession(token.familyId);
      throw unauthenticated();
    }

    return this.issueTokens(token.userId, token.academyId, token.familyId);
  }

  /** Ends the session: every refresh token since this login stops working. */
  async logout(sessionId: string): Promise<void> {
    await this.prisma.db.refreshToken.updateMany({
      where: { familyId: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** The signed-in user with roles and permission keys; runs in the user's tenant context. */
  async loadMe(userId: string): Promise<Me> {
    const user = await this.prisma.db.user.findUniqueOrThrow({
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

    const roles = user.roles.map(({ role }) => role.name).sort();
    const permissions = [
      ...new Set(
        user.roles.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.key)),
      ),
    ].sort();

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      roles,
      permissions,
      mustChangePassword: user.mustChangePassword,
      academy: user.academy,
    };
  }

  private async issueTokens(
    userId: string,
    academyId: string,
    sessionId: string,
  ): Promise<IssuedTokens> {
    const payload: AccessTokenPayload = { sub: userId, aid: academyId, sid: sessionId };
    const accessToken = await this.jwt.signAsync(payload);

    // The refresh token is random, not a JWT: the database decides whether it is still valid,
    // and only its hash is stored, so a database leak does not leak usable tokens.
    const refreshToken = randomBytes(32).toString('base64url');
    await this.prisma.unscoped.refreshToken.create({
      data: {
        academyId,
        userId,
        familyId: sessionId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      },
    });
    return { accessToken, refreshToken };
  }

  private async revokeSession(familyId: string): Promise<void> {
    await this.prisma.unscoped.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

function invalidCredentials(): AppException {
  return new AppException(
    ErrorCode.InvalidCredentials,
    HttpStatus.UNAUTHORIZED,
    'The login or password is incorrect',
  );
}

function unauthenticated(): AppException {
  return new AppException(ErrorCode.Unauthenticated, HttpStatus.UNAUTHORIZED, 'Sign in again');
}

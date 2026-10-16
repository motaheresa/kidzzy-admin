import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Transactional } from '@nestjs-cls/transactional';
import { ErrorCode, type Me } from '@kidzzy/shared';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AppException } from '../../common/errors/app.exception';
import { TenantContext } from '../tenancy/tenant-context';
import { UserRepository } from '../users/user.repository';
import { REFRESH_TOKEN_TTL_SECONDS, type AccessTokenPayload } from './auth.config';
import { toMe } from './me.mapper';
import { PasswordService } from './password.service';
import { RefreshTokenRepository } from './refresh-token.repository';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Login, refresh-token rotation and logout (US-01). The rules live here; every read and write
 * goes through UserRepository and RefreshTokenRepository, never Prisma directly.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
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
    const candidates = await this.users.findLoginCandidates(
      login.includes('@') ? { email: login } : { phone: login },
    );

    let user: (typeof candidates)[number] | undefined;
    for (const candidate of candidates) {
      if (await this.passwords.verify(candidate.passwordHash, password)) {
        user = candidate;
        break;
      }
    }
    // Same time spent with or without a matching account (see PasswordService.verifyNothing).
    if (candidates.length === 0) await this.passwords.verifyNothing(password);
    if (!user) throw invalidCredentials();

    // From here on this request belongs to the user's academy, so every query below is scoped.
    this.tenant.set(user.academyId, user.id);
    const tokens = await this.issueTokens(user.id, user.academyId, randomUUID());
    return { me: await this.loadMe(user.id), tokens };
  }

  /**
   * Exchanges a refresh token for a new pair (rotation). Each refresh token works once:
   * presenting one that was already used means it leaked, so the whole session is revoked.
   */
  async refresh(rawToken: string | undefined): Promise<IssuedTokens> {
    if (!rawToken) throw unauthenticated();

    const token = await this.refreshTokens.findForRefresh(sha256(rawToken));
    const now = new Date();
    if (!token || token.revokedAt || token.expiresAt <= now) throw unauthenticated();

    // The token names its academy: the rest of this request is scoped to it.
    this.tenant.set(token.academyId, token.userId);

    if (token.usedAt || !token.user.isActive) {
      await this.refreshTokens.revokeSession(token.familyId);
      throw unauthenticated();
    }

    const rotated = await this.rotate(token, now);
    if (!rotated) {
      // Another request claimed this token first: treated as reuse.
      await this.refreshTokens.revokeSession(token.familyId);
      throw unauthenticated();
    }
    return rotated;
  }

  /**
   * Marks the old token used and stores the new one in ONE transaction, so a failure between
   * the two writes cannot leave the session without a valid token.
   * Returns null when the claim fails. Revocation and the 401 stay outside, in refresh(): a throw
   * in here would roll the revocation back.
   */
  @Transactional()
  private async rotate(
    token: { id: string; userId: string; academyId: string; familyId: string },
    now: Date,
  ): Promise<IssuedTokens | null> {
    // Atomic claim: if two requests race with the same token, only one wins.
    if (!(await this.refreshTokens.claim(token.id, now))) return null;
    return this.issueTokens(token.userId, token.academyId, token.familyId);
  }

  /** Ends the session: every refresh token since this login stops working. */
  async logout(sessionId: string): Promise<void> {
    await this.refreshTokens.revokeSession(sessionId);
  }

  /**
   * The signed-in user with roles and permission keys; runs in the user's tenant context.
   * A user deactivated after logging in gets 401 UNAUTHENTICATED, never a stale Me.
   */
  async loadMe(userId: string): Promise<Me> {
    const user = await this.users.findActiveWithAccess(userId);
    if (!user) throw unauthenticated();
    return toMe(user);
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
    await this.refreshTokens.create({
      academyId,
      userId,
      familyId: sessionId,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    });
    return { accessToken, refreshToken };
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

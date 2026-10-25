import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Transactional } from '@nestjs-cls/transactional';
import { ErrorCode, type Me } from '@kidzzy/shared';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AppException } from '../../common/errors/app.exception';
import { Clock } from '../sessions/clock';
import { TenantContext } from '../tenancy/tenant-context';
import { UserRepository } from '../users/user.repository';
import {
  isAccessTokenPayload,
  REFRESH_TOKEN_TTL_SECONDS,
  SESSION_MAX_AGE_SECONDS,
  type AccessTokenPayload,
} from './auth.config';
import { toMe } from './me.mapper';
import { PasswordService } from './password.service';
import { RefreshTokenRepository, type StoredRefreshToken } from './refresh-token.repository';

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
    private readonly clock: Clock,
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
    const me = await this.loadMe(user.id);
    const tokens = await this.issueTokens(user.id, user.academyId, randomUUID(), me, undefined);
    return { me, tokens };
  }

  /**
   * Exchanges a refresh token for a new pair (rotation). Each refresh token works once:
   * presenting one that was already used means it leaked, so the whole session is revoked.
   *
   * A session also has an absolute end, 30 days after its login (SCRUM-54): after it the refresh
   * is 401 however recently the token was issued, and rotation never extends it.
   *
   * `rawTokens` is every refresh cookie the request carried, in the order the browser sent them.
   * There is normally one; two can arrive right after the deploy that moved the cookie's path
   * (the legacy one and the new one). The one that still works is used, so a stale duplicate does
   * not look like a reuse and sign the user out. If none works, the first is judged as before.
   */
  async refresh(rawTokens: readonly string[]): Promise<IssuedTokens> {
    const now = this.clock.now();
    const candidates = rawTokens.filter(Boolean);
    if (candidates.length === 0) throw unauthenticated();

    let token: StoredRefreshToken | null = null;
    let first: StoredRefreshToken | null = null;
    for (const raw of candidates) {
      const found = await this.refreshTokens.findForRefresh(sha256(raw));
      first ??= found;
      if (found && isUsable(found, now)) {
        token = found;
        break;
      }
    }
    token ??= first;
    if (!token || token.revokedAt || token.expiresAt <= now || token.sessionExpiresAt <= now) {
      throw unauthenticated();
    }

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
    token: {
      id: string;
      userId: string;
      academyId: string;
      familyId: string;
      sessionExpiresAt: Date;
    },
    now: Date,
  ): Promise<IssuedTokens | null> {
    // Atomic claim: if two requests race with the same token, only one wins.
    if (!(await this.refreshTokens.claim(token.id, now))) return null;
    // The CURRENT permission keys and mustChangePassword go into the new access token: a role
    // changed since the last token applies from now on (ADR-0013). loadMe also refuses a user
    // deactivated meanwhile.
    const me = await this.loadMe(token.userId);
    return this.issueTokens(
      token.userId,
      token.academyId,
      token.familyId,
      me,
      token.sessionExpiresAt,
    );
  }

  /**
   * POST /auth/change-password (US-02): the signed-in user replaces their password.
   * - A wrong current password: 422 CURRENT_PASSWORD_INCORRECT (not 401: the caller IS signed
   *   in, and a 401 would make the web client refresh and retry).
   * - The same password again: 422 PASSWORD_UNCHANGED.
   * Then, in one transaction: the new hash with mustChangePassword false, every session of the
   * user revoked (other devices are signed out at their next refresh), and a new session for
   * this device, whose cookies the controller sets.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<IssuedTokens> {
    const passwordHash = await this.users.findActivePasswordHash(userId);
    // Deactivated since the token was issued; nothing has changed yet, so 401 is safe here.
    if (!passwordHash) throw unauthenticated();
    if (!(await this.passwords.verify(passwordHash, currentPassword))) {
      throw new AppException(
        ErrorCode.CurrentPasswordIncorrect,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'The current password is incorrect',
      );
    }
    if (newPassword === currentPassword) {
      throw new AppException(
        ErrorCode.PasswordUnchanged,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'The new password must differ from the current one',
      );
    }
    // Hashed before the transaction: argon2 is slow on purpose.
    const newHash = await this.passwords.hash(newPassword);
    return this.replacePassword(userId, newHash);
  }

  @Transactional()
  private async replacePassword(userId: string, passwordHash: string): Promise<IssuedTokens> {
    await this.users.setPassword(userId, passwordHash, false);
    await this.refreshTokens.revokeAllForUser(userId);
    const me = await this.loadMe(userId);
    return this.issueTokens(userId, this.tenant.requireAcademyId(), randomUUID(), me, undefined);
  }

  /**
   * Ends the session, from whatever the request carries (SCRUM-54). The access token may have
   * expired long ago, so the session is found from the refresh cookie (a lookup by hash, then the
   * whole family is revoked) and, when the access token is still valid, from its sid. Either one
   * is enough. Nothing found is not an error: logging out is idempotent and says nothing about
   * which tokens exist.
   */
  async logout(refreshTokens: readonly string[], accessToken: string | undefined): Promise<void> {
    for (const raw of refreshTokens) {
      if (!raw) continue;
      const token = await this.refreshTokens.findForRefresh(sha256(raw));
      if (!token) continue;
      // The token names its academy: the revocation below is scoped to it.
      this.tenant.set(token.academyId, token.userId);
      await this.refreshTokens.revokeSession(token.familyId);
    }
    const payload = accessToken ? await this.verifyAccessToken(accessToken) : null;
    if (payload) {
      this.tenant.set(payload.aid, payload.sub);
      await this.refreshTokens.revokeSession(payload.sid);
    }
  }

  /** The payload of a valid (signed, unexpired, well-formed) access token, or null. */
  private async verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
    try {
      const payload = await this.jwt.verifyAsync<object>(token);
      return isAccessTokenPayload(payload) ? payload : null;
    } catch {
      return null; // expired, tampered with, or signed with another secret
    }
  }

  /**
   * Signs the user out everywhere (deactivation, password reset): no refresh works any more, so
   * each device is signed out when its access token expires, within 15 minutes (ADR-0013).
   * Joins the caller's transaction when there is one.
   */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.refreshTokens.revokeAllForUser(userId);
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
    access: Pick<Me, 'permissions' | 'mustChangePassword'>,
    sessionExpiresAt: Date | undefined,
  ): Promise<IssuedTokens> {
    const payload: AccessTokenPayload = {
      sub: userId,
      aid: academyId,
      sid: sessionId,
      perms: access.permissions,
      mustChangePassword: access.mustChangePassword,
    };
    const accessToken = await this.jwt.signAsync(payload);

    // The refresh token is random, not a JWT: the database decides whether it is still valid,
    // and only its hash is stored, so a database leak does not leak usable tokens.
    const refreshToken = randomBytes(32).toString('base64url');
    const now = this.clock.now();
    // A new session ends 30 days from now; a rotated token keeps the end of its session, and
    // never expires after it (the idle expiry is cut short by the session's end).
    const sessionEnd = sessionExpiresAt ?? new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
    const idleEnd = new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000);
    await this.refreshTokens.create({
      academyId,
      userId,
      familyId: sessionId,
      tokenHash: sha256(refreshToken),
      expiresAt: idleEnd < sessionEnd ? idleEnd : sessionEnd,
      sessionExpiresAt: sessionEnd,
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

/** A token the refresh can still use: not revoked, not used, not expired, session not over. */
function isUsable(
  token: { revokedAt: Date | null; usedAt: Date | null; expiresAt: Date; sessionExpiresAt: Date },
  now: Date,
): boolean {
  return !token.revokedAt && !token.usedAt && token.expiresAt > now && token.sessionExpiresAt > now;
}

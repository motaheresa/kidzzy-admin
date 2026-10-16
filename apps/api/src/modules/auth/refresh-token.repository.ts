import { Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantTransactionalAdapter } from '../prisma/transaction';

/** A stored refresh token with what the refresh flow checks. */
export interface StoredRefreshToken {
  id: string;
  academyId: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  user: { isActive: boolean };
}

/**
 * Reads and writes refresh tokens (ADR-0005). Tokens are stored as SHA-256 hashes; the
 * service hashes, this class only stores and finds by hash. A family is the session started at
 * login: every token issued since then shares its familyId.
 *
 * Scoped queries go through `txHost.tx`: the current transaction inside @Transactional(),
 * otherwise `prisma.db`. Both are limited to the academy in TenantContext.
 */
@Injectable()
export class RefreshTokenRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly txHost: TransactionHost<TenantTransactionalAdapter>,
  ) {}

  /**
   * REFRESH-TOKEN LOOKUP, UNSCOPED ON PURPOSE: a refresh request carries no access token, so no
   * academy is known yet. The token's own academyId becomes the tenant for the rest of the
   * request; every other method here is scoped.
   */
  findForRefresh(tokenHash: string): Promise<StoredRefreshToken | null> {
    return this.prisma.unscoped.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        academyId: true,
        userId: true,
        familyId: true,
        expiresAt: true,
        usedAt: true,
        revokedAt: true,
        user: { select: { isActive: true } },
      },
    });
  }

  /** Stores a newly issued token in the current academy. */
  async create(token: {
    academyId: string;
    userId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.txHost.tx.refreshToken.create({ data: token });
  }

  /**
   * Marks the token used, atomically: if two requests race with the same token, only one gets
   * true, and the caller treats the other as reuse.
   */
  async claim(id: string, at: Date): Promise<boolean> {
    const { count } = await this.txHost.tx.refreshToken.updateMany({
      where: { id, usedAt: null, revokedAt: null },
      data: { usedAt: at },
    });
    return count === 1;
  }

  /** Ends a session: every token of the family that is not revoked yet stops working. */
  async revokeSession(familyId: string, at = new Date()): Promise<void> {
    await this.txHost.tx.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: at },
    });
  }
}

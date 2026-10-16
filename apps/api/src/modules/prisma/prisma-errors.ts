import { Prisma } from '../../generated/prisma/client';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * The name of the unique index a write broke, or null when the error is something else.
 *
 * Prisma reports a unique violation as P2002. Through the pg driver adapter (Prisma 7) the index
 * name sits in `meta.driverAdapterError.cause.constraint.index`, for example
 * "users_academy_id_email_key". Repositories map that name to a stable ErrorCode, so a duplicate
 * becomes a 409 the client can act on, instead of a 500. Relying on the unique index (and not on
 * a "does it exist?" query first) is what makes it safe when two requests race.
 */
export function uniqueViolationIndex(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return null;
  }
  const adapterError = error.meta?.driverAdapterError;
  const cause = isRecord(adapterError) ? adapterError.cause : undefined;
  const constraint = isRecord(cause) ? cause.constraint : undefined;
  const index = isRecord(constraint) ? constraint.index : undefined;
  return typeof index === 'string' ? index : null;
}

import { Prisma } from '../../generated/prisma/client';
import { TenantViolationError } from '../tenancy/tenancy.errors';

/**
 * Models that belong to an academy: every model with an `academyId` field.
 * Computed from the generated client, so a new tenant table is covered without editing this file.
 */
export const TENANT_MODELS: ReadonlySet<string> = new Set(
  Object.values(Prisma.ModelName).filter((model) => {
    const fields = (Prisma as unknown as Record<string, Record<string, string> | undefined>)[
      `${model}ScalarFieldEnum`
    ];
    return fields !== undefined && 'academyId' in fields;
  }),
);

/** Operations whose `where` gets `academyId`. */
const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
]);

/** Operations that create rows, so `data` gets `academyId`. */
const CREATE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn']);

/** Operations that change rows, so `data` must not move them to another academy. */
const UPDATE_OPERATIONS = new Set(['update', 'updateMany', 'updateManyAndReturn']);

type Data = Record<string, unknown>;
type Args = Record<string, unknown> & { where?: Data; data?: Data | Data[]; create?: Data };

/** Adds academyId to a create payload, refusing a payload that names another academy. */
function withAcademy(data: Data, academyId: string, model: string, operation: string): Data {
  if (data.academyId !== undefined && data.academyId !== academyId) {
    throw new TenantViolationError(model, operation);
  }
  return { ...data, academyId };
}

/**
 * Returns the query arguments limited to one academy.
 *
 * - Reads, updates and deletes: `where` gets `academyId`, so rows of other academies are invisible
 *   (an update of another academy's row fails as "record not found").
 * - Creates and upserts: `data` gets `academyId`.
 * - Any operation not listed above is refused, so a new Prisma operation can never run unscoped.
 */
export function scopeQueryArgs(
  model: string,
  operation: string,
  args: Args,
  academyId: string,
): Args {
  const scoped: Args = { ...args };

  if (operation === 'upsert') {
    scoped.where = { ...args.where, academyId };
    scoped.create = withAcademy(args.create ?? {}, academyId, model, operation);
    if (args.update && (args.update as Data).academyId !== undefined) {
      throw new TenantViolationError(model, operation);
    }
    return scoped;
  }

  if (WHERE_OPERATIONS.has(operation)) {
    scoped.where = { ...args.where, academyId };
    if (UPDATE_OPERATIONS.has(operation) && args.data) {
      const data = args.data as Data;
      if (data.academyId !== undefined && data.academyId !== academyId) {
        throw new TenantViolationError(model, operation);
      }
    }
    return scoped;
  }

  if (CREATE_OPERATIONS.has(operation)) {
    scoped.data = Array.isArray(args.data)
      ? args.data.map((row) => withAcademy(row, academyId, model, operation))
      : withAcademy(args.data ?? {}, academyId, model, operation);
    return scoped;
  }

  throw new Error(
    `Tenant scoping does not support ${model}.${operation}; add it to tenant-scope.ts`,
  );
}

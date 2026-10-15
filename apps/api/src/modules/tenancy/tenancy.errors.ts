/**
 * Thrown when tenant data is queried with no academy in context.
 * It signals a bug (a route without the login guard, or a job without `TenantContext.run`),
 * so it surfaces as a 500 and the query never runs unscoped.
 */
export class MissingTenantContextError extends Error {
  constructor() {
    super('No academy in the current context: tenant data cannot be queried without one');
    this.name = 'MissingTenantContextError';
  }
}

/** Thrown when a query tries to write a different academy_id than the current one. */
export class TenantViolationError extends Error {
  constructor(model: string, operation: string) {
    super(`${model}.${operation} tried to write another academy's academyId`);
    this.name = 'TenantViolationError';
  }
}

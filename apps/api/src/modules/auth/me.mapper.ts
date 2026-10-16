import type { Me } from '@kidzzy/shared';
import type { UserWithAccess } from '../users/user.repository';

/**
 * Builds the Me response (openapi.yaml: Me) from a user row. Responses are always built by a
 * mapper, never by returning a database row, so a new column never leaks into the API.
 * Roles and permission keys are sorted, and a permission granted by two roles appears once.
 */
export function toMe(user: UserWithAccess): Me {
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
    academy: { id: user.academy.id, name: user.academy.name, timezone: user.academy.timezone },
  };
}

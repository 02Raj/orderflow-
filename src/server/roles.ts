import { AuthenticatedUser, Role, ROLE_RANK } from './common/types';
import { ForbiddenException } from './errors';

export function assertRole(user: AuthenticatedUser, minimum: Role): void {
  if (ROLE_RANK[user.role] < ROLE_RANK[minimum]) {
    throw new ForbiddenException(`Requires ${minimum} role or above`);
  }
}

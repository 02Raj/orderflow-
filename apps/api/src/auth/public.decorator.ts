import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser, Role, ROLE_RANK } from '../common/types';
import { ForbiddenException } from '@nestjs/common';

export const IS_PUBLIC = 'orderflow:isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  const user = ctx.switchToHttp().getRequest().user as AuthenticatedUser | undefined;
  if (!user) throw new ForbiddenException('No authenticated user on request');
  return user;
});

export function assertRole(user: AuthenticatedUser, minimum: Role): void {
  if (ROLE_RANK[user.role] < ROLE_RANK[minimum]) {
    throw new ForbiddenException(`Requires ${minimum} role or above`);
  }
}

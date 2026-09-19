import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthenticatedUser } from '../common/types';
import { IS_PUBLIC } from './public.decorator';

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const header = request.headers.authorization;
    const queryToken =
      typeof request.query?.access_token === 'string'
        ? request.query.access_token
        : typeof request.query?.token === 'string'
          ? request.query.token
          : null;
    const raw = header?.startsWith('Bearer ') ? header.slice(7) : queryToken;
    if (!raw) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        restaurant_id: string;
        email: string;
        name: string;
        role: AuthenticatedUser['role'];
      }>(raw);

      request.user = {
        id: payload.sub,
        restaurantId: payload.restaurant_id,
        email: payload.email,
        fullName: payload.name,
        role: payload.role,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}

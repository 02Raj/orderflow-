import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

export const THROTTLE_KEY = 'orderflow:throttle';

export const Throttle = (limit: number, windowSec: number) =>
  SetMetadata(THROTTLE_KEY, { limit, windowSec });

@Injectable()
export class ThrottleGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const cfg = this.reflector.getAllAndOverride<{ limit: number; windowSec: number }>(THROTTLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!cfg) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
    const key = `${ip}:${req.method}:${req.path}`;
    const now = Date.now();
    const windowMs = cfg.windowSec * 1000;
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= cfg.limit) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'rate_limited',
          message: 'Too many attempts. Wait a minute and try again.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) {
      for (const [k, times] of this.hits) {
        if (!times.some((t) => now - t < windowMs)) this.hits.delete(k);
      }
    }
    return true;
  }
}

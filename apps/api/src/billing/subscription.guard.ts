import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { BillingService } from './billing.service';
import type { RequestWithUser } from '../auth/jwt-auth.guard';

/**
 * Trial and subscription enforcement in one place.
 *
 * Expiry degrades the product to read-only rather than locking the owner out: their sales history
 * and reports stay visible, only new orders stop. Locking a restaurant out of its own numbers
 * turns a billing lapse into a support emergency and guarantees a refund request.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  private readonly cache = new Map<string, { blocked: boolean; expires: number }>();

  constructor(private readonly billing: BillingService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) return true;
    if (request.method === 'GET' || request.method === 'HEAD') return true;
    if (request.path.startsWith('/billing') || request.path.startsWith('/auth')) return true;

    const restaurantId = request.user.restaurantId;
    const cached = this.cache.get(restaurantId);
    const blocked =
      cached && cached.expires > Date.now()
        ? cached.blocked
        : (await this.billing.status(restaurantId)).accessBlocked;

    this.cache.set(restaurantId, { blocked, expires: Date.now() + 30_000 });

    if (blocked) {
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          error: 'subscription_required',
          message: 'Your free trial has ended. Subscribe to keep taking orders.',
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return true;
  }
}

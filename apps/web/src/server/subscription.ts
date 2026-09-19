import { PaymentRequiredException } from './errors';
import type { BillingService } from './billing/billing.service';

const cache = new Map<string, { blocked: boolean; expires: number }>();

export async function assertWritableSubscription(
  billing: BillingService,
  restaurantId: string,
): Promise<void> {
  const cached = cache.get(restaurantId);
  const blocked =
    cached && cached.expires > Date.now()
      ? cached.blocked
      : (await billing.status(restaurantId)).accessBlocked;
  cache.set(restaurantId, { blocked, expires: Date.now() + 30_000 });
  if (blocked) throw new PaymentRequiredException();
}

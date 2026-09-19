import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser, SubscriptionStatus } from '../common/types';

export interface SubscriptionView {
  status: SubscriptionStatus;
  plan: string;
  trialEndsAt: string;
  currentPeriodEnd: string | null;
  provider: string | null;
  daysLeftInTrial: number;
  /** Single flag the frontend and the guard both read. */
  accessBlocked: boolean;
  priceLabel: string;
  mockMode: boolean;
}

interface SubscriptionRow {
  restaurant_id: string;
  status: SubscriptionStatus;
  plan: string;
  trial_ends_at: string;
  current_period_end: string | null;
  provider: string | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
}

export class BillingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  get mockMode(): boolean {
    return !process.env.STRIPE_SECRET_KEY;
  }

  async status(restaurantId: string): Promise<SubscriptionView> {
    const row = await this.db.one<SubscriptionRow>(
      'select * from subscriptions where restaurant_id = $1',
      [restaurantId],
    );

    const trialEndsAt = row?.trial_ends_at ?? new Date().toISOString();
    const msLeft = new Date(trialEndsAt).getTime() - Date.now();
    const daysLeftInTrial = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));

    let status: SubscriptionStatus = row?.status ?? 'trialing';
    if (status === 'trialing' && msLeft <= 0) status = 'expired';

    return {
      status,
      plan: row?.plan ?? 'standard',
      trialEndsAt,
      currentPeriodEnd: row?.current_period_end ?? null,
      provider: row?.provider ?? null,
      daysLeftInTrial,
      accessBlocked: status === 'expired' || status === 'canceled',
            priceLabel: process.env.PRICE_LABEL ?? '$29 / month',
      mockMode: this.mockMode,
    };
  }

  /**
   * Stripe Checkout when configured; otherwise a local simulation so the whole
   * trial -> subscribe -> unlock flow is testable before any payment credentials exist.
   */
  async createCheckout(user: AuthenticatedUser, successUrl: string, cancelUrl: string) {
    if (this.mockMode) {
      return {
        mode: 'mock' as const,
        url: `${process.env.APP_PUBLIC_URL ?? 'http://127.0.0.1:43123'}/api/billing/mock-confirm?restaurantId=${user.restaurantId}&redirect=${encodeURIComponent(successUrl)}`,
      };
    }

    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const current = await this.db.one<SubscriptionRow>(
      'select * from subscriptions where restaurant_id = $1',
      [user.restaurantId],
    );

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: current?.provider_customer_id ?? undefined,
      customer_email: current?.provider_customer_id ? undefined : user.email,
      line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
      client_reference_id: user.restaurantId,
      subscription_data: { metadata: { restaurant_id: user.restaurantId } },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return { mode: 'stripe' as const, url: session.url };
  }

  async markActive(restaurantId: string, details: Partial<SubscriptionRow> = {}) {
    const periodEnd =
      details.current_period_end ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await this.db.query(
      `update subscriptions
       set status = 'active',
           provider = coalesce($2, provider),
           provider_customer_id = coalesce($3, provider_customer_id),
           provider_subscription_id = coalesce($4, provider_subscription_id),
           current_period_end = $5,
           updated_at = now()
       where restaurant_id = $1`,
      [
        restaurantId,
        details.provider ?? (this.mockMode ? 'mock' : 'stripe'),
        details.provider_customer_id ?? null,
        details.provider_subscription_id ?? null,
        periodEnd,
      ],
    );

    await this.audit.record({
      restaurantId,
      action: 'subscription.active',
      entity: 'subscription',
      entityId: restaurantId,
      metadata: { provider: details.provider ?? (this.mockMode ? 'mock' : 'stripe') },
    });
  }

  async setStatus(restaurantId: string, status: SubscriptionStatus) {
    await this.db.query(
      'update subscriptions set status = $2, updated_at = now() where restaurant_id = $1',
      [restaurantId, status],
    );
    await this.audit.record({
      restaurantId,
      action: `subscription.${status}`,
      entity: 'subscription',
      entityId: restaurantId,
    });
  }

  /**
   * Webhooks are the only trustworthy source of subscription truth: the browser may never return
   * from Checkout, and cards fail long after the first successful payment.
   */
  async handleStripeEvent(rawBody: Buffer, signature: string) {
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as { client_reference_id?: string; customer?: string; subscription?: string };
        if (session.client_reference_id) {
          await this.markActive(session.client_reference_id, {
            provider: 'stripe',
            provider_customer_id: (session.customer as string) ?? null,
            provider_subscription_id: (session.subscription as string) ?? null,
          });
        }
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as { subscription?: string; lines?: { data: { period: { end: number } }[] } };
        const restaurantId = await this.restaurantIdBySubscription(invoice.subscription);
        if (restaurantId) {
          const end = invoice.lines?.data?.[0]?.period?.end;
          await this.markActive(restaurantId, {
            current_period_end: end ? new Date(end * 1000).toISOString() : undefined,
          });
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as { subscription?: string };
        const restaurantId = await this.restaurantIdBySubscription(invoice.subscription);
        if (restaurantId) await this.setStatus(restaurantId, 'past_due');
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as { id: string };
        const restaurantId = await this.restaurantIdBySubscription(subscription.id);
        if (restaurantId) await this.setStatus(restaurantId, 'canceled');
        break;
      }
      default:
        break;
    }

    return { received: true };
  }

  private async restaurantIdBySubscription(subscriptionId?: string): Promise<string | null> {
    if (!subscriptionId) return null;
    const row = await this.db.one<{ restaurant_id: string }>(
      'select restaurant_id from subscriptions where provider_subscription_id = $1',
      [subscriptionId],
    );
    return row?.restaurant_id ?? null;
  }
}

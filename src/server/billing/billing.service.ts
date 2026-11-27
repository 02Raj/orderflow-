import { createHmac, timingSafeEqual } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser, SubscriptionStatus } from '../common/types';
import { PAYMENTS_ENABLED } from '../../lib/payments';
import { BadRequestException, HttpError } from '../errors';

const DAY_MS = 24 * 60 * 60 * 1000;
const DODO_TEST_API = 'https://test.dodopayments.com';
const DODO_LIVE_API = 'https://live.dodopayments.com';

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

interface DodoEventData {
  subscription_id?: string;
  next_billing_date?: string;
  customer?: { customer_id?: string };
  metadata?: { restaurant_id?: string };
  service_periods?: Array<{ subscription_id?: string; ends_at?: string }>;
}

export class BillingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  get mockMode(): boolean {
    return (
      process.env.NODE_ENV !== 'production' &&
      !process.env.DODO_PAYMENTS_API_KEY &&
      !process.env.STRIPE_SECRET_KEY
    );
  }

  get dodoEnabled(): boolean {
    return Boolean(process.env.DODO_PAYMENTS_API_KEY && process.env.DODO_PRODUCT_ID);
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
    if (PAYMENTS_ENABLED && status === 'trialing' && msLeft <= 0) status = 'expired';

    return {
      status,
      plan: row?.plan ?? 'standard',
      trialEndsAt,
      currentPeriodEnd: row?.current_period_end ?? null,
      provider: row?.provider ?? null,
      daysLeftInTrial,
      accessBlocked:
        PAYMENTS_ENABLED &&
        (status === 'expired' || status === 'suspended' || status === 'canceled'),
      priceLabel: process.env.PRICE_LABEL ?? '$29 / month',
      mockMode: this.mockMode,
    };
  }

  /**
   * Dodo Payments Checkout (Test/Live) when configured, Stripe as fallback,
   * otherwise a local simulation so trial -> subscribe -> unlock is testable without credentials.
   */
  async createCheckout(user: AuthenticatedUser, successUrl: string, cancelUrl: string) {
    const returnUrl = this.safeCallbackUrl(successUrl, 'billing=success');
    const checkoutCancelUrl = this.safeCallbackUrl(cancelUrl, 'billing=cancelled');

    if (this.dodoEnabled) {
      const baseUrl =
        process.env.DODO_PAYMENTS_ENV === 'live_mode'
          ? DODO_LIVE_API
          : DODO_TEST_API;
      const current = await this.db.one<SubscriptionRow>(
        'select * from subscriptions where restaurant_id = $1',
        [user.restaurantId],
      );
      if (current?.status === 'active' && current.provider_subscription_id) {
        throw new BadRequestException('This venue already has an active subscription.');
      }
      const remainingTrialDays = current?.status === 'trialing'
        ? Math.max(0, Math.ceil((new Date(current.trial_ends_at).getTime() - Date.now()) / DAY_MS))
        : 0;

      let response: Response;
      try {
        response = await fetch(`${baseUrl}/checkouts`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${process.env.DODO_PAYMENTS_API_KEY}`,
          },
          signal: AbortSignal.timeout(10_000),
          body: JSON.stringify({
            product_cart: [{ product_id: process.env.DODO_PRODUCT_ID, quantity: 1 }],
            customer: { email: user.email, name: user.fullName },
            metadata: { restaurant_id: user.restaurantId },
            return_url: returnUrl,
            cancel_url: checkoutCancelUrl,
            subscription_data: { trial_period_days: remainingTrialDays },
            feature_flags: {
              allow_customer_editing_country: true,
              allow_customer_editing_tax_id: true,
              allow_customer_editing_business_name: true,
              allow_tax_id: true,
            },
          }),
        });
      } catch (error) {
        console.error('Dodo checkout request failed', error);
        throw new HttpError(502, 'Payment checkout is temporarily unavailable. Please try again.');
      }
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        console.error(`Dodo checkout error (${response.status})`, detail.slice(0, 1000));
        throw new HttpError(502, 'Payment checkout could not be created. Please try again.');
      }
      const session = (await response.json()) as { session_id?: string; checkout_url?: string | null };
      if (!session.session_id || !session.checkout_url) {
        console.error('Dodo checkout returned no redirect URL', { sessionId: session.session_id });
        throw new HttpError(502, 'Payment checkout returned an invalid response. Please try again.');
      }
      return { mode: 'dodo' as const, url: session.checkout_url };
    }

    if (this.mockMode) {
      return {
        mode: 'mock' as const,
        url: `${process.env.APP_PUBLIC_URL ?? 'http://127.0.0.1:43123'}/api/billing/mock-confirm?restaurantId=${user.restaurantId}&redirect=${encodeURIComponent(returnUrl)}`,
      };
    }

    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) {
      throw new HttpError(503, 'Payments are enabled, but no payment provider is configured.');
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
      success_url: returnUrl,
      cancel_url: checkoutCancelUrl,
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

  /**
   * Verifies Standard Webhooks signature from Dodo Payments and updates subscription state.
   */
  async handleDodoEvent(
    rawBody: string,
    headers: { id: string; timestamp: string; signature: string },
  ) {
    const secret = process.env.DODO_PAYMENTS_WEBHOOK_KEY ?? process.env.DODO_WEBHOOK_KEY;
    if (!secret) throw new BadRequestException('DODO_PAYMENTS_WEBHOOK_KEY is not configured');

    const ts = Number(headers.timestamp);
    if (!headers.id || !headers.signature || !Number.isFinite(ts)) {
      throw new BadRequestException('Missing Dodo webhook headers');
    }
    if (Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) {
      throw new BadRequestException('Dodo webhook timestamp outside tolerance');
    }

    const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const signedPayload = `${headers.id}.${headers.timestamp}.${rawBody}`;
    const expected = createHmac('sha256', secretBytes).update(signedPayload).digest('base64');

    const providedSigs = headers.signature
      .split(' ')
      .map((part) => part.split(',')[1])
      .filter(Boolean);

    const matched = providedSigs.some((sig) => {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      return a.length === b.length && timingSafeEqual(a, b);
    });
    if (!matched) throw new BadRequestException('Invalid Dodo webhook signature');

    let event: { type?: string; data?: DodoEventData };
    try {
      event = JSON.parse(rawBody) as { type?: string; data?: DodoEventData };
    } catch {
      throw new BadRequestException('Invalid Dodo webhook payload');
    }
    if (!event.type) throw new BadRequestException('Dodo webhook event type is missing');

    const claimed = await this.db.one<{ event_id: string }>(
      `insert into billing_webhook_events (provider, event_id, event_type)
       values ('dodo', $1, $2)
       on conflict (provider, event_id) do nothing
       returning event_id`,
      [headers.id, event.type],
    );
    if (!claimed) return { received: true, duplicate: true };

    const data = event.data ?? {};
    const servicePeriod = data.service_periods?.find((period) => period.subscription_id);
    const subscriptionId = data.subscription_id ?? servicePeriod?.subscription_id;
    try {
      const restaurantId =
        data.metadata?.restaurant_id ?? (await this.restaurantIdBySubscription(subscriptionId));
      if (restaurantId) {
        switch (event.type) {
          case 'subscription.active':
          case 'subscription.renewed':
          case 'subscription.unpaused':
            await this.markActive(restaurantId, {
              provider: 'dodo',
              provider_customer_id: data.customer?.customer_id ?? null,
              provider_subscription_id: subscriptionId ?? null,
              current_period_end: data.next_billing_date ?? servicePeriod?.ends_at ?? undefined,
            });
            break;
          case 'subscription.past_due':
            await this.setStatus(restaurantId, 'past_due');
            break;
          case 'subscription.on_hold':
          case 'subscription.paused':
            await this.setStatus(restaurantId, 'suspended');
            break;
          case 'subscription.failed':
          case 'subscription.cancelled':
            await this.setStatus(restaurantId, 'canceled');
            break;
          case 'subscription.expired':
            await this.setStatus(restaurantId, 'expired');
            break;
          default:
            // Subscription lifecycle events are authoritative; payment events can also
            // represent one-time or usage charges and must not grant or revoke access.
            break;
        }
      }
      await this.db.query(
        `update billing_webhook_events set processed_at = now()
         where provider = 'dodo' and event_id = $1`,
        [headers.id],
      );
    } catch (error) {
      await this.db.query(
        `delete from billing_webhook_events
         where provider = 'dodo' and event_id = $1 and processed_at is null`,
        [headers.id],
      );
      throw error;
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

  private safeCallbackUrl(candidate: string, fallbackQuery: string): string {
    const appUrl = new URL(process.env.APP_PUBLIC_URL ?? 'http://127.0.0.1:43123');
    const fallback = new URL(`/app/settings?${fallbackQuery}`, appUrl);
    try {
      const url = new URL(candidate, appUrl);
      return url.origin === appUrl.origin ? url.toString() : fallback.toString();
    } catch {
      return fallback.toString();
    }
  }
}

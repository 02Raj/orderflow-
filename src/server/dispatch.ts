import { NextRequest, NextResponse } from 'next/server';
import { dispatchAdmin } from './admin';
import { userFromToken } from './jwt';
import { HttpError, UnauthorizedException, NotFoundException, BadRequestException } from './errors';
import { assertRole } from './roles';
import { clientKey, throttle } from './throttle';
import { assertWritableSubscription } from './subscription';
import { PAYMENTS_ENABLED } from '../lib/payments';
import { getServices } from './services';
import type { AuthenticatedUser, OrderStatus } from './common/types';
import { isOrderingOpen, type Restaurant } from './restaurants/restaurants.service';

const PUBLIC_PATHS = new Set([
  'GET /health',
  'GET /auth/country-presets',
  'POST /auth/signup',
  'POST /auth/login',
  'POST /auth/forgot-password',
  'POST /auth/reset-password',
  'GET /billing/mock-confirm',
  'POST /billing/webhook/stripe',
  'POST /billing/webhook/dodo',
]);

function isPublic(method: string, path: string) {
  if (PUBLIC_PATHS.has(`${method} ${path}`)) return true;
  if (path.startsWith('/public/')) return true;
  return false;
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function guestTicket(order: { id: string; orderNumber: number; status: string; rejectionReason: string | null }) {
  return { id: order.id, orderNumber: order.orderNumber, status: order.status, rejectionReason: order.rejectionReason };
}

function fail(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json(
      { statusCode: error.status, message: error.message, ...error.extra },
      { status: error.status },
    );
  }
  console.error(error);
  return NextResponse.json({ statusCode: 500, message: 'Internal error' }, { status: 500 });
}

async function readJson<T>(request: NextRequest): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

function bearer(request: NextRequest): string | null {
  const header = request.headers.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const query = request.nextUrl.searchParams;
  return query.get('access_token') || query.get('token');
}

async function requireUser(request: NextRequest, auth: Awaited<ReturnType<typeof getServices>>['auth']): Promise<AuthenticatedUser & { sessionVersion: number }> {
  const token = bearer(request);
  if (!token) throw new UnauthorizedException('Missing bearer token');
  try {
    const user = await userFromToken(token);
    if (await auth.sessionIsCurrent(user.id, user.restaurantId, user.sessionVersion)) return user;
  } catch {
    throw new UnauthorizedException('Invalid or expired token');
  }
  throw new UnauthorizedException('Session expired. Sign in again.');
}

function match(path: string, pattern: string): Record<string, string> | null {
  const a = path.split('/').filter(Boolean);
  const b = pattern.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    if (b[i].startsWith(':')) params[b[i].slice(1)] = decodeURIComponent(a[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

export async function dispatch(request: NextRequest, segments: string[]): Promise<Response> {
  const path = '/' + segments.join('/');
  const method = request.method.toUpperCase();
  try {
    if (segments[0] === 'admin') return await dispatchAdmin(request, path);
    const svc = await getServices();
    const publicRoute = isPublic(method, path);
    const user = publicRoute ? null : await requireUser(request, svc.auth);

    if (
      user &&
      method !== 'GET' &&
      method !== 'HEAD' &&
      !path.startsWith('/billing') &&
      !path.startsWith('/auth')
    ) {
      await assertWritableSubscription(svc.billing, user.restaurantId);
    }

    if (method === 'GET' && path === '/health') {
      const started = Date.now();
      await svc.db.query('select 1');
      return json({
        status: 'ok',
        database: svc.db.mode,
        latencyMs: Date.now() - started,
        paymentsMode: PAYMENTS_ENABLED
          ? svc.billing.dodoEnabled
            ? process.env.DODO_PAYMENTS_ENV === 'live_mode' ? 'dodo-live' : 'dodo-test'
            : process.env.STRIPE_SECRET_KEY
              ? 'stripe'
              : svc.billing.mockMode ? 'mock' : 'misconfigured'
          : 'off',
        trialDays: Number(process.env.TRIAL_DAYS ?? 14),
      });
    }

    if (method === 'GET' && path === '/auth/country-presets') {
      return json(svc.auth.countryPresets());
    }

    if (method === 'POST' && path === '/auth/signup') {
      throttle(clientKey(request, 'signup'), 5, 60);
      const body = await readJson<{
        email?: string;
        password?: string;
        fullName?: string;
        restaurantName?: string;
        countryCode?: string;
        taxRegion?: string;
      }>(request);
      if (!body.email || !body.password || !body.fullName || !body.restaurantName || !body.countryCode) {
        throw new BadRequestException('Missing required signup fields');
      }
      if (body.password.length < 8) throw new BadRequestException('Password must be at least 8 characters');
      return json(
        await svc.auth.signup({
          email: body.email,
          password: body.password,
          fullName: body.fullName,
          restaurantName: body.restaurantName,
          countryCode: body.countryCode,
          taxRegion: body.taxRegion,
        }),
      );
    }

    if (method === 'POST' && path === '/auth/login') {
      throttle(clientKey(request, 'login'), 5, 60);
      const body = await readJson<{ email?: string; password?: string }>(request);
      if (!body.email || !body.password) throw new BadRequestException('Email and password are required');
      return json(await svc.auth.login(body.email, body.password));
    }

    if (method === 'POST' && path === '/auth/forgot-password') {
      throttle(clientKey(request, 'forgot-password'), 5, 60);
      const body = await readJson<{ email?: string }>(request);
      if (!body.email) throw new BadRequestException('Email is required');
      return json(await svc.auth.requestPasswordReset(body.email));
    }

    if (method === 'POST' && path === '/auth/reset-password') {
      throttle(clientKey(request, 'reset-password'), 5, 60);
      const body = await readJson<{ token?: string; newPassword?: string }>(request);
      if (!body.token || !body.newPassword) throw new BadRequestException('Token and new password are required');
      return json(await svc.auth.resetPassword(body.token, body.newPassword));
    }

    if (method === 'POST' && path === '/auth/change-password') {
      const body = await readJson<{ currentPassword?: string; newPassword?: string }>(request);
      if (!body.currentPassword || !body.newPassword) {
        throw new BadRequestException('Current and new password are required');
      }
      return json(await svc.auth.changePassword(user!, body.currentPassword, body.newPassword));
    }

    if (method === 'GET' && path === '/auth/me') return json(user);

    if (method === 'GET' && path === '/auth/staff') {
      assertRole(user!, 'manager');
      return json(await svc.auth.listStaff(user!.restaurantId));
    }

    const staffStatus = match(path, '/auth/staff/:id/status');
    if (method === 'PATCH' && staffStatus) {
      assertRole(user!, 'owner');
      const body = await readJson<{ active: boolean }>(request);
      return json(await svc.auth.setStaffActive(user!, staffStatus.id, body.active));
    }

    if (method === 'POST' && path === '/auth/staff') {
      assertRole(user!, 'owner');
      const body = await readJson<{
        email: string;
        password: string;
        fullName: string;
        role: 'manager' | 'staff' | 'kitchen';
      }>(request);
      return json(await svc.auth.createStaff(user!, body));
    }

    if (method === 'GET' && path === '/restaurant') {
      return json(await svc.restaurants.findById(user!.restaurantId));
    }

    if (method === 'PATCH' && path === '/restaurant/kitchen-targets') {
      assertRole(user!, 'owner');
      const body = await readJson<{ targetMinutes: number; forgottenMinutes: number }>(request);
      return json(await svc.restaurants.setKitchenTargets(user!, body?.targetMinutes, body?.forgottenMinutes));
    }

    if (method === 'PATCH' && path === '/restaurant') {
      assertRole(user!, 'owner');
      const body = await readJson<Record<string, unknown>>(request);
      return json(await svc.restaurants.update(user!, body as Partial<Restaurant>));
    }

    if (method === 'PATCH' && path === '/restaurant/ordering') {
      assertRole(user!, 'manager');
      const body = await readJson<{
        orderingPaused?: boolean;
        openingTime?: string | null;
        closingTime?: string | null;
      }>(request);
      if (body.orderingPaused !== undefined && typeof body.orderingPaused !== 'boolean') {
        throw new BadRequestException('Invalid pause setting');
      }
      if ((body.openingTime === null) !== (body.closingTime === null) ||
          (!!body.openingTime !== !!body.closingTime)) {
        throw new BadRequestException('Set both opening and closing times, or leave both empty');
      }
      return json(await svc.restaurants.update(user!, {
        orderingPaused: body.orderingPaused,
        openingTime: body.openingTime,
        closingTime: body.closingTime,
      }));
    }

    if (method === 'GET' && path === '/restaurant/activity') {
      assertRole(user!, 'manager');
      return json(await svc.audit.list(user!.restaurantId));
    }

    if (method === 'GET' && path === '/menu') {
      return json(await svc.menu.getMenu(user!.restaurantId));
    }

    if (method === 'POST' && path === '/menu/categories') {
      assertRole(user!, 'manager');
      const body = await readJson<{ name: string; sortOrder?: number }>(request);
      return json(await svc.menu.createCategory(user!, body.name, body.sortOrder ?? 0));
    }

    const archiveCat = match(path, '/menu/categories/:id');
    if (method === 'DELETE' && archiveCat) {
      assertRole(user!, 'manager');
      return json(await svc.menu.archiveCategory(user!, archiveCat.id));
    }

    if (method === 'POST' && path === '/menu/items') {
      assertRole(user!, 'manager');
      const body = await readJson<{
        name: string;
        priceMinor: number;
        categoryId?: string;
        description?: string;
        sortOrder?: number;
        imageUrl?: string;
      }>(request);
      return json(await svc.menu.createItem(user!, body));
    }

    const addMod = match(path, '/menu/items/:id/modifiers');
    if (method === 'POST' && addMod) {
      assertRole(user!, 'manager');
      const body = await readJson<{ name: string; priceAdjustmentMinor: number }>(request);
      return json(await svc.menu.addModifier(user!, addMod.id, body));
    }

    const itemGroups = match(path, '/menu/items/:id/modifier-groups');
    const itemGroup = match(path, '/menu/items/:id/modifier-groups/:groupId');
    if ((method === 'POST' && itemGroups) || (method === 'PATCH' && itemGroup)) {
      assertRole(user!, 'manager');
      const body = await readJson<Parameters<typeof svc.menu.saveModifierGroup>[2]>(request);
      return json(await svc.menu.saveModifierGroup(user!, (itemGroups ?? itemGroup)!.id, body, itemGroup?.groupId));
    }
    if (method === 'DELETE' && itemGroup) {
      assertRole(user!, 'manager');
      return json(await svc.menu.removeModifierGroup(user!, itemGroup.id, itemGroup.groupId));
    }

    const itemId = match(path, '/menu/items/:id');
    if (method === 'PATCH' && itemId) {
      const body = await readJson<Record<string, unknown>>(request);
      const changesBeyondAvailability = Object.keys(body).some(
        (key) => !['isAvailable', 'unavailableReason'].includes(key),
      );
      if (changesBeyondAvailability) assertRole(user!, 'manager');
      return json(await svc.menu.updateItem(user!, itemId.id, body as never));
    }

    if (method === 'DELETE' && itemId) {
      assertRole(user!, 'manager');
      return json(await svc.menu.archiveItem(user!, itemId.id));
    }

    if (method === 'POST' && path === '/menu/import') {
      assertRole(user!, 'manager');
      const body = await readJson<{ text: string; replace?: boolean }>(request);
      return json(await svc.menu.importFromText(user!, body.text, body.replace ?? false));
    }

    if (method === 'GET' && path === '/tables') {
      return json(await svc.tables.list(user!.restaurantId));
    }

    if (method === 'POST' && path === '/tables') {
      assertRole(user!, 'manager');
      return json(await svc.tables.create(user!, await readJson<unknown>(request)));
    }

    const rotate = match(path, '/tables/:id/rotate');
    if (method === 'POST' && rotate) {
      assertRole(user!, 'manager');
      return json(await svc.tables.rotateToken(user!, rotate.id));
    }

    const tableId = match(path, '/tables/:id');
    if (method === 'PATCH' && tableId) {
      assertRole(user!, 'manager');
      return json(await svc.tables.update(user!, tableId.id, await readJson<unknown>(request)));
    }

    if (method === 'GET' && path === '/orders/stream') {
      return sse(user!, svc.orders, async () => { await requireUser(request, svc.auth); });
    }

    if (method === 'GET' && path === '/orders/business-date') {
      const date = await svc.orders.currentBusinessDate(user!.restaurantId);
      return json({ businessDate: date });
    }

    if (method === 'GET' && path === '/orders') {
      const q = request.nextUrl.searchParams;
      return json(
        await svc.orders.list(user!.restaurantId, {
          status: q.get('status') ?? undefined,
          businessDate: q.get('businessDate') ?? undefined,
          activeOnly: q.get('active') === '1',
          recentServed: q.get('recentServed') === '1',
        }),
      );
    }

    if (method === 'POST' && path === '/orders') {
      assertRole(user!, 'staff');
      const body = await readJson<{
        clientRef: string;
        tableId?: string | null;
        fulfillmentType?: 'dine_in' | 'takeaway';
        customerLabel?: string;
        note?: string;
        lines: { menuItemId: string; quantity: number; note?: string; modifierIds?: string[] }[];
      }>(request);
      return json(await svc.orders.createStaffOrder(user!, { ...body, restaurantId: user!.restaurantId }));
    }

    const itemStatus = match(path, '/orders/:id/items/:itemId/status');
    if (method === 'PATCH' && itemStatus) {
      const body = await readJson<{ status: 'pending' | 'preparing' | 'ready' }>(request);
      return json(await svc.orders.setItemStatus(user!, itemStatus.id, itemStatus.itemId, body.status));
    }

    const orderStatus = match(path, '/orders/:id/status');
    if (method === 'PATCH' && orderStatus) {
      const body = await readJson<{ status: OrderStatus; reason?: string; completeItems?: boolean; expectedUpdatedAt?: string }>(request);
      if (body.status === 'cancelled') assertRole(user!, 'staff');
      return json(await svc.orders.setStatus(user!, orderStatus.id, body.status, body.reason, body.completeItems, body.expectedUpdatedAt));
    }

    const correction = match(path, '/orders/:id/items/:itemId/correction');
    if (method === 'PATCH' && correction) {
      assertRole(user!, 'staff');
      const body = await readJson<{ quantity: number; expectedQuantity: number; reason: string }>(request);
      if (!body) throw new BadRequestException('Enter a quantity and correction reason.');
      return json(await svc.orders.correctItem(user!, correction.id, correction.itemId, body));
    }

    const addOrderItem = match(path, '/orders/:id/items');
    if (method === 'POST' && addOrderItem) {
      assertRole(user!, 'staff');
      const body = await readJson<{ itemId: string; reason: string; line: { menuItemId: string; quantity: number; modifierIds?: string[] } }>(request);
      return json(await svc.orders.addItem(user!, addOrderItem.id, body?.line, body?.itemId, body?.reason));
    }

    const payment = match(path, '/orders/:id/payment');
    if (method === 'POST' && payment) {
      assertRole(user!, 'staff');
      const body = await readJson<{ method: string; expectedTotal: number }>(request);
      return json(await svc.orders.recordPayment(user!, payment.id, body?.method, body?.expectedTotal));
    }

    const reversal = match(path, '/orders/:id/payment/reversal');
    if (method === 'POST' && reversal) {
      assertRole(user!, 'manager');
      const body = await readJson<{ reason: string; expectedUpdatedAt: string }>(request);
      return json(await svc.orders.reversePayment(user!, reversal.id, body?.reason, body?.expectedUpdatedAt));
    }

    const orderRecall = match(path, '/orders/:id/recall');
    if (method === 'POST' && orderRecall) {
      return json(await svc.orders.recall(user!, orderRecall.id));
    }
    const ack = match(path, '/orders/:id/acknowledge-corrections');
    if (method === 'POST' && ack) {
      const body = await readJson<{ summary: string }>(request);
      return json(await svc.orders.acknowledgeCorrections(user!, ack.id, body?.summary));
    }

    const orderGet = match(path, '/orders/:id');
    if (method === 'GET' && orderGet) {
      return json(await svc.orders.findById(user!.restaurantId, orderGet.id));
    }

    const guestMenu = match(path, '/public/venues/:slug/tables/:token');
    if (method === 'GET' && guestMenu) {
      const table = await svc.tables.findByToken(guestMenu.slug, guestMenu.token);
      if (!table) throw new NotFoundException('This QR code is not active');
      const [menu, restaurant, billing] = await Promise.all([
        svc.menu.getPublicMenu(table.restaurantId),
        svc.restaurants.findById(table.restaurantId),
        svc.billing.status(table.restaurantId),
      ]);
      return json({
        restaurant: {
          name: restaurant.name,
          slug: restaurant.slug,
          currency: restaurant.currency,
          locale: restaurant.locale,
          taxLabel: restaurant.taxLabel,
          taxInclusive: restaurant.taxInclusive,
          taxRateBp: restaurant.taxRateBp,
        },
        table: {
          id: table.tableId,
          number: table.tableNumber,
          label: table.label,
        },
        orderingEnabled: !billing.accessBlocked && isOrderingOpen(restaurant),
        orderingMessage: billing.accessBlocked
          ? 'Digital ordering is unavailable right now.'
          : restaurant.orderingPaused
            ? 'The venue has paused QR ordering. Please order with a team member.'
            : 'QR ordering is closed right now. Please order with a team member.',
        menu,
      });
    }

    const guestPlace = match(path, '/public/venues/:slug/tables/:token/orders');
    if (method === 'POST' && guestPlace) {
      const table = await svc.tables.findByToken(guestPlace.slug, guestPlace.token);
      if (!table) throw new NotFoundException('This QR code is not active');
      const billing = await svc.billing.status(table.restaurantId);
      if (billing.accessBlocked) {
        throw new BadRequestException('This restaurant is not accepting digital orders right now');
      }
      const body = await readJson<{
        clientRef: string;
        customerName?: string;
        note?: string;
        lines: { menuItemId: string; quantity: number; note?: string; modifierIds?: string[] }[];
      }>(request);
      return json(
        guestTicket(await svc.orders.createGuestOrder({
          restaurantId: table.restaurantId,
          tableId: table.tableId,
          clientRef: body.clientRef,
          customerLabel: body.customerName,
          note: body.note,
          lines: body.lines,
        })),
      );
    }

    const guestOrder = match(path, '/public/venues/:slug/tables/:token/orders/:orderId');
    if (method === 'GET' && guestOrder) {
      const table = await svc.tables.findByToken(guestOrder.slug, guestOrder.token);
      if (!table) throw new NotFoundException('This QR code is not active');
      const order = await svc.orders.findById(table.restaurantId, guestOrder.orderId);
      if (order.tableId !== table.tableId) throw new NotFoundException('Order not found');
      return json(guestTicket(order));
    }

    if (method === 'GET' && path === '/reports/day') {
      assertRole(user!, 'manager');
      return json(await svc.reports.day(user!.restaurantId, request.nextUrl.searchParams.get('date') ?? undefined));
    }

    if (method === 'GET' && path === '/reports/recent') {
      assertRole(user!, 'manager');
      const days = request.nextUrl.searchParams.get('days');
      return json(await svc.reports.recent(user!.restaurantId, days ? Number(days) : 14));
    }

    if (method === 'GET' && path === '/reports/range') {
      assertRole(user!, 'manager');
      const today = new Date().toISOString().slice(0, 10);
      const from = request.nextUrl.searchParams.get('from') || today;
      const to = request.nextUrl.searchParams.get('to') || today;
      return json(await svc.reports.range(user!.restaurantId, from, to));
    }

    if (method === 'GET' && path === '/billing/status') {
      return json(await svc.billing.status(user!.restaurantId));
    }

    if (PAYMENTS_ENABLED && method === 'POST' && path === '/billing/checkout') {
      throttle(clientKey(request, 'checkout'), 5, 60);
      assertRole(user!, 'owner');
      const body = await readJson<{ successUrl?: string; cancelUrl?: string; interval?: unknown }>(request);
      const appUrl = process.env.APP_PUBLIC_URL ?? 'http://127.0.0.1:43123';
      return json(
        await svc.billing.createCheckout(
          user!,
          body.successUrl ?? `${appUrl}/app/settings?billing=success`,
          body.cancelUrl ?? `${appUrl}/app/settings?billing=cancelled`,
          body.interval,
        ),
      );
    }

    if (PAYMENTS_ENABLED && method === 'GET' && path === '/billing/mock-confirm') {
      const restaurantId = request.nextUrl.searchParams.get('restaurantId') ?? '';
      const redirect = request.nextUrl.searchParams.get('redirect') || '/';
      if (svc.billing.mockMode && restaurantId) {
        const interval = request.nextUrl.searchParams.get('interval');
        await svc.billing.markActive(restaurantId, {
          provider: 'mock',
          billing_interval: interval === 'yearly' ? 'yearly' : 'monthly',
        });
      }
      const dest = redirect.startsWith('http')
        ? redirect
        : new URL(redirect, request.nextUrl.origin).toString();
      return NextResponse.redirect(dest);
    }

    if (PAYMENTS_ENABLED && method === 'POST' && path === '/billing/webhook/stripe') {
      const signature = request.headers.get('stripe-signature') ?? '';
      const raw = Buffer.from(await request.arrayBuffer());
      return json(await svc.billing.handleStripeEvent(raw, signature));
    }

    if ((PAYMENTS_ENABLED || svc.billing.dodoEnabled) && method === 'POST' && path === '/billing/webhook/dodo') {
      const raw = await request.text();
      return json(
        await svc.billing.handleDodoEvent(raw, {
          id: request.headers.get('webhook-id') ?? '',
          timestamp: request.headers.get('webhook-timestamp') ?? '',
          signature: request.headers.get('webhook-signature') ?? '',
        }),
      );
    }

    throw new NotFoundException('Not found');
  } catch (error) {
    return fail(error);
  }
}

function sse(user: AuthenticatedUser, orders: Awaited<ReturnType<typeof getServices>>['orders'], validateSession: () => Promise<void>) {
  const encoder = new TextEncoder();
  const channel = `orders:${user.restaurantId}`;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let onEvent: ((payload: { type: string; order: unknown }) => void) | undefined;
  let closed = false;
  function cleanup() {
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    if (onEvent) orders.events.off(channel, onEvent);
  }

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`));
      const send = async (message: string) => {
        try {
          await validateSession();
          if (!closed) controller.enqueue(encoder.encode(message));
        } catch {
          if (!closed) { cleanup(); controller.close(); }
        }
      };
      onEvent = (payload) => {
        void send(`event: order:${payload.type}\ndata: ${JSON.stringify(payload.order)}\n\n`);
      };
      orders.events.on(channel, onEvent);
      heartbeat = setInterval(() => {
        void send(`: ping ${Date.now()}\n\n`);
      }, 15_000);
    },
    cancel: cleanup,
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { userFromToken } from './jwt';
import { HttpError, UnauthorizedException, NotFoundException, BadRequestException } from './errors';
import { assertRole } from './roles';
import { clientKey, throttle } from './throttle';
import { assertWritableSubscription } from './subscription';
import { getServices } from './services';
import type { AuthenticatedUser, OrderStatus } from './common/types';
import type { Restaurant } from './restaurants/restaurants.service';

const PUBLIC_PATHS = new Set([
  'GET /health',
  'GET /auth/country-presets',
  'POST /auth/signup',
  'POST /auth/login',
  'GET /billing/mock-confirm',
  'POST /billing/webhook/stripe',
]);

function isPublic(method: string, path: string) {
  if (PUBLIC_PATHS.has(`${method} ${path}`)) return true;
  if (path.startsWith('/public/')) return true;
  return false;
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
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

async function requireUser(request: NextRequest): Promise<AuthenticatedUser> {
  const token = bearer(request);
  if (!token) throw new UnauthorizedException('Missing bearer token');
  try {
    return await userFromToken(token);
  } catch {
    throw new UnauthorizedException('Invalid or expired token');
  }
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
    const svc = await getServices();
    const publicRoute = isPublic(method, path);
    const user = publicRoute ? null : await requireUser(request);

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
        paymentsMode: process.env.STRIPE_SECRET_KEY ? 'stripe' : 'mock',
        trialDays: Number(process.env.TRIAL_DAYS ?? 45),
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

    if (method === 'GET' && path === '/auth/me') return json(user);

    if (method === 'GET' && path === '/auth/staff') {
      assertRole(user!, 'manager');
      return json(await svc.auth.listStaff(user!.restaurantId));
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

    if (method === 'PATCH' && path === '/restaurant') {
      assertRole(user!, 'owner');
      const body = await readJson<Record<string, unknown>>(request);
      return json(await svc.restaurants.update(user!, body as Partial<Restaurant>));
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
      const body = await readJson<{ tableNumber: number; label?: string }>(request);
      return json(await svc.tables.create(user!, body));
    }

    const rotate = match(path, '/tables/:id/rotate');
    if (method === 'POST' && rotate) {
      assertRole(user!, 'manager');
      return json(await svc.tables.rotateToken(user!, rotate.id));
    }

    const tableId = match(path, '/tables/:id');
    if (method === 'PATCH' && tableId) {
      assertRole(user!, 'manager');
      const body = await readJson<{ label?: string | null; isActive?: boolean; tableNumber?: number }>(request);
      return json(await svc.tables.update(user!, tableId.id, body));
    }

    if (method === 'GET' && path === '/orders/stream') {
      return sse(user!, svc.orders);
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
        }),
      );
    }

    if (method === 'POST' && path === '/orders') {
      assertRole(user!, 'staff');
      const body = await readJson<{
        clientRef: string;
        tableId: string;
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
      const body = await readJson<{ status: OrderStatus; reason?: string }>(request);
      if (body.status === 'cancelled') assertRole(user!, 'staff');
      return json(await svc.orders.setStatus(user!, orderStatus.id, body.status, body.reason));
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
        orderingEnabled: !billing.accessBlocked,
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
        await svc.orders.createGuestOrder({
          restaurantId: table.restaurantId,
          tableId: table.tableId,
          clientRef: body.clientRef,
          customerLabel: body.customerName,
          note: body.note,
          lines: body.lines,
        }),
      );
    }

    const guestOrder = match(path, '/public/venues/:slug/tables/:token/orders/:orderId');
    if (method === 'GET' && guestOrder) {
      const table = await svc.tables.findByToken(guestOrder.slug, guestOrder.token);
      if (!table) throw new NotFoundException('This QR code is not active');
      const order = await svc.orders.findById(table.restaurantId, guestOrder.orderId);
      if (order.tableId !== table.tableId) throw new NotFoundException('Order not found');
      return json(order);
    }

    if (method === 'GET' && path === '/reports/day') {
      return json(await svc.reports.day(user!.restaurantId, request.nextUrl.searchParams.get('date') ?? undefined));
    }

    if (method === 'GET' && path === '/reports/recent') {
      const days = request.nextUrl.searchParams.get('days');
      return json(await svc.reports.recent(user!.restaurantId, days ? Number(days) : 14));
    }

    if (method === 'GET' && path === '/reports/range') {
      const today = new Date().toISOString().slice(0, 10);
      const from = request.nextUrl.searchParams.get('from') || today;
      const to = request.nextUrl.searchParams.get('to') || today;
      return json(await svc.reports.range(user!.restaurantId, from, to));
    }

    if (method === 'GET' && path === '/billing/status') {
      return json(await svc.billing.status(user!.restaurantId));
    }

    if (method === 'POST' && path === '/billing/checkout') {
      throttle(clientKey(request, 'checkout'), 5, 60);
      assertRole(user!, 'owner');
      const body = await readJson<{ successUrl?: string; cancelUrl?: string }>(request);
      const appUrl = process.env.APP_PUBLIC_URL ?? 'http://127.0.0.1:43123';
      return json(
        await svc.billing.createCheckout(
          user!,
          body.successUrl ?? `${appUrl}/settings?billing=success`,
          body.cancelUrl ?? `${appUrl}/settings?billing=cancelled`,
        ),
      );
    }

    if (method === 'GET' && path === '/billing/mock-confirm') {
      const restaurantId = request.nextUrl.searchParams.get('restaurantId') ?? '';
      const redirect = request.nextUrl.searchParams.get('redirect') || '/';
      if (svc.billing.mockMode && restaurantId) {
        await svc.billing.markActive(restaurantId, { provider: 'mock' });
      }
      const dest = redirect.startsWith('http')
        ? redirect
        : new URL(redirect, request.nextUrl.origin).toString();
      return NextResponse.redirect(dest);
    }

    if (method === 'POST' && path === '/billing/webhook/stripe') {
      const signature = request.headers.get('stripe-signature') ?? '';
      const raw = Buffer.from(await request.arrayBuffer());
      return json(await svc.billing.handleStripeEvent(raw, signature));
    }

    throw new NotFoundException('Not found');
  } catch (error) {
    return fail(error);
  }
}

function sse(user: AuthenticatedUser, orders: Awaited<ReturnType<typeof getServices>>['orders']) {
  const encoder = new TextEncoder();
  const channel = `orders:${user.restaurantId}`;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let onEvent: ((payload: { type: string; order: unknown }) => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`));
      onEvent = (payload) => {
        controller.enqueue(
          encoder.encode(`event: order:${payload.type}\ndata: ${JSON.stringify(payload.order)}\n\n`),
        );
      };
      orders.events.on(channel, onEvent);
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          /* stream closed */
        }
      }, 15_000);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (onEvent) orders.events.off(channel, onEvent);
    },
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

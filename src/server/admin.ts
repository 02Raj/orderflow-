import { createHash, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { NextRequest, NextResponse } from 'next/server';
import { ForbiddenException, NotFoundException, UnauthorizedException, HttpError } from './errors';
import { getServices } from './services';
import { clientKey, throttle } from './throttle';

const SESSION_COOKIE = 'orderflow_platform_admin';
const SESSION_AGE = 4 * 60 * 60;
const AUDIENCE = 'orderflow-platform-admin';
const PAGE_SIZE = 25;

function digest(value: string) {
  return createHash('sha256').update(value).digest();
}

function adminConfig() {
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  const secret = process.env.PLATFORM_ADMIN_SESSION_SECRET;
  const production = process.env.NODE_ENV === 'production';
  if (!email || !password || !secret || secret.length < 32 || (production && password.length < 16)) {
    throw new HttpError(503, 'Platform admin sign-in is unavailable.');
  }
  return { email, password, key: digest(JSON.stringify([AUDIENCE, secret, email, password])) };
}

function response(data: unknown) {
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
}

function sessionResponse(token: string, maxAge: number) {
  const result = response({ ok: true });
  result.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/admin',
    maxAge,
  });
  return result;
}

async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) throw new UnauthorizedException('Sign in to the platform admin portal.');
  const { key, email } = adminConfig();
  try {
    const { payload } = await jwtVerify(token, key, { audience: AUDIENCE, algorithms: ['HS256'] });
    if (payload.sub === email) return;
  } catch {
    // Invalid or expired sessions receive the same response.
  }
  throw new UnauthorizedException('Your admin session has expired.');
}

export async function dispatchAdmin(request: NextRequest, path: string) {
  if (request.method === 'POST') {
    const site = request.headers.get('sec-fetch-site');
    if (site && site !== 'same-origin' && site !== 'none') {
      throw new ForbiddenException('Open the admin portal directly.');
    }
  }

  if (request.method === 'POST' && path === '/admin/login') {
    throttle(clientKey(request, 'platform-admin-login'), 5, 60);
    throttle('platform-admin-login:global', 20, 60);
    const config = adminConfig();
    const body = await request.json().catch(() => null);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!timingSafeEqual(digest(email), digest(config.email)) ||
        !timingSafeEqual(digest(password), digest(config.password))) {
      throw new UnauthorizedException('Invalid admin email or password.');
    }
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setAudience(AUDIENCE)
      .setSubject(config.email)
      .setIssuedAt()
      .setExpirationTime(`${SESSION_AGE}s`)
      .sign(config.key);
    return sessionResponse(token, SESSION_AGE);
  }

  if (request.method === 'POST' && path === '/admin/logout') return sessionResponse('', 0);

  if (request.method === 'GET' && path === '/admin/dashboard') {
    await requireAdmin(request);
    return response(await dashboard(request.nextUrl.searchParams));
  }
  throw new NotFoundException('Not found');
}

async function dashboard(params: URLSearchParams) {
  const { db } = await getServices();
  const view = params.get('view') === 'users' ? 'users' : 'venues';
  const search = (params.get('q') ?? '').trim().toLowerCase().slice(0, 120);
  const status = params.get('status');
  const accountStatus = status === 'enabled' ? true : status === 'disabled' ? false : null;
  const onlyActiveVenues = status === 'active';
  const venueId = params.get('venue') || '';
  const requestedPage = Number(params.get('page') ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0
    ? Math.min(requestedPage, 100000)
    : 1;
  const offset = (page - 1) * PAGE_SIZE;

  const summary = db.one(`
    select
      (select count(*)::int from restaurants where slug is distinct from 'harbour-and-rye') as "clients",
      (select count(distinct o.restaurant_id)::int from orders o join restaurants r on r.id = o.restaurant_id
       where r.slug is distinct from 'harbour-and-rye'
         and o.created_at >= now() - interval '7 days') as "activeVenues",
      (select count(*)::int from users) as "users",
      (select count(*)::int from users where is_active) as "enabledUsers",
      (select count(*)::int from users where is_active and last_login_at >= now() - interval '7 days') as "recentUsers",
      (select count(*)::int from orders o join restaurants r on r.id = o.restaurant_id
       where r.slug is distinct from 'harbour-and-rye'
         and o.created_at >= now() - interval '7 days') as "recentOrders"
  `);

  const directory = view === 'users'
    ? db.many(`
        select u.id, u.full_name as "name", u.email, u.role, u.is_active as "enabled",
               u.last_login_at as "lastLoginAt", r.name as "venueName",
               coalesce(r.slug = 'harbour-and-rye', false) as demo
        from users u join restaurants r on r.id = u.restaurant_id
        where strpos(lower(concat_ws(' ', u.full_name, u.email, u.role, r.name)), $1) > 0
          and ($2::boolean is null or u.is_active = $2)
          and ($3 = '' or r.id::text = $3)
        order by u.created_at desc, u.id
        limit $4 offset $5
      `, [search, accountStatus, venueId, PAGE_SIZE + 1, offset])
    : db.many(`
        select r.id, r.name, r.country_code as "country", r.created_at as "createdAt",
               coalesce(r.slug = 'harbour-and-rye', false) as demo,
               coalesce(
                 case when s.status = 'trialing' and s.trial_ends_at <= now() then 'expired' else s.status end,
                 'unavailable'
               ) as "subscription",
               staff.total as "users", activity.recent as "recentOrders", activity.latest as "lastOrderAt"
        from restaurants r
        left join subscriptions s on s.restaurant_id = r.id
        cross join lateral (
          select count(*)::int as total from users where restaurant_id = r.id
        ) staff
        cross join lateral (
          select count(*) filter (where created_at >= now() - interval '7 days')::int as recent,
                 max(created_at) as latest
          from orders where restaurant_id = r.id
        ) activity
        where strpos(lower(concat_ws(' ', r.name, r.slug, r.country_code)), $1) > 0
          and (not $2::boolean or activity.recent > 0)
        order by demo, r.created_at desc, r.id
        limit $3 offset $4
      `, [search, onlyActiveVenues, PAGE_SIZE + 1, offset]);

  const [totals, rows] = await Promise.all([summary, directory]);
  return { totals, rows: rows.slice(0, PAGE_SIZE), page, hasNext: rows.length > PAGE_SIZE };
}

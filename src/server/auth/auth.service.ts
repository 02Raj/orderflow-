import { createHash, randomBytes, randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { DatabaseService, type QueryClient } from '../database/database.service';
import { AuthenticatedUser, Role } from '../common/types';
import { AuditService } from '../audit/audit.service';
import { resolveRegion } from './tax-regions';
import { COUNTRY_PRESETS, CountryPreset, presetWithRegions, resolvePreset } from './country-presets';
import { BadRequestException, ForbiddenException, HttpError, NotFoundException, UnauthorizedException } from '../errors';
import { Jwt, type VenueSession } from '../jwt';
import { PAYMENTS_ENABLED } from '../../lib/payments';
import type { VenueLocation } from '../../lib/types';

function trialDays(): number {
  const configured = Number(process.env.TRIAL_DAYS ?? 14);
  return Number.isInteger(configured) && configured >= 0 && configured <= 365 ? configured : 14;
}

export interface SignupInput {
  email: string;
  password: string;
  fullName: string;
  restaurantName: string;
  countryCode: string;
  taxRegion?: string;
}

interface UserRow {
  id: string;
  restaurant_id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  session_version: number;
}

export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: Jwt,
    private readonly audit: AuditService,
  ) {}

  countryPresets(): CountryPreset[] {
    return COUNTRY_PRESETS.slice()
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(presetWithRegions);
  }

  async signup(input: SignupInput) {
    const email = input.email.trim().toLowerCase();
    const existing = await this.db.one('select id from users where email = $1', [email]);
    if (existing) throw new BadRequestException('An account with that email already exists');

    const preset = resolvePreset(input.countryCode);
    const region = resolveRegion(preset.countryCode, input.taxRegion);
    const taxRateBp = region?.taxRateBp ?? preset.taxRateBp;
    const taxLabel = region?.taxLabel ?? preset.taxLabel;
    const timezone = region?.timezone ?? preset.timezone;
    const restaurantId = randomUUID();
    const userId = randomUUID();
    const trialEndsAt = new Date(Date.now() + trialDays() * 24 * 60 * 60 * 1000);
    const slug = await this.uniqueSlug(input.restaurantName);

    await this.db.query(
      `insert into restaurants (id, name, slug, country_code, currency, locale, timezone, tax_label, tax_rate_bp, tax_inclusive, tax_region)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        restaurantId,
        input.restaurantName.trim(),
        slug,
        preset.countryCode,
        preset.currency,
        preset.locale,
        timezone,
        taxLabel,
        taxRateBp,
        preset.taxInclusive,
        region?.code ?? null,
      ],
    );

    await this.db.query(
      `insert into users (id, restaurant_id, email, password_hash, full_name, role)
       values ($1, $2, $3, $4, $5, 'owner')`,
      [userId, restaurantId, email, await bcrypt.hash(input.password, 10), input.fullName.trim()],
    );

    await this.db.query(
      `insert into subscriptions (id, restaurant_id, status, plan, trial_ends_at)
       values ($1, $2, 'trialing', 'starter', $3)`,
      [randomUUID(), restaurantId, trialEndsAt.toISOString()],
    );

    await this.seedTables(this.db, restaurantId);

    await this.audit.record({
      restaurantId,
      userId,
      action: 'signup',
      entity: 'restaurant',
      entityId: restaurantId,
      metadata: { countryCode: preset.countryCode, taxRegion: region?.code ?? null, slug },
    });

    return this.issueToken({
      id: userId,
      restaurantId,
      email,
      fullName: input.fullName.trim(),
      role: 'owner',
    });
  }

  private async seedTables(db: QueryClient, restaurantId: string) {
    const tableValues: string[] = [];
    const tableParams: unknown[] = [restaurantId];
    for (let n = 1; n <= 8; n++) {
      const idIdx = tableParams.push(randomUUID());
      const numIdx = tableParams.push(n);
      const qrIdx = tableParams.push(randomUUID());
      tableValues.push(`($${idIdx}, $1, $${numIdx}, $${qrIdx})`);
    }
    await db.query(
      `insert into dining_tables (id, restaurant_id, table_number, qr_token) values ${tableValues.join(', ')}`,
      tableParams,
    );
  }

  async listLocations(actor: VenueSession) {
    return this.db.many<VenueLocation>(
      `select r.id, r.name, r.country_code as "countryCode", r.currency, r.tax_region as "taxRegion",
              case when $4 and s.status = 'trialing' and s.trial_ends_at <= now() then 'expired'
                   else s.status end as "billingStatus", s.billing_interval as "billingInterval"
       from users u
       join restaurants r on r.id = u.restaurant_id or (u.role = 'owner' and r.business_root_id = u.restaurant_id)
       left join subscriptions s on s.restaurant_id = r.id
       where u.id = $1 and u.is_active and u.session_version = $2
       order by (r.id = $3) desc, r.created_at, r.id`,
      [actor.id, actor.sessionVersion, actor.restaurantId, PAYMENTS_ENABLED],
    );
  }

  async switchLocation(actor: VenueSession, locationId: unknown) {
    if (typeof locationId !== 'string' || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(locationId)) {
      throw new BadRequestException('Choose a valid location.');
    }
    if (!await this.sessionIsCurrent(actor.id, locationId, actor.sessionVersion)) {
      throw new NotFoundException('Location not found.');
    }
    const { id, email, fullName, role, sessionVersion, expiresAt } = actor;
    return this.issueToken({ id, email, fullName, role, restaurantId: locationId.toLowerCase() }, sessionVersion, expiresAt);
  }

  async createLocation(actor: VenueSession, input: { name?: unknown; countryCode?: unknown; taxRegion?: unknown } | null) {
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 100) throw new BadRequestException('Use a location name between 1 and 100 characters.');
    const preset = COUNTRY_PRESETS.find((country) => country.countryCode === input?.countryCode);
    if (!preset) throw new BadRequestException('Choose a supported country.');
    const region = typeof input?.taxRegion === 'string' && input.taxRegion
      ? resolveRegion(preset.countryCode, input.taxRegion)
      : undefined;
    if ((input?.taxRegion && !region) || (presetWithRegions(preset).regions?.length && !region)) {
      throw new BadRequestException('Choose the region for this location.');
    }
    const restaurantId = randomUUID();
    const slug = await this.uniqueSlug(name);
    await this.db.transaction(async (tx) => {
      const owner = await tx.one<{ restaurant_id: string; email: string }>(
        `select u.restaurant_id, u.email from users u join restaurants root on root.id = u.restaurant_id
         where u.id = $1 and u.is_active and u.role = 'owner' and u.session_version = $2
         and root.business_root_id is null for update of root`,
        [actor.id, actor.sessionVersion],
      );
      if (!owner || owner.email === 'owner@harbourandrye.demo') {
        throw new ForbiddenException('Only a business owner can add locations to their own account.');
      }
      if (await tx.one(
        'select id from restaurants where (id = $1 or business_root_id = $1) and lower(name) = lower($2)',
        [owner.restaurant_id, name],
      )) throw new BadRequestException('This business already has a location with that name.');

      await tx.query(
        `insert into restaurants (id, name, slug, country_code, currency, locale, timezone, tax_label,
                                  tax_rate_bp, tax_inclusive, tax_region, business_root_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [restaurantId, name, slug, preset.countryCode, preset.currency, preset.locale,
          region?.timezone ?? preset.timezone, region?.taxLabel ?? preset.taxLabel,
          region?.taxRateBp ?? preset.taxRateBp, preset.taxInclusive, region?.code ?? null, owner.restaurant_id],
      );
      await tx.query(
        `insert into subscriptions (id, restaurant_id, status, plan, trial_ends_at)
         values ($1, $2, 'trialing', 'starter', $3)`,
        [randomUUID(), restaurantId, new Date(Date.now() + trialDays() * 86400000).toISOString()],
      );
      await this.seedTables(tx, restaurantId);
    });
    await this.audit.record({
      restaurantId, userId: actor.id, action: 'location.create', entity: 'restaurant', entityId: restaurantId,
    });
    return { id: restaurantId, name };
  }

  async login(email: string, password: string) {
    const user = await this.db.one<UserRow>('select * from users where email = $1', [
      email.trim().toLowerCase(),
    ]);
    if (!user || !user.is_active) throw new UnauthorizedException('Invalid email or password');

    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) throw new UnauthorizedException('Invalid email or password');

    await this.db.query('update users set last_login_at = now() where id = $1', [user.id]);
    return this.issueToken({
      id: user.id,
      restaurantId: user.restaurant_id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
    }, user.session_version);
  }

  async sessionIsCurrent(id: string, restaurantId: string, version: number) {
    return !!await this.db.one(
      `select u.id from users u join restaurants r on r.id = $2
       where u.id = $1 and u.is_active and u.session_version = $3
       and (u.restaurant_id = r.id or (u.role = 'owner' and r.business_root_id = u.restaurant_id))`,
      [id, restaurantId, version],
    );
  }

  async setStaffActive(actor: AuthenticatedUser, id: string, active: boolean) {
    if (typeof active !== 'boolean' || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)) {
      throw new BadRequestException('Invalid staff account or status.');
    }
    const row = await this.db.one(
      `update users set is_active = $3, session_version = session_version + case when is_active = $3 then 0 else 1 end
       where id = $1 and restaurant_id = $2 and role <> 'owner' returning id`,
      [id, actor.restaurantId, active],
    );
    if (!row) throw new NotFoundException('Staff account not found.');
    await this.audit.record({ restaurantId: actor.restaurantId, userId: actor.id, action: active ? 'staff.enable' : 'staff.disable', entity: 'user', entityId: id });
    return { ok: true };
  }

  async createStaff(
    actor: AuthenticatedUser,
    input: { email: string; password: string; fullName: string; role: 'manager' | 'staff' | 'kitchen' },
  ) {
    if (!['manager', 'staff', 'kitchen'].includes(input?.role)) {
      throw new BadRequestException('Choose a valid staff role.');
    }
    const email = input.email.trim().toLowerCase();
    const existing = await this.db.one('select id from users where email = $1', [email]);
    if (existing) throw new BadRequestException('An account with that email already exists');

    const id = randomUUID();
    await this.db.query(
      `insert into users (id, restaurant_id, email, password_hash, full_name, role)
       values ($1, $2, $3, $4, $5, $6)`,
      [id, actor.restaurantId, email, await bcrypt.hash(input.password, 10), input.fullName.trim(), input.role],
    );
    await this.audit.record({
      restaurantId: actor.restaurantId,
      userId: actor.id,
      action: 'staff.create',
      entity: 'user',
      entityId: id,
      metadata: { role: input.role },
    });
    return { id, email, fullName: input.fullName.trim(), role: input.role };
  }

  async listStaff(restaurantId: string) {
    return this.db.many(
      `select id, email, full_name as "fullName", role, is_active as "isActive"
       from users where restaurant_id = $1 order by created_at`,
      [restaurantId],
    );
  }

  async changePassword(actor: AuthenticatedUser, currentPassword: string, newPassword: string) {
    if (newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters');
    }
    const user = await this.db.one<UserRow>('select * from users where id = $1', [actor.id]);
    if (!user || !user.is_active) throw new UnauthorizedException('Account not found');

    const matches = await bcrypt.compare(currentPassword, user.password_hash);
    if (!matches) throw new UnauthorizedException('Current password is incorrect');

    const hash = await bcrypt.hash(newPassword, 10);
    const updated = await this.db.transaction(async (tx) => {
      const row = await tx.one<{ session_version: number }>(
        `update users set password_hash = $2, session_version = session_version + 1
         where id = $1 and password_hash = $3 and is_active returning session_version`,
        [actor.id, hash, user.password_hash],
      );
      if (!row) throw new UnauthorizedException('Account changed. Sign in again.');
      await tx.query('update password_reset_tokens set used_at = now() where user_id = $1 and used_at is null', [actor.id]);
      return row;
    });
    await this.audit.record({
      restaurantId: actor.restaurantId,
      userId: actor.id,
      action: 'password.change',
      entity: 'user',
      entityId: actor.id,
    });
    const session = await this.issueToken({
      id: user.id, restaurantId: actor.restaurantId, email: user.email, fullName: user.full_name, role: user.role,
    }, updated.session_version);
    return { ok: true, ...session };
  }

  async requestPasswordReset(emailInput: string) {
    const production = process.env.NODE_ENV === 'production';
    const key = process.env.RESEND_API_KEY;
    const from = process.env.PASSWORD_RESET_FROM;
    const origin = process.env.APP_PUBLIC_URL;
    if (production && (!key || !from || !origin?.startsWith('https://'))) {
      throw new HttpError(503, 'Password reset email is unavailable. Contact venue support.');
    }
    const email = emailInput.trim().toLowerCase();
    const user = await this.db.one<UserRow>('select * from users where email = $1', [email]);
    const genericMessage = 'If an account exists for that email, check your inbox for a password reset link.';

    if (!user || !user.is_active) {
      return { ok: true, message: genericMessage };
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    await this.db.query(
      `insert into password_reset_tokens (id, user_id, token_hash, expires_at)
       values ($1, $2, $3, $4)`,
      [randomUUID(), user.id, tokenHash, expiresAt],
    );

    const resetUrl = new URL(`/reset-password?token=${rawToken}`, origin ?? 'http://127.0.0.1:43123').toString();
    if (production) {
      try {
        const result = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify({
            from, to: [email], subject: 'Reset your OrderNFlow password',
            text: `Reset your password within 30 minutes: ${resetUrl}\nIf you did not request this, ignore this email.`,
          }),
        });
        if (!result.ok) throw new Error('Provider declined reset email');
      } catch {
        await this.db.query('delete from password_reset_tokens where token_hash = $1', [tokenHash]);
        console.warn('Password reset email delivery failed.');
      }
    }

    return {
      ok: true,
      message: genericMessage,
      ...(process.env.NODE_ENV !== 'production' ? { devResetUrl: resetUrl } : {}),
    };
  }

  async resetPassword(rawToken: string, newPassword: string) {
    if (!rawToken || newPassword.length < 8) {
      throw new BadRequestException('Valid token and an 8+ character password are required');
    }
    const tokenHash = createHash('sha256').update(rawToken.trim()).digest('hex');
    const row = await this.db.one<{
      id: string;
      user_id: string;
      expires_at: string;
      used_at: string | null;
    }>(
      'select id, user_id, expires_at, used_at from password_reset_tokens where token_hash = $1',
      [tokenHash],
    );

    if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) {
      throw new BadRequestException('This reset link is invalid or has expired');
    }

    const user = await this.db.one<UserRow>('select * from users where id = $1', [row.user_id]);
    if (!user || !user.is_active) {
      throw new BadRequestException('Account not found');
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await this.db.transaction(async (tx) => {
      const locked = await tx.one('select id from users where id = $1 and is_active for update', [user.id]);
      if (!locked) throw new BadRequestException('Account not found');
      const claimed = await tx.one(
        'update password_reset_tokens set used_at = now() where id = $1 and used_at is null and expires_at > now() returning id',
        [row.id],
      );
      if (!claimed) throw new BadRequestException('This reset link is invalid or has expired');
      await tx.query('update users set password_hash = $2, session_version = session_version + 1 where id = $1', [user.id, hash]);
      await tx.query('update password_reset_tokens set used_at = now() where user_id = $1 and used_at is null', [user.id]);
    });
    await this.audit.record({
      restaurantId: user.restaurant_id,
      userId: user.id,
      action: 'password.reset',
      entity: 'user',
      entityId: user.id,
    });
    return { ok: true };
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || 'venue';
    for (let i = 0; i < 8; i++) {
      const slug = i === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
      const clash = await this.db.one('select id from restaurants where slug = $1', [slug]);
      if (!clash) return slug;
    }
    return `${base}-${randomUUID().slice(0, 8)}`;
  }

  private async issueToken(user: AuthenticatedUser, sessionVersion = 0, expiresAt?: number) {
    const token = await this.jwt.signAsync({
      sub: user.id,
      restaurant_id: user.restaurantId,
      email: user.email,
      name: user.fullName,
      role: user.role,
      session_version: sessionVersion,
      app_metadata: { restaurant_id: user.restaurantId, role: user.role },
    }, expiresAt);
    return { token, user };
  }
}

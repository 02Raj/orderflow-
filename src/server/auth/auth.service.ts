import { createHash, randomBytes, randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from '../database/database.service';
import { AuthenticatedUser, Role } from '../common/types';
import { AuditService } from '../audit/audit.service';
import { resolveRegion } from './tax-regions';
import { COUNTRY_PRESETS, CountryPreset, presetWithRegions, resolvePreset } from './country-presets';
import { BadRequestException, HttpError, NotFoundException, UnauthorizedException } from '../errors';
import { Jwt } from '../jwt';

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

    const tableValues: string[] = [];
    const tableParams: unknown[] = [restaurantId];
    for (let n = 1; n <= 8; n++) {
      const idIdx = tableParams.push(randomUUID());
      const numIdx = tableParams.push(n);
      const qrIdx = tableParams.push(randomUUID());
      tableValues.push(`($${idIdx}, $1, $${numIdx}, $${qrIdx})`);
    }
    await this.db.query(
      `insert into dining_tables (id, restaurant_id, table_number, qr_token) values ${tableValues.join(', ')}`,
      tableParams,
    );

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
      'select id from users where id = $1 and restaurant_id = $2 and is_active and session_version = $3',
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
      id: user.id, restaurantId: user.restaurant_id, email: user.email, fullName: user.full_name, role: user.role,
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

  private async issueToken(user: AuthenticatedUser, sessionVersion = 0) {
    const token = await this.jwt.signAsync({
      sub: user.id,
      restaurant_id: user.restaurantId,
      email: user.email,
      name: user.fullName,
      role: user.role,
      session_version: sessionVersion,
      app_metadata: { restaurant_id: user.restaurantId, role: user.role },
    });
    return { token, user };
  }
}

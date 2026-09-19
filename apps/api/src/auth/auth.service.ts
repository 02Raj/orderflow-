import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from '../database/database.service';
import { AuthenticatedUser, Role } from '../common/types';
import { AuditService } from '../audit/audit.service';
import { resolveRegion } from './tax-regions';
import { COUNTRY_PRESETS, CountryPreset, presetWithRegions, resolvePreset } from './country-presets';

const TRIAL_DAYS = Number(process.env.TRIAL_DAYS ?? 45);

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
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
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
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
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

    for (let n = 1; n <= 8; n++) {
      await this.db.query(
        `insert into dining_tables (id, restaurant_id, table_number, qr_token)
         values ($1, $2, $3, $4)`,
        [randomUUID(), restaurantId, n, randomUUID()],
      );
    }

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

    return this.issueToken({
      id: user.id,
      restaurantId: user.restaurant_id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
    });
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

  private async issueToken(user: AuthenticatedUser) {
    const token = await this.jwt.signAsync({
      sub: user.id,
      restaurant_id: user.restaurantId,
      email: user.email,
      name: user.fullName,
      role: user.role,
      app_metadata: { restaurant_id: user.restaurantId, role: user.role },
    });
    return { token, user };
  }
}

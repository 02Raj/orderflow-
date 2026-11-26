import { BadRequestException, NotFoundException } from '../errors';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/types';
import { resolveRegion } from '../auth/tax-regions';

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  countryCode: string;
  currency: string;
  locale: string;
  timezone: string;
  taxLabel: string;
  taxRateBp: number;
  taxInclusive: boolean;
  taxRegion: string | null;
  taxNumber: string | null;
  phone: string | null;
  address: string | null;
  orderingPaused: boolean;
  openingTime: string | null;
  closingTime: string | null;
  kitchenTargetMinutes: number | null;
  kitchenUrgentMinutes: number | null;
}

const SELECT = `
  select id,
         name,
         slug,
         country_code as "countryCode",
         currency,
         locale,
         timezone,
         tax_label as "taxLabel",
         tax_rate_bp as "taxRateBp",
         tax_inclusive as "taxInclusive",
         tax_region as "taxRegion",
         tax_number as "taxNumber",
         phone,
         address,
         ordering_paused as "orderingPaused",
         opening_time as "openingTime",
         closing_time as "closingTime",
         kitchen_target_minutes as "kitchenTargetMinutes",
         kitchen_urgent_minutes as "kitchenUrgentMinutes"
  from restaurants`;

export class RestaurantsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async findById(id: string): Promise<Restaurant> {
    const restaurant = await this.db.one<Restaurant>(`${SELECT} where id = $1`, [id]);
    if (!restaurant) throw new NotFoundException('Restaurant not found');
    return restaurant;
  }

  async setKitchenTargets(user: AuthenticatedUser, target: number, urgent: number) {
    if (!Number.isInteger(target) || !Number.isInteger(urgent) || target < 2 || urgent > 45 || urgent < target + 2) {
      throw new BadRequestException('Use a target of at least 2 minutes and an urgent alert 2 or more minutes later, up to 45 minutes.');
    }
    await this.db.query('update restaurants set kitchen_target_minutes = $2, kitchen_urgent_minutes = $3 where id = $1',
      [user.restaurantId, target, urgent]);
    return this.findById(user.restaurantId);
  }

  async update(user: AuthenticatedUser, patch: Partial<Restaurant>): Promise<Restaurant> {
    const current = await this.findById(user.restaurantId);
    if (patch.taxRegion) {
      const region = resolveRegion(current.countryCode, patch.taxRegion);
      if (region) {
        if (patch.taxRateBp === undefined) patch.taxRateBp = region.taxRateBp;
        if (patch.taxLabel === undefined && region.taxLabel) patch.taxLabel = region.taxLabel;
        if (patch.timezone === undefined && region.timezone) patch.timezone = region.timezone;
      }
    }
    const columns: Record<string, string> = {
      name: 'name',
      countryCode: 'country_code',
      currency: 'currency',
      locale: 'locale',
      timezone: 'timezone',
      taxLabel: 'tax_label',
      taxRateBp: 'tax_rate_bp',
      taxInclusive: 'tax_inclusive',
      taxRegion: 'tax_region',
      taxNumber: 'tax_number',
      phone: 'phone',
      address: 'address',
      orderingPaused: 'ordering_paused',
      openingTime: 'opening_time',
      closingTime: 'closing_time',
    };

    const updates: string[] = [];
    const values: unknown[] = [];
    for (const [key, value] of Object.entries(patch)) {
      const column = columns[key];
      if (!column || value === undefined) continue;
      if ((key === 'openingTime' || key === 'closingTime') && value !== null &&
          (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))) {
        throw new BadRequestException('Opening and closing times must use HH:mm');
      }
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    }

    if (updates.length) {
      values.push(user.restaurantId);
      await this.db.query(
        `update restaurants set ${updates.join(', ')} where id = $${values.length}`,
        values,
      );
      await this.audit.record({
        restaurantId: user.restaurantId,
        userId: user.id,
        action: 'settings.update',
        entity: 'restaurant',
        entityId: user.restaurantId,
        metadata: patch as Record<string, unknown>,
      });
    }

    return this.findById(user.restaurantId);
  }
}

export function isOrderingOpen(restaurant: Pick<Restaurant, 'orderingPaused' | 'openingTime' | 'closingTime' | 'timezone'>, now = new Date()): boolean {
  if (restaurant.orderingPaused) return false;
  if (!restaurant.openingTime || !restaurant.closingTime) return true;
  const localTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: restaurant.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  const open = restaurant.openingTime;
  const close = restaurant.closingTime;
  if (open === close) return true;
  return open < close ? localTime >= open && localTime < close : localTime >= open || localTime < close;
}

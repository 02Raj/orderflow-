import { Injectable, NotFoundException } from '@nestjs/common';
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
         address
  from restaurants`;

@Injectable()
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
    };

    const updates: string[] = [];
    const values: unknown[] = [];
    for (const [key, value] of Object.entries(patch)) {
      const column = columns[key];
      if (!column || value === undefined) continue;
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

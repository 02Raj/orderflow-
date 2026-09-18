import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { businessDateFor } from '../orders/orders.service';

@Injectable()
export class ReportsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly restaurants: RestaurantsService,
  ) {}

  async day(restaurantId: string, date?: string) {
    const restaurant = await this.restaurants.findById(restaurantId);
    const businessDate = date ?? businessDateFor(new Date(), restaurant.timezone);

    const totals = await this.db.one<{
      orderCount: number;
      grossMinor: number;
      netMinor: number;
      taxMinor: number;
    }>(
      `select count(*)::int as "orderCount",
              coalesce(sum(total_minor), 0)::int as "grossMinor",
              coalesce(sum(subtotal_minor), 0)::int as "netMinor",
              coalesce(sum(tax_minor), 0)::int as "taxMinor"
       from orders
       where restaurant_id = $1 and business_date = $2 and status not in ('cancelled', 'void')`,
      [restaurantId, businessDate],
    );

    const cancelled = await this.db.one<{ count: number; amountMinor: number }>(
      `select count(*)::int as count, coalesce(sum(total_minor), 0)::int as "amountMinor"
       from orders where restaurant_id = $1 and business_date = $2 and status in ('cancelled', 'void')`,
      [restaurantId, businessDate],
    );

    const topItems = await this.db.many<{ name: string; quantity: number; amountMinor: number }>(
      `select oi.name_snapshot as name,
              sum(oi.quantity)::int as quantity,
              sum(oi.line_total_minor)::int as "amountMinor"
       from order_items oi
       join orders o on o.id = oi.order_id
       where oi.restaurant_id = $1 and o.business_date = $2 and o.status not in ('cancelled', 'void')
       group by oi.name_snapshot
       order by quantity desc
       limit 10`,
      [restaurantId, businessDate],
    );

    const byStatus = await this.db.many<{ status: string; count: number }>(
      `select status, count(*)::int as count
       from orders where restaurant_id = $1 and business_date = $2
       group by status`,
      [restaurantId, businessDate],
    );

    const peakHours = await this.db.many<{ hour: number; count: number }>(
      `select extract(hour from created_at)::int as hour, count(*)::int as count
       from orders
       where restaurant_id = $1 and business_date = $2 and status not in ('cancelled', 'void')
       group by 1 order by 1`,
      [restaurantId, businessDate],
    );

    const orderCount = totals?.orderCount ?? 0;
    const grossMinor = totals?.grossMinor ?? 0;

    return {
      businessDate,
      currency: restaurant.currency,
      locale: restaurant.locale,
      taxLabel: restaurant.taxLabel,
      orderCount,
      grossMinor,
      netMinor: totals?.netMinor ?? 0,
      taxMinor: totals?.taxMinor ?? 0,
      averageTicketMinor: orderCount ? Math.round(grossMinor / orderCount) : 0,
      topItems,
      cancelled: cancelled ?? { count: 0, amountMinor: 0 },
      byStatus,
      peakHours,
    };
  }

  async recent(restaurantId: string, days = 14) {
    return this.db.many(
      `select business_date as "businessDate",
              count(*)::int as "orderCount",
              coalesce(sum(total_minor), 0)::int as "grossMinor"
       from orders
       where restaurant_id = $1 and status not in ('cancelled', 'void')
         and business_date >= (current_date - $2::int)
       group by business_date
       order by business_date`,
      [restaurantId, days],
    );
  }
}

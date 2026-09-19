import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';
import { RestaurantsService } from '../restaurants/restaurants.service';
import { AuthenticatedUser, OrderStatus } from '../common/types';
import { computeTotals } from '../common/money';

export interface CreateOrderLine {
  menuItemId: string;
  quantity: number;
  note?: string | null;
  modifierIds?: string[];
}

export interface GuestOrderInput {
  restaurantId: string;
  tableId: string;
  clientRef: string;
  customerLabel?: string | null;
  note?: string | null;
  lines: CreateOrderLine[];
}

@Injectable()
export class OrdersService {
  readonly events = new EventEmitter();

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly restaurants: RestaurantsService,
  ) {
    this.events.setMaxListeners(200);
  }

  async createGuestOrder(input: GuestOrderInput) {
    if (!input.lines?.length) throw new BadRequestException('Add at least one item');

    const existing = await this.db.one<{ id: string }>(
      'select id from orders where restaurant_id = $1 and client_ref = $2',
      [input.restaurantId, input.clientRef],
    );
    if (existing) return this.findById(input.restaurantId, existing.id);

    const table = await this.db.one<{ id: string; table_number: number }>(
      'select id, table_number from dining_tables where id = $1 and restaurant_id = $2 and is_active = true',
      [input.tableId, input.restaurantId],
    );
    if (!table) throw new BadRequestException('That table is not taking orders');

    const restaurant = await this.restaurants.findById(input.restaurantId);
    const resolvedLines = [];
    let gross = 0;

    for (const line of input.lines) {
      const item = await this.db.one<{
        id: string;
        name: string;
        price_minor: number;
        is_available: boolean;
        archived_at: string | null;
      }>(
        'select id, name, price_minor, is_available, archived_at from menu_items where id = $1 and restaurant_id = $2',
        [line.menuItemId, input.restaurantId],
      );
      if (!item || item.archived_at || !item.is_available) {
        throw new BadRequestException('One of the items is no longer available');
      }

      const modifiers = line.modifierIds?.length
        ? await this.db.many<{ id: string; name: string; price_adjustment_minor: number }>(
            `select id, name, price_adjustment_minor from menu_modifiers
             where menu_item_id = $1 and is_active = true and id = any($2::uuid[])`,
            [item.id, line.modifierIds],
          )
        : [];

      const quantity = Math.max(1, Math.round(line.quantity));
      const unit = item.price_minor + modifiers.reduce((sum, m) => sum + m.price_adjustment_minor, 0);
      gross += unit * quantity;
      resolvedLines.push({
        menuItemId: item.id,
        name: item.name,
        unitPriceMinor: unit,
        quantity,
        note: line.note ?? null,
        modifiers,
      });
    }

    const totals = computeTotals(gross, {
      taxRateBp: restaurant.taxRateBp,
      taxInclusive: restaurant.taxInclusive,
    });
    const createdAt = new Date();
    const businessDate = businessDateFor(createdAt, restaurant.timezone);
    const orderNumber = await this.nextOrderNumber(input.restaurantId, businessDate);
    const orderId = randomUUID();

    await this.db.query(
      `insert into orders (id, restaurant_id, table_id, order_number, business_date, channel, status,
                           customer_label, subtotal_minor, tax_minor, total_minor, paid_minor,
                           note, client_ref, created_at)
       values ($1, $2, $3, $4, $5, 'qr', 'new', $6, $7, $8, $9, 0, $10, $11, $12)`,
      [
        orderId,
        input.restaurantId,
        input.tableId,
        orderNumber,
        businessDate,
        input.customerLabel?.trim() || `Table ${table.table_number}`,
        totals.subtotalMinor,
        totals.taxMinor,
        totals.totalMinor,
        input.note ?? null,
        input.clientRef,
        createdAt.toISOString(),
      ],
    );

    for (const line of resolvedLines) {
      const orderItemId = randomUUID();
      await this.db.query(
        `insert into order_items (id, order_id, restaurant_id, menu_item_id, name_snapshot,
                                  unit_price_minor, quantity, line_total_minor, note, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')`,
        [
          orderItemId,
          orderId,
          input.restaurantId,
          line.menuItemId,
          line.name,
          line.unitPriceMinor,
          line.quantity,
          line.unitPriceMinor * line.quantity,
          line.note,
        ],
      );
      for (const modifier of line.modifiers) {
        await this.db.query(
          `insert into order_item_modifiers (id, order_item_id, modifier_name, price_adjustment_minor)
           values ($1, $2, $3, $4)`,
          [randomUUID(), orderItemId, modifier.name, modifier.price_adjustment_minor],
        );
      }
    }

    const saved = await this.findById(input.restaurantId, orderId);
    this.events.emit(`orders:${input.restaurantId}`, { type: 'created', order: saved });
    return saved;
  }

  async createStaffOrder(user: AuthenticatedUser, input: GuestOrderInput & { tableId: string }) {
    return this.createGuestOrder({ ...input, restaurantId: user.restaurantId });
  }

  async setStatus(user: AuthenticatedUser, orderId: string, status: OrderStatus, reason?: string) {
    const order = await this.findById(user.restaurantId, orderId);
    const allowed = allowedTransitions(order.status as OrderStatus);
    if (!allowed.includes(status)) {
      throw new BadRequestException(`Cannot move an order from ${order.status} to ${status}`);
    }

    const stamp =
      status === 'accepted'
        ? 'accepted_at'
        : status === 'preparing'
          ? 'preparing_at'
          : status === 'ready'
            ? 'ready_at'
            : status === 'served'
              ? 'served_at'
              : status === 'cancelled'
                ? 'voided_at'
                : null;

    await this.db.query(
      `update orders
       set status = $1,
           updated_at = now(),
           rejection_reason = coalesce($2, rejection_reason),
           void_reason = case when $1 = 'cancelled' then $2 else void_reason end
           ${stamp ? `, ${stamp} = now()` : ''}
           ${status === 'served' || status === 'cancelled' ? ', closed_at = now()' : ''}
       where id = $3 and restaurant_id = $4`,
      [status, reason ?? null, orderId, user.restaurantId],
    );

    await this.audit.record({
      restaurantId: user.restaurantId,
      userId: user.id,
      action: `order.${status}`,
      entity: 'order',
      entityId: orderId,
      metadata: { from: order.status, reason: reason ?? null },
    });

    const saved = await this.findById(user.restaurantId, orderId);
    this.events.emit(`orders:${user.restaurantId}`, { type: 'updated', order: saved });
    return saved;
  }

  async setItemStatus(
    user: AuthenticatedUser,
    orderId: string,
    itemId: string,
    status: 'pending' | 'preparing' | 'ready',
  ) {
    const order = await this.findById(user.restaurantId, orderId);
    const item = order.items.find((row) => row.id === itemId);
    if (!item) throw new NotFoundException('Order item not found');
    const allowed = allowedItemTransitions(item.status);
    if (!allowed.includes(status)) {
      throw new BadRequestException(`Cannot move an item from ${item.status} to ${status}`);
    }

    await this.db.query(
      `update order_items set status = $1
       where id = $2 and order_id = $3 and restaurant_id = $4`,
      [status, itemId, orderId, user.restaurantId],
    );

    await this.audit.record({
      restaurantId: user.restaurantId,
      userId: user.id,
      action: `order.item.${status}`,
      entity: 'order_item',
      entityId: itemId,
      metadata: { orderId, from: item.status },
    });

    const saved = await this.findById(user.restaurantId, orderId);
    this.events.emit(`orders:${user.restaurantId}`, { type: 'updated', order: saved });
    return saved;
  }

  async findById(restaurantId: string, orderId: string) {
    const order = await this.db.one<OrderRow>(`${ORDER_SELECT} where o.id = $1 and o.restaurant_id = $2`, [
      orderId,
      restaurantId,
    ]);
    if (!order) throw new NotFoundException('Order not found');

    const items = await this.db.many<OrderItemRow>(
      `select id, menu_item_id as "menuItemId", name_snapshot as "name",
              unit_price_minor as "unitPriceMinor", quantity, line_total_minor as "lineTotalMinor",
              note, status
       from order_items where order_id = $1 order by created_at`,
      [orderId],
    );

    const modifiers = items.length
      ? await this.db.many<{ orderItemId: string; name: string; priceAdjustmentMinor: number }>(
          `select oi.id as "orderItemId", m.modifier_name as name, m.price_adjustment_minor as "priceAdjustmentMinor"
           from order_item_modifiers m
           join order_items oi on oi.id = m.order_item_id
           where oi.order_id = $1`,
          [orderId],
        )
      : [];

    return {
      ...order,
      items: items.map((item) => ({
        ...item,
        modifiers: modifiers.filter((m) => m.orderItemId === item.id),
      })),
    };
  }

  async list(
    restaurantId: string,
    filter: { status?: string; businessDate?: string; limit?: number; activeOnly?: boolean },
  ) {
    const conditions = ['o.restaurant_id = $1'];
    const values: unknown[] = [restaurantId];

    if (filter.activeOnly) {
      conditions.push(`o.status in ('new','accepted','preparing','ready')`);
    } else if (filter.status && filter.status !== 'all') {
      values.push(filter.status);
      conditions.push(`o.status = $${values.length}`);
    }
    if (filter.businessDate) {
      values.push(filter.businessDate);
      conditions.push(`o.business_date = $${values.length}`);
    }
    values.push(Math.min(filter.limit ?? 80, 200));

    const orders = await this.db.many<OrderRow>(
      `${ORDER_SELECT} where ${conditions.join(' and ')} order by o.created_at desc limit $${values.length}`,
      values,
    );
    if (!orders.length) return [];

    const items = await this.db.many<OrderItemRow & { orderId: string }>(
      `select id, order_id as "orderId", name_snapshot as name, quantity, note, status,
              unit_price_minor as "unitPriceMinor", line_total_minor as "lineTotalMinor"
       from order_items where order_id = any($1::uuid[])`,
      [orders.map((o) => o.id)],
    );
    const modifiers = await this.db.many<{ orderItemId: string; name: string }>(
      `select order_item_id as "orderItemId", modifier_name as name
       from order_item_modifiers where order_item_id = any($1::uuid[])`,
      [items.map((i) => i.id)],
    );

    return orders.map((order) => ({
      ...order,
      items: items
        .filter((item) => item.orderId === order.id)
        .map((item) => ({
          ...item,
          modifiers: modifiers.filter((m) => m.orderItemId === item.id),
        })),
    }));
  }

  async currentBusinessDate(restaurantId: string) {
    const restaurant = await this.restaurants.findById(restaurantId);
    return businessDateFor(new Date(), restaurant.timezone);
  }

  private async nextOrderNumber(restaurantId: string, businessDate: string): Promise<number> {
    const row = await this.db.one<{ next: number }>(
      `select coalesce(max(order_number), 0) + 1 as next from orders
       where restaurant_id = $1 and business_date = $2`,
      [restaurantId, businessDate],
    );
    return Number(row?.next ?? 1);
  }
}

function allowedItemTransitions(from: string): Array<'pending' | 'preparing' | 'ready'> {
  switch (from) {
    case 'pending':
      return ['preparing'];
    case 'preparing':
      return ['ready'];
    default:
      return [];
  }
}

function allowedTransitions(from: OrderStatus): OrderStatus[] {
  switch (from) {
    case 'new':
      return ['accepted', 'cancelled'];
    case 'accepted':
      return ['preparing', 'cancelled'];
    case 'preparing':
      return ['ready', 'cancelled'];
    case 'ready':
      return ['served', 'cancelled'];
    default:
      return [];
  }
}

interface OrderRow {
  id: string;
  orderNumber: number;
  businessDate: string;
  channel: string;
  status: string;
  customerLabel: string | null;
  tableId: string | null;
  tableNumber: number | null;
  tableLabel: string | null;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  note: string | null;
  clientRef: string;
  createdAt: string;
  elapsedSeconds: number;
}

interface OrderItemRow {
  id: string;
  menuItemId?: string;
  name: string;
  unitPriceMinor: number;
  quantity: number;
  lineTotalMinor: number;
  note: string | null;
  status: string;
}

const ORDER_SELECT = `
  select o.id,
         o.order_number as "orderNumber",
         o.business_date as "businessDate",
         o.channel,
         o.status,
         o.customer_label as "customerLabel",
         o.table_id as "tableId",
         t.table_number as "tableNumber",
         t.label as "tableLabel",
         o.subtotal_minor as "subtotalMinor",
         o.tax_minor as "taxMinor",
         o.total_minor as "totalMinor",
         o.note,
         o.client_ref as "clientRef",
         o.created_at as "createdAt",
         extract(epoch from (now() - o.created_at))::int as "elapsedSeconds"
  from orders o
  left join dining_tables t on t.id = o.table_id`;

export function businessDateFor(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

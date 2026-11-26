import { BadRequestException, ForbiddenException, NotFoundException } from '../errors';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { DatabaseService, type QueryClient } from '../database/database.service';
import { AuditService } from '../audit/audit.service';
import { isOrderingOpen, RestaurantsService } from '../restaurants/restaurants.service';
import { AuthenticatedUser, FulfillmentType, OrderStatus } from '../common/types';
import { computeTotals } from '../common/money';
import { modifierSelectionError } from '../../lib/modifiers';
import type { ModifierGroup } from '../../lib/types';

export interface CreateOrderLine {
  menuItemId: string;
  quantity: number;
  note?: string | null;
  modifierIds?: string[];
}

export interface GuestOrderInput {
  restaurantId: string;
  tableId?: string | null;
  fulfillmentType?: FulfillmentType;
  clientRef: string;
  customerLabel?: string | null;
  note?: string | null;
  lines: CreateOrderLine[];
  channel?: 'qr' | 'staff';
}

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
    if (!input.clientRef || input.clientRef.length > 120) throw new BadRequestException('Invalid order reference');

    const existing = await this.db.one<{ id: string }>(
      'select id from orders where restaurant_id = $1 and client_ref = $2',
      [input.restaurantId, input.clientRef],
    );
    if (existing) return this.findById(input.restaurantId, existing.id);

    const fulfillmentType = input.fulfillmentType ?? 'dine_in';
    if (!['dine_in', 'takeaway'].includes(fulfillmentType)) throw new BadRequestException('Select a valid order type');
    const table = input.tableId
      ? await this.db.one<{ id: string; table_number: number }>(
          'select id, table_number from dining_tables where id = $1 and restaurant_id = $2 and is_active = true',
          [input.tableId, input.restaurantId],
        )
      : null;
    if (fulfillmentType === 'dine_in' && !table) throw new BadRequestException('Choose an active table');
    if (fulfillmentType === 'takeaway' && !input.customerLabel?.trim()) {
      throw new BadRequestException('Add a customer name for takeaway');
    }

    const restaurant = await this.restaurants.findById(input.restaurantId);
    if (input.channel !== 'staff' && !isOrderingOpen(restaurant)) {
      throw new BadRequestException('This venue is not taking QR orders right now');
    }
    const resolvedLines: Awaited<ReturnType<OrdersService['resolveLine']>>[] = [];
    let gross = 0;
    for (const line of input.lines) {
      const resolved = await this.resolveLine(input.restaurantId, line);
      resolvedLines.push(resolved);
      gross += resolved.unitPriceMinor * resolved.quantity;
    }

    const totals = computeTotals(gross, {
      taxRateBp: restaurant.taxRateBp,
      taxInclusive: restaurant.taxInclusive,
    });
    const createdAt = new Date();
    const businessDate = businessDateFor(createdAt, restaurant.timezone);
    const orderId = randomUUID();
    try {
      await this.db.transaction(async (tx) => {
        const duplicate = await tx.one<{ id: string }>(
          'select id from orders where restaurant_id = $1 and client_ref = $2',
          [input.restaurantId, input.clientRef],
        );
        if (duplicate) return;
        const counter = await tx.one<{ last_number: number }>(
          `insert into order_counters (restaurant_id, business_date, last_number)
           values ($1, $2, (select coalesce(max(order_number), 0) + 1 from orders where restaurant_id = $1 and business_date = $2))
           on conflict (restaurant_id, business_date) do update
           set last_number = order_counters.last_number + 1
           returning last_number`,
          [input.restaurantId, businessDate],
        );
        await tx.query(
      `insert into orders (id, restaurant_id, table_id, fulfillment_type, order_number, business_date, channel, status,
                           customer_label, subtotal_minor, tax_minor, total_minor, paid_minor,
                           note, client_ref, created_at, tax_rate_snapshot_bp, tax_inclusive_snapshot)
       values ($1, $2, $3, $4, $5, $6, $7, 'new', $8, $9, $10, $11, 0, $12, $13, $14, $15, $16)`,
      [
        orderId,
        input.restaurantId,
        table?.id ?? null,
        fulfillmentType,
        counter!.last_number,
        businessDate,
        input.channel ?? 'qr',
        input.customerLabel?.trim() || `Table ${table!.table_number}`,
        totals.subtotalMinor,
        totals.taxMinor,
        totals.totalMinor,
        input.note ?? null,
        input.clientRef,
        createdAt.toISOString(),
        restaurant.taxRateBp,
        restaurant.taxInclusive,
      ],
        );

        for (const line of resolvedLines) {
          await this.insertLine(tx, input.restaurantId, orderId, randomUUID(), line);
        }
      });
    } catch (error) {
      const duplicate = await this.db.one<{ id: string }>(
        'select id from orders where restaurant_id = $1 and client_ref = $2',
        [input.restaurantId, input.clientRef],
      );
      if (duplicate) return this.findById(input.restaurantId, duplicate.id);
      throw error;
    }

    const committed = await this.db.one<{ id: string }>(
      'select id from orders where restaurant_id = $1 and client_ref = $2',
      [input.restaurantId, input.clientRef],
    );
    if (committed?.id !== orderId) return this.findById(input.restaurantId, committed!.id);

    const saved = await this.findById(input.restaurantId, orderId);
    this.events.emit(`orders:${input.restaurantId}`, { type: 'created', order: saved });
    return saved;
  }

  private async resolveLine(restaurantId: string, line: CreateOrderLine) {
    const ids = line.modifierIds ?? [];
    if (!Array.isArray(ids) || ids.length > 200 || ids.some((id) => typeof id !== 'string') || ids.length !== new Set(ids).size) {
      throw new BadRequestException('Choose each item option at most once.');
    }
    const item = await this.db.one<{
      id: string;
      name: string;
      price_minor: number;
      is_available: boolean;
      archived_at: string | null;
      groups: ModifierGroup[];
      options: { id: string; name: string; groupId: string | null; price_adjustment_minor: number }[];
    }>(
      `select i.id, i.name, i.price_minor, i.is_available, i.archived_at,
         coalesce((select json_agg(json_build_object('id', g.id, 'name', g.name, 'minChoices', g.min_choices, 'maxChoices', g.max_choices))
                   from menu_modifier_groups g where g.menu_item_id = i.id), '[]'::json) as groups,
         coalesce((select json_agg(json_build_object('id', m.id, 'name', m.name, 'groupId', m.group_id,
                   'price_adjustment_minor', m.price_adjustment_minor) order by m.name, m.id)
                   from menu_modifiers m where m.menu_item_id = i.id and m.is_active), '[]'::json) as options
       from menu_items i where i.id = $1 and i.restaurant_id = $2`,
      [line.menuItemId, restaurantId],
    );
    if (!item || item.archived_at || !item.is_available) {
      throw new BadRequestException('One of the items is no longer available');
    }

    const modifiers = item.options.filter((option) => ids.includes(option.id));
    if (modifiers.length !== ids.length) {
      throw new BadRequestException('An option is no longer available. Review the item options and try again.');
    }
    const invalid = modifierSelectionError(item.groups, item.options, ids);
    if (invalid) throw new BadRequestException(`${item.name} · ${invalid}`);
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) {
      throw new BadRequestException('Quantity must be between 1 and 99');
    }
    const quantity = line.quantity;
    const unit = item.price_minor + modifiers.reduce((sum, m) => sum + m.price_adjustment_minor, 0);
    return {
      menuItemId: item.id,
      name: item.name,
      unitPriceMinor: unit,
      quantity,
      note: line.note ?? null,
      modifiers: modifiers.map((option) => {
        const group = item.groups.find((entry) => entry.id === option.groupId);
        return group ? { ...option, name: `${group.name}: ${option.name}` } : option;
      }),
    };
  }

  private async insertLine(
    tx: QueryClient, restaurantId: string, orderId: string, orderItemId: string,
    line: Awaited<ReturnType<OrdersService['resolveLine']>>,
  ) {
    await tx.query(
      `insert into order_items (id, order_id, restaurant_id, menu_item_id, name_snapshot,
                                unit_price_minor, quantity, line_total_minor, note, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')`,
      [
        orderItemId,
        orderId,
        restaurantId,
        line.menuItemId,
        line.name,
        line.unitPriceMinor,
        line.quantity,
        line.unitPriceMinor * line.quantity,
        line.note,
      ],
    );
    for (const modifier of line.modifiers) {
      await tx.query(
        `insert into order_item_modifiers (id, order_item_id, modifier_name, price_adjustment_minor)
         values ($1, $2, $3, $4)`,
        [randomUUID(), orderItemId, modifier.name, modifier.price_adjustment_minor],
      );
    }
  }

  async createStaffOrder(user: AuthenticatedUser, input: GuestOrderInput) {
    return this.createGuestOrder({ ...input, restaurantId: user.restaurantId, channel: 'staff' });
  }

  async correctItem(user: AuthenticatedUser, orderId: string, itemId: string, patch: {
    quantity: number; expectedQuantity: number; reason: string;
  }, addedLine?: CreateOrderLine) {
    const reason = typeof patch.reason === 'string' ? patch.reason.trim() : '';
    if (!reason || reason.length > 160 || !Number.isInteger(patch.quantity) || patch.quantity < 0 || patch.quantity > 99) {
      throw new BadRequestException('Set a quantity from 0 to 99 and enter a correction reason.');
    }
    const addition = addedLine ? await this.resolveLine(user.restaurantId, addedLine) : null;
    const restaurant = await this.restaurants.findById(user.restaurantId);
    const summary = await this.db.transaction(async (tx) => {
      const order = await tx.one<{ status: string; paid: number; subtotal: number; tax: number; total: number; rate: number | null; inclusive: boolean | null }>(
        `select status, paid_minor as paid, subtotal_minor as subtotal, tax_minor as tax, total_minor as total,
                tax_rate_snapshot_bp as rate, tax_inclusive_snapshot as inclusive
         from orders where id = $1 and restaurant_id = $2 for update`,
        [orderId, user.restaurantId],
      );
      if (!order) throw new NotFoundException('Order not found');
      if (!['new', 'accepted', 'preparing', 'ready'].includes(order.status) || order.paid > 0) {
        throw new BadRequestException('Only open, unpaid tickets can be corrected.');
      }
      const existing = await tx.one<{ name: string; quantity: number; unit: number }>(
        'select name_snapshot as name, quantity, unit_price_minor as unit from order_items where id = $1 and order_id = $2',
        [itemId, orderId],
      );
      if (addition && existing) throw new BadRequestException('This item has already been added.');
      const line = addition ? { name: addition.name, quantity: 0, unit: addition.unitPriceMinor } : existing;
      if (!line) throw new NotFoundException('Order item not found');
      if (line.quantity !== patch.expectedQuantity || line.quantity === patch.quantity) {
        throw new BadRequestException('Quantity is unchanged or has already changed. Refresh the ticket.');
      }
      const basket = await tx.one<{ gross: number; count: number }>(
        'select coalesce(sum(line_total_minor), 0)::int as gross, count(*)::int as count from order_items where order_id = $1',
        [orderId],
      );
      if (!basket || (basket.count === 1 && patch.quantity === 0)) {
        throw new BadRequestException('Cancel the whole ticket to remove its last item.');
      }
      const tax = { taxRateBp: order.rate ?? restaurant.taxRateBp, taxInclusive: order.inclusive ?? restaurant.taxInclusive };
      const original = computeTotals(basket.gross, tax);
      if (original.taxMinor !== order.tax || original.subtotalMinor !== order.subtotal || original.totalMinor !== order.total) {
        throw new BadRequestException('This ticket uses earlier tax settings and cannot be repriced safely.');
      }
      const totals = computeTotals(basket.gross + (patch.quantity - line.quantity) * line.unit, tax);
      if (addition) {
        await this.insertLine(tx, user.restaurantId, orderId, itemId, addition);
      } else if (patch.quantity === 0) {
        await tx.query('delete from order_items where id = $1 and order_id = $2', [itemId, orderId]);
      } else {
        await tx.query(
          `update order_items set quantity = $2, line_total_minor = $2 * unit_price_minor,
             status = case when $2 > quantity then 'pending' else status end where id = $1`,
          [itemId, patch.quantity],
        );
      }
      const message = `${line.name}: ${line.quantity} → ${patch.quantity}. ${reason}`;
      await tx.query(
        `update orders set subtotal_minor = $2, tax_minor = $3, total_minor = $4,
           correction_summary = concat_ws(chr(10), nullif(correction_summary, ''), $5::text),
           status = case when status = 'ready' and $6 then 'preparing' else status end,
           ready_at = case when status = 'ready' and $6 then null else ready_at end, updated_at = now()
         where id = $1`,
        [orderId, totals.subtotalMinor, totals.taxMinor, totals.totalMinor, message, patch.quantity > line.quantity],
      );
      return message;
    });
    await this.audit.record({
      restaurantId: user.restaurantId, userId: user.id, action: 'order.item.corrected',
      entity: 'order', entityId: orderId, metadata: { itemId, summary },
    });
    return this.publishUpdate(user.restaurantId, orderId);
  }

  async addItem(user: AuthenticatedUser, orderId: string, line: CreateOrderLine, itemId: string, reason: string) {
    if (!line || typeof itemId !== 'string' || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(itemId)) {
      throw new BadRequestException('Choose a menu item and quantity.');
    }
    return this.correctItem(user, orderId, itemId, { quantity: line.quantity, expectedQuantity: 0, reason }, line);
  }

  async recordPayment(user: AuthenticatedUser, orderId: string, method: string, expectedTotal: number) {
    if (!['cash', 'card_terminal', 'upi'].includes(method) || !Number.isInteger(expectedTotal) || expectedTotal <= 0) {
      throw new BadRequestException('Choose a payment method and confirm the ticket total.');
    }
    await this.db.transaction(async (tx) => {
      const order = await tx.one<{ status: string; paid: number; total: number }>(
        'select status, paid_minor as paid, total_minor as total from orders where id = $1 and restaurant_id = $2 for update',
        [orderId, user.restaurantId],
      );
      if (!order) throw new NotFoundException('Order not found');
      if (order.paid > 0) throw new BadRequestException('Payment is already recorded for this ticket.');
      if (order.total !== expectedTotal || !['accepted', 'preparing', 'ready', 'served'].includes(order.status)) {
        throw new BadRequestException('The ticket has changed. Check the current balance before recording payment.');
      }
      await tx.query(
        'insert into payments (id, order_id, restaurant_id, method, amount_minor, received_by) values ($1, $2, $3, $4, $5, $6)',
        [randomUUID(), orderId, user.restaurantId, method, expectedTotal, user.id],
      );
      await tx.query('update orders set paid_minor = $2, updated_at = now() where id = $1', [orderId, expectedTotal]);
    });
    await this.audit.record({
      restaurantId: user.restaurantId, userId: user.id, action: 'order.payment.recorded',
      entity: 'order', entityId: orderId, metadata: { method, amountMinor: expectedTotal },
    });
    return this.publishUpdate(user.restaurantId, orderId);
  }

  async reversePayment(user: AuthenticatedUser, orderId: string, reason: unknown, expectedUpdatedAt: unknown) {
    const note = typeof reason === 'string' ? reason.trim() : '';
    if (!note || note.length > 160 || typeof expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
      throw new BadRequestException('Enter a reason and confirm the current payment.');
    }
    const amount = await this.db.transaction(async (tx) => {
      const order = await tx.one<{ paid: number; updatedAt: string }>(
        'select paid_minor as paid, updated_at as "updatedAt" from orders where id = $1 and restaurant_id = $2 for update',
        [orderId, user.restaurantId],
      );
      if (!order) throw new NotFoundException('Order not found');
      if (order.paid <= 0 || new Date(order.updatedAt).getTime() !== Date.parse(expectedUpdatedAt)) {
        throw new BadRequestException('The ticket changed. Check the current payment before reversing.');
      }
      const payment = await tx.one<{ id: string; method: string; amount: number }>(
        `select id, method, amount_minor as amount from payments where order_id = $1 and amount_minor > 0
         order by created_at desc, id desc limit 1`, [orderId],
      );
      if (!payment || payment.amount !== order.paid) throw new BadRequestException('Payment history needs manual review.');
      await tx.query(
        `insert into payments (id, order_id, restaurant_id, method, amount_minor, received_by, reference)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), orderId, user.restaurantId, payment.method, -order.paid, user.id, `Reversal of ${payment.id}: ${note}`],
      );
      await tx.query('update orders set paid_minor = 0, updated_at = now() where id = $1', [orderId]);
      return order.paid;
    });
    await this.audit.record({
      restaurantId: user.restaurantId, userId: user.id, action: 'order.payment.reversed',
      entity: 'order', entityId: orderId, metadata: { reason: note, amountMinor: amount },
    });
    return this.publishUpdate(user.restaurantId, orderId);
  }

  private async publishUpdate(restaurantId: string, orderId: string) {
    const saved = await this.findById(restaurantId, orderId);
    this.events.emit(`orders:${restaurantId}`, { type: 'updated', order: saved });
    return saved;
  }

  async acknowledgeCorrections(user: AuthenticatedUser, orderId: string, summary: unknown) {
    if (typeof summary !== 'string' || !summary) throw new BadRequestException('Select the corrections you reviewed.');
    const updated = await this.db.one(
      `update orders set correction_summary = null, updated_at = now()
       where id = $1 and restaurant_id = $2 and correction_summary = $3 returning id`,
      [orderId, user.restaurantId, summary],
    );
    if (!updated) throw new BadRequestException('The ticket changed. Review the latest corrections.');
    return this.publishUpdate(user.restaurantId, orderId);
  }

  async setStatus(user: AuthenticatedUser, orderId: string, status: OrderStatus, reason?: string, completeItems = false, expectedUpdatedAt?: string) {
    const order = await this.findById(user.restaurantId, orderId);
    if (status === 'served' && order.fulfillmentType === 'takeaway' && user.role === 'kitchen') {
      throw new ForbiddenException('Counter staff confirm takeaway handover.');
    }
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

    await this.db.transaction(async (tx) => {
      const locked = await tx.one<{ status: string; paid_minor: number; updated_at: string }>(
        'select status, paid_minor, updated_at from orders where id = $1 and restaurant_id = $2 for update',
        [orderId, user.restaurantId],
      );
      if (!locked || locked.status !== order.status) throw new BadRequestException('Ticket status changed. Check the latest status and try again.');
      if (status === 'cancelled' && locked.paid_minor > 0) throw new BadRequestException('A paid ticket requires a payment reversal before cancellation.');
      if (status === 'ready') {
        if (completeItems === true) {
          if (new Date(locked.updated_at).getTime() !== Date.parse(expectedUpdatedAt ?? '')) {
            throw new BadRequestException('Ticket changed. Review its items before marking them ready.');
          }
          await tx.query("update order_items set status = 'ready' where order_id = $1", [orderId]);
        }
        else if (await tx.one("select id from order_items where order_id = $1 and status <> 'ready' limit 1", [orderId])) {
          throw new BadRequestException('Finish the remaining items or choose Mark all items ready.');
        }
      }
      await tx.query(
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
    });

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

    await this.db.transaction(async (tx) => {
      const locked = await tx.one<{ status: string }>(
        'select status from orders where id = $1 and restaurant_id = $2 for update', [orderId, user.restaurantId],
      );
      if (!locked || ['ready', 'served', 'cancelled', 'void'].includes(locked.status)) {
        throw new BadRequestException('This ticket is no longer accepting item updates.');
      }
      const changed = await tx.one(
        'update order_items set status = $1 where id = $2 and order_id = $3 and status = $4 and quantity = $5 returning id',
        [status, itemId, orderId, item.status, item.quantity],
      );
      if (!changed) throw new BadRequestException('Item changed. Check the ticket and retry.');
      await tx.query('update orders set updated_at = now() where id = $1', [orderId]);
    });

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

  async recall(user: AuthenticatedUser, orderId: string) {
    const updated = await this.db.query(
      `update orders
       set status = 'ready', updated_at = now(), served_at = null, closed_at = null
       where id = $1 and restaurant_id = $2 and status = 'served'
         and served_at >= now() - interval '30 minutes'
       returning id`,
      [orderId, user.restaurantId],
    );
    if (!updated.rows.length) {
      throw new BadRequestException('This ticket is no longer available to recall');
    }
    await this.audit.record({
      restaurantId: user.restaurantId,
      userId: user.id,
      action: 'order.recalled',
      entity: 'order',
      entityId: orderId,
      metadata: { from: 'served', to: 'ready' },
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
    filter: { status?: string; businessDate?: string; limit?: number; activeOnly?: boolean; recentServed?: boolean },
  ) {
    const conditions = ['o.restaurant_id = $1'];
    const values: unknown[] = [restaurantId];

    if (filter.recentServed) {
      conditions.push("o.status = 'served' and o.served_at >= now() - interval '30 minutes'");
    } else if (filter.activeOnly) {
      conditions.push(`o.status in ('new','accepted','preparing','ready')`);
    } else if (filter.status && filter.status !== 'all') {
      values.push(filter.status);
      conditions.push(`o.status = $${values.length}`);
    }
    if (filter.businessDate) {
      values.push(filter.businessDate);
      conditions.push(`o.business_date = $${values.length}`);
    }
    let limit = '';
    // Service boards need every open ticket. Cap only history queries.
    if (!filter.activeOnly && !filter.recentServed) {
      values.push(Math.min(filter.limit ?? 80, 200));
      limit = ` limit $${values.length}`;
    }

    const sort = filter.recentServed ? 'o.served_at desc' : 'o.created_at desc';
    const orders = await this.db.many<OrderRow>(
      `${ORDER_SELECT} where ${conditions.join(' and ')} order by ${sort}, o.id${limit}`,
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
  fulfillmentType: FulfillmentType;
  status: string;
  customerLabel: string | null;
  tableId: string | null;
  tableNumber: number | null;
  tableLabel: string | null;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  correctionSummary: string | null;
  note: string | null;
  rejectionReason: string | null;
  clientRef: string;
  createdAt: string;
  updatedAt: string;
  servedAt: string | null;
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
         o.fulfillment_type as "fulfillmentType",
         o.status,
         o.customer_label as "customerLabel",
         o.table_id as "tableId",
         t.table_number as "tableNumber",
         t.label as "tableLabel",
         o.subtotal_minor as "subtotalMinor",
         o.tax_minor as "taxMinor",
         o.total_minor as "totalMinor",
         o.paid_minor as "paidMinor",
         o.correction_summary as "correctionSummary",
         o.note,
         o.rejection_reason as "rejectionReason",
         o.client_ref as "clientRef",
         o.created_at as "createdAt",
         o.updated_at as "updatedAt",
         o.served_at as "servedAt",
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

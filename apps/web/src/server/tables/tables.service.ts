import { NotFoundException } from '../errors';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/types';

export interface DiningTable {
  id: string;
  tableNumber: number;
  label: string | null;
  qrToken: string;
  isActive: boolean;
}

export class TablesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  list(restaurantId: string) {
    return this.db.many<DiningTable>(
      `select id, table_number as "tableNumber", label, qr_token as "qrToken", is_active as "isActive"
       from dining_tables where restaurant_id = $1 order by table_number`,
      [restaurantId],
    );
  }

  async createDefaultSet(restaurantId: string, count = 8) {
    const existing = await this.db.one<{ count: number }>(
      'select count(*)::int as count from dining_tables where restaurant_id = $1',
      [restaurantId],
    );
    if ((existing?.count ?? 0) > 0) return this.list(restaurantId);

    for (let n = 1; n <= count; n++) {
      await this.db.query(
        `insert into dining_tables (id, restaurant_id, table_number, label, qr_token)
         values ($1, $2, $3, $4, $5)`,
        [randomUUID(), restaurantId, n, null, randomUUID()],
      );
    }
    return this.list(restaurantId);
  }

  async create(user: AuthenticatedUser, input: { tableNumber: number; label?: string | null }) {
    const id = randomUUID();
    const qrToken = randomUUID();
    await this.db.query(
      `insert into dining_tables (id, restaurant_id, table_number, label, qr_token)
       values ($1, $2, $3, $4, $5)`,
      [id, user.restaurantId, input.tableNumber, input.label?.trim() || null, qrToken],
    );
    await this.audit.record({
      restaurantId: user.restaurantId,
      userId: user.id,
      action: 'table.create',
      entity: 'table',
      entityId: id,
    });
    return { id, tableNumber: input.tableNumber, label: input.label ?? null, qrToken, isActive: true };
  }

  async update(
    user: AuthenticatedUser,
    tableId: string,
    patch: { label?: string | null; isActive?: boolean; tableNumber?: number },
  ) {
    const table = await this.db.one<DiningTable>(
      `select id, table_number as "tableNumber", label, qr_token as "qrToken", is_active as "isActive"
       from dining_tables where id = $1 and restaurant_id = $2`,
      [tableId, user.restaurantId],
    );
    if (!table) throw new NotFoundException('Table not found');

    await this.db.query(
      `update dining_tables
       set label = coalesce($3, label),
           is_active = coalesce($4, is_active),
           table_number = coalesce($5, table_number)
       where id = $1 and restaurant_id = $2`,
      [
        tableId,
        user.restaurantId,
        patch.label === undefined ? null : patch.label,
        patch.isActive ?? null,
        patch.tableNumber ?? null,
      ],
    );
    const rows = await this.list(user.restaurantId);
    return rows.find((row) => row.id === tableId)!;
  }

  async rotateToken(user: AuthenticatedUser, tableId: string) {
    const qrToken = randomUUID();
    const result = await this.db.query(
      'update dining_tables set qr_token = $1 where id = $2 and restaurant_id = $3',
      [qrToken, tableId, user.restaurantId],
    );
    if (!result.rowCount) throw new NotFoundException('Table not found');
    return { id: tableId, qrToken };
  }

  async findByToken(slug: string, qrToken: string) {
    return this.db.one<{
      restaurantId: string;
      restaurantName: string;
      slug: string;
      currency: string;
      locale: string;
      timezone: string;
      tableId: string;
      tableNumber: number;
      label: string | null;
    }>(
      `select r.id as "restaurantId", r.name as "restaurantName", r.slug, r.currency, r.locale, r.timezone,
              t.id as "tableId", t.table_number as "tableNumber", t.label
       from dining_tables t
       join restaurants r on r.id = t.restaurant_id
       where r.slug = $1 and t.qr_token = $2 and t.is_active = true`,
      [slug, qrToken],
    );
  }
}

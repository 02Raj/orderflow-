import { BadRequestException, HttpError, NotFoundException } from '../errors';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/types';

export interface DiningTable {
  id: string;
  tableNumber: number;
  label: string | null;
  area: string | null;
  qrToken: string;
  isActive: boolean;
}

const TABLE_FIELDS = `id, table_number as "tableNumber", label, area, qr_token as "qrToken", is_active as "isActive"`;

function payload(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Enter valid table details.');
  return input as Record<string, unknown>;
}

function tableNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 2147483647) {
    throw new BadRequestException('Table number must be a positive whole number (up to 2,147,483,647).');
  }
  return value;
}

function optionalText(value: unknown, name: string): string | null {
  if (value == null) return null;
  if (typeof value !== 'string' || value.trim().length > 80) throw new BadRequestException(`${name} must be at most 80 characters.`);
  return value.trim() || null;
}

function duplicate(number: number) {
  return new HttpError(409, `Table ${number} already exists. Choose a different number.`);
}

function validateId(id: string) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) throw new NotFoundException('Table not found');
}

export class TablesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  list(restaurantId: string) {
    return this.db.many<DiningTable>(
      `select ${TABLE_FIELDS}
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

  async create(user: AuthenticatedUser, input: unknown) {
    const data = payload(input);
    const number = tableNumber(data.tableNumber);
    const label = optionalText(data.label, 'Label');
    const area = optionalText(data.area, 'Area');
    const table = await this.db.one<DiningTable>(
      `insert into dining_tables (id, restaurant_id, table_number, label, area, qr_token)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (restaurant_id, table_number) do nothing
       returning ${TABLE_FIELDS}`,
      [randomUUID(), user.restaurantId, number, label, area, randomUUID()],
    );
    if (!table) throw duplicate(number);
    await this.audit.record({
      restaurantId: user.restaurantId,
      userId: user.id,
      action: 'table.create',
      entity: 'table',
      entityId: table.id,
    });
    return table;
  }

  async update(
    user: AuthenticatedUser,
    tableId: string,
    input: unknown,
  ) {
    validateId(tableId);
    const patch = payload(input);
    const number = patch.tableNumber === undefined ? null : tableNumber(patch.tableNumber);
    const label = optionalText(patch.label, 'Label');
    const area = optionalText(patch.area, 'Area');
    if (patch.isActive !== undefined && typeof patch.isActive !== 'boolean') throw new BadRequestException('Select a valid table status.');

    let table: DiningTable | null;
    try {
      table = await this.db.one<DiningTable>(
        `update dining_tables
         set label = case when $3 then $4 else label end,
             area = case when $5 then $6 else area end,
             is_active = coalesce($7, is_active),
             table_number = coalesce($8, table_number)
         where id = $1 and restaurant_id = $2
         returning ${TABLE_FIELDS}`,
        [tableId, user.restaurantId, patch.label !== undefined, label, patch.area !== undefined, area, patch.isActive ?? null, number],
      );
    } catch (error) {
      if (number !== null && error && typeof error === 'object' && 'code' in error && error.code === '23505') throw duplicate(number);
      throw error;
    }
    if (!table) throw new NotFoundException('Table not found');
    await this.audit.record({ restaurantId: user.restaurantId, userId: user.id, action: 'table.update', entity: 'table', entityId: tableId });
    return table;
  }

  async rotateToken(user: AuthenticatedUser, tableId: string) {
    validateId(tableId);
    const qrToken = randomUUID();
    const result = await this.db.query(
      'update dining_tables set qr_token = $1 where id = $2 and restaurant_id = $3',
      [qrToken, tableId, user.restaurantId],
    );
    if (!result.rowCount) throw new NotFoundException('Table not found');
    await this.audit.record({ restaurantId: user.restaurantId, userId: user.id, action: 'table.rotate_qr', entity: 'table', entityId: tableId });
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

import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../common/types';

export interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
}

export interface MenuModifier {
  id: string;
  name: string;
  priceAdjustmentMinor: number;
}

export interface MenuItem {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  priceMinor: number;
  isAvailable: boolean;
  unavailableReason: string | null;
  sortOrder: number;
  modifiers: MenuModifier[];
}

@Injectable()
export class MenuService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async getMenu(restaurantId: string) {
    const [categories, items, modifiers] = await Promise.all([
      this.db.many<MenuCategory>(
        `select id, name, sort_order as "sortOrder" from menu_categories
         where restaurant_id = $1 and archived_at is null order by sort_order, name`,
        [restaurantId],
      ),
      this.db.many<Omit<MenuItem, 'modifiers'>>(
        `select id, category_id as "categoryId", name, description, price_minor as "priceMinor",
                is_available as "isAvailable", unavailable_reason as "unavailableReason",
                sort_order as "sortOrder"
         from menu_items
         where restaurant_id = $1 and archived_at is null order by sort_order, name`,
        [restaurantId],
      ),
      this.db.many<MenuModifier & { menuItemId: string }>(
        `select id, menu_item_id as "menuItemId", name, price_adjustment_minor as "priceAdjustmentMinor"
         from menu_modifiers where restaurant_id = $1 and is_active = true`,
        [restaurantId],
      ),
    ]);

    return {
      categories,
      items: items.map((item) => ({
        ...item,
        modifiers: modifiers.filter((m) => m.menuItemId === item.id),
      })),
    };
  }

  async getPublicMenu(restaurantId: string) {
    const menu = await this.getMenu(restaurantId);
    return {
      categories: menu.categories,
      items: menu.items.filter((item) => item.isAvailable),
    };
  }

  async createCategory(user: AuthenticatedUser, name: string, sortOrder = 0) {
    const id = randomUUID();
    await this.db.query(
      'insert into menu_categories (id, restaurant_id, name, sort_order) values ($1, $2, $3, $4)',
      [id, user.restaurantId, name.trim(), sortOrder],
    );
    return { id, name: name.trim(), sortOrder };
  }

  async createItem(
    user: AuthenticatedUser,
    input: {
      name: string;
      priceMinor: number;
      categoryId?: string | null;
      description?: string | null;
      sortOrder?: number;
    },
  ) {
    const id = randomUUID();
    await this.db.query(
      `insert into menu_items (id, restaurant_id, category_id, name, description, price_minor, sort_order)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        user.restaurantId,
        input.categoryId ?? null,
        input.name.trim(),
        input.description?.trim() || null,
        input.priceMinor,
        input.sortOrder ?? 0,
      ],
    );
    return this.findItem(user.restaurantId, id);
  }

  async addModifier(
    user: AuthenticatedUser,
    itemId: string,
    input: { name: string; priceAdjustmentMinor: number },
  ) {
    await this.findItem(user.restaurantId, itemId);
    const id = randomUUID();
    await this.db.query(
      `insert into menu_modifiers (id, restaurant_id, menu_item_id, name, price_adjustment_minor)
       values ($1, $2, $3, $4, $5)`,
      [id, user.restaurantId, itemId, input.name.trim(), input.priceAdjustmentMinor],
    );
    return { id, name: input.name.trim(), priceAdjustmentMinor: input.priceAdjustmentMinor };
  }

  async updateItem(
    user: AuthenticatedUser,
    itemId: string,
    patch: Partial<
      Pick<MenuItem, 'name' | 'priceMinor' | 'categoryId' | 'isAvailable' | 'sortOrder' | 'description'>
    > & { unavailableReason?: string | null },
  ) {
    const columns: Record<string, string> = {
      name: 'name',
      priceMinor: 'price_minor',
      categoryId: 'category_id',
      isAvailable: 'is_available',
      unavailableReason: 'unavailable_reason',
      sortOrder: 'sort_order',
      description: 'description',
    };
    const updates: string[] = [];
    const values: unknown[] = [];
    for (const [key, value] of Object.entries(patch)) {
      const column = columns[key];
      if (!column || value === undefined) continue;
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    }
    if (!updates.length) return this.findItem(user.restaurantId, itemId);

    updates.push('updated_at = now()');
    values.push(itemId, user.restaurantId);
    const result = await this.db.query(
      `update menu_items set ${updates.join(', ')}
       where id = $${values.length - 1} and restaurant_id = $${values.length}`,
      values,
    );
    if (!result.rowCount) throw new NotFoundException('Menu item not found');

    if (patch.isAvailable !== undefined) {
      await this.audit.record({
        restaurantId: user.restaurantId,
        userId: user.id,
        action: patch.isAvailable ? 'menu.item.available' : 'menu.item.86',
        entity: 'menu_item',
        entityId: itemId,
        metadata: { reason: patch.unavailableReason ?? null },
      });
    }
    return this.findItem(user.restaurantId, itemId);
  }

  async archiveItem(user: AuthenticatedUser, itemId: string) {
    await this.db.query(
      'update menu_items set archived_at = now() where id = $1 and restaurant_id = $2',
      [itemId, user.restaurantId],
    );
    return { id: itemId, archived: true };
  }

  async archiveCategory(user: AuthenticatedUser, categoryId: string) {
    await this.db.query(
      'update menu_categories set archived_at = now() where id = $1 and restaurant_id = $2',
      [categoryId, user.restaurantId],
    );
    await this.db.query(
      'update menu_items set archived_at = now() where category_id = $1 and restaurant_id = $2',
      [categoryId, user.restaurantId],
    );
    return { id: categoryId, archived: true };
  }

  async importFromText(user: AuthenticatedUser, text: string, replace = false) {
    if (replace) {
      await this.db.query(
        'update menu_items set archived_at = now() where restaurant_id = $1 and archived_at is null',
        [user.restaurantId],
      );
      await this.db.query(
        'update menu_categories set archived_at = now() where restaurant_id = $1 and archived_at is null',
        [user.restaurantId],
      );
    }

    const parsed = parseMenuText(text);
    let categorySort = 0;
    let created = 0;

    for (const group of parsed) {
      const category = await this.createCategory(user, group.category, categorySort++);
      let itemSort = 0;
      for (const item of group.items) {
        await this.createItem(user, {
          name: item.name,
          priceMinor: item.priceMinor,
          categoryId: category.id,
          sortOrder: itemSort++,
        });
        created++;
      }
    }

    await this.audit.record({
      restaurantId: user.restaurantId,
      userId: user.id,
      action: 'menu.import',
      entity: 'menu',
      metadata: { itemsCreated: created, replaced: replace },
    });

    return { categories: parsed.length, items: created };
  }

  private async findItem(restaurantId: string, id: string) {
    const item = await this.db.one<Omit<MenuItem, 'modifiers'>>(
      `select id, category_id as "categoryId", name, description, price_minor as "priceMinor",
              is_available as "isAvailable", unavailable_reason as "unavailableReason",
              sort_order as "sortOrder"
       from menu_items where id = $1 and restaurant_id = $2`,
      [id, restaurantId],
    );
    if (!item) throw new NotFoundException('Menu item not found');
    const modifiers = await this.db.many<MenuModifier>(
      `select id, name, price_adjustment_minor as "priceAdjustmentMinor"
       from menu_modifiers where menu_item_id = $1 and is_active = true`,
      [id],
    );
    return { ...item, modifiers };
  }
}

export interface ParsedMenuGroup {
  category: string;
  items: { name: string; priceMinor: number }[];
}

export function parseMenuText(text: string): ParsedMenuGroup[] {
  const groups: ParsedMenuGroup[] = [];
  let current: ParsedMenuGroup = { category: 'Menu', items: [] };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.endsWith(':')) {
      if (current.items.length) groups.push(current);
      current = { category: line.slice(0, -1).trim() || 'Menu', items: [] };
      continue;
    }

    const match = line.match(/^(.*?)[\s,\-–|]*([0-9]+(?:[.,][0-9]{1,2})?)\s*$/);
    if (!match) continue;
    const name = match[1].replace(/[\s,\-–|]+$/, '').replace(/[£$€₹]|AED|SAR|QAR/gi, '').trim();
    if (!name) continue;
    const priceMinor = Math.round(Number(match[2].replace(',', '.')) * 100);
    if (!Number.isFinite(priceMinor)) continue;
    current.items.push({ name, priceMinor });
  }

  if (current.items.length) groups.push(current);
  return groups;
}

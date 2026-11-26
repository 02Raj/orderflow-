import { BadRequestException, NotFoundException } from '../errors';
import type { ModifierGroup } from '../../lib/types';
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
  groupId?: string | null;
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
  imageUrl: string | null;
  modifiers: MenuModifier[];
  modifierGroups?: ModifierGroup[];
}

export class MenuService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async getMenu(restaurantId: string) {
    const [categories, items, modifiers, groups] = await Promise.all([
      this.db.many<MenuCategory>(
        `select id, name, sort_order as "sortOrder" from menu_categories
         where restaurant_id = $1 and archived_at is null order by sort_order, name`,
        [restaurantId],
      ),
      this.db.many<Omit<MenuItem, 'modifiers'>>(
        `select id, category_id as "categoryId", name, description, price_minor as "priceMinor",
                is_available as "isAvailable", unavailable_reason as "unavailableReason",
                sort_order as "sortOrder", image_url as "imageUrl"
         from menu_items
         where restaurant_id = $1 and archived_at is null order by sort_order, name`,
        [restaurantId],
      ),
      this.db.many<MenuModifier & { menuItemId: string }>(
        `select id, menu_item_id as "menuItemId", group_id as "groupId", name, price_adjustment_minor as "priceAdjustmentMinor"
         from menu_modifiers where restaurant_id = $1 and is_active = true order by name, id`,
        [restaurantId],
      ),
      this.db.many<ModifierGroup & { menuItemId: string }>(
        `select g.id, g.menu_item_id as "menuItemId", g.name, g.min_choices as "minChoices", g.max_choices as "maxChoices"
         from menu_modifier_groups g join menu_items i on i.id = g.menu_item_id
         where i.restaurant_id = $1 and i.archived_at is null order by g.created_at, g.id`,
        [restaurantId],
      ),
    ]);

    return {
      categories,
      items: items.map((item) => ({
        ...item,
        modifiers: modifiers.filter((m) => m.menuItemId === item.id),
        modifierGroups: groups.filter((group) => group.menuItemId === item.id),
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
      imageUrl?: string | null;
    },
  ) {
    const id = randomUUID();
    await this.db.query(
      `insert into menu_items (id, restaurant_id, category_id, name, description, price_minor, sort_order, image_url)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        user.restaurantId,
        input.categoryId ?? null,
        input.name.trim(),
        input.description?.trim() || null,
        input.priceMinor,
        input.sortOrder ?? 0,
        input.imageUrl?.trim() || null,
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

  async saveModifierGroup(user: AuthenticatedUser, itemId: string, input: {
    name: string; minChoices: number; maxChoices: number;
    options: { id?: string; name: string; priceAdjustmentMinor: number }[];
  }, groupId?: string) {
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    const { minChoices, maxChoices, options } = input ?? {};
    if (!name || name.length > 60 || !Array.isArray(options) || options.length > 20 ||
        !Number.isInteger(minChoices) || !Number.isInteger(maxChoices) ||
        minChoices < 0 || maxChoices < 1 || minChoices > maxChoices || maxChoices > options.length) {
      throw new BadRequestException('Enter a group name and choices. Maximum choices cannot exceed the number of options.');
    }
    const names = new Set<string>();
    const optionIds = new Set<string>();
    for (const option of options) {
      const label = typeof option?.name === 'string' ? option.name.trim() : '';
      if (!label || label.length > 60 || names.has(label.toLowerCase()) ||
          !Number.isInteger(option.priceAdjustmentMinor) || option.priceAdjustmentMinor < 0 ||
          option.priceAdjustmentMinor > 1_000_000 ||
          (option.id != null && (typeof option.id !== 'string' || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(option.id) || optionIds.has(option.id)))) {
        throw new BadRequestException('Use unique option names and valid extra prices.');
      }
      names.add(label.toLowerCase());
      if (option.id) optionIds.add(option.id);
    }

    const id = groupId ?? randomUUID();
    await this.db.transaction(async (tx) => {
      const item = await tx.one(
        'select id from menu_items where id = $1 and restaurant_id = $2 and archived_at is null for update',
        [itemId, user.restaurantId],
      );
      if (!item) throw new NotFoundException('Menu item not found');
      const duplicate = await tx.one(
        'select id from menu_modifier_groups where menu_item_id = $1 and lower(name) = lower($2) and id <> $3',
        [itemId, name, id],
      );
      if (duplicate) throw new BadRequestException('An option group with this name already exists on the item.');
      if (groupId) {
        const updated = await tx.one(
          'update menu_modifier_groups set name = $3, min_choices = $4, max_choices = $5 where id = $1 and menu_item_id = $2 returning id',
          [id, itemId, name, minChoices, maxChoices],
        );
        if (!updated) throw new NotFoundException('Option group not found');
      } else {
        await tx.query('insert into menu_modifier_groups (id, menu_item_id, name, min_choices, max_choices) values ($1, $2, $3, $4, $5)',
          [id, itemId, name, minChoices, maxChoices]);
      }
      await tx.query('update menu_modifiers set is_active = false where group_id = $1', [id]);
      for (const option of options) {
        if (option.id) {
          const updated = await tx.one(
            'update menu_modifiers set name = $3, price_adjustment_minor = $4, is_active = true where id = $1 and group_id = $2 returning id',
            [option.id, id, option.name.trim(), option.priceAdjustmentMinor],
          );
          if (!updated) throw new BadRequestException('An option no longer belongs to this group. Refresh the menu.');
        } else {
          await tx.query(
            'insert into menu_modifiers (id, restaurant_id, menu_item_id, group_id, name, price_adjustment_minor) values ($1, $2, $3, $4, $5, $6)',
            [randomUUID(), user.restaurantId, itemId, id, option.name.trim(), option.priceAdjustmentMinor],
          );
        }
      }
    });
    return { id };
  }

  async removeModifierGroup(user: AuthenticatedUser, itemId: string, id: string) {
    const group = await this.db.one(
      `delete from menu_modifier_groups g using menu_items i
       where g.id = $1 and g.menu_item_id = i.id and i.id = $2 and i.restaurant_id = $3 returning g.id`,
      [id, itemId, user.restaurantId],
    );
    if (!group) throw new NotFoundException('Option group not found');
    return { ok: true };
  }

  async updateItem(
    user: AuthenticatedUser,
    itemId: string,
    patch: Partial<
      Pick<
        MenuItem,
        'name' | 'priceMinor' | 'categoryId' | 'isAvailable' | 'sortOrder' | 'description' | 'imageUrl'
      >
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
      imageUrl: 'image_url',
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
              sort_order as "sortOrder", image_url as "imageUrl"
       from menu_items where id = $1 and restaurant_id = $2`,
      [id, restaurantId],
    );
    if (!item) throw new NotFoundException('Menu item not found');
    const [modifiers, modifierGroups] = await Promise.all([
      this.db.many<MenuModifier>(
        `select id, name, group_id as "groupId", price_adjustment_minor as "priceAdjustmentMinor"
         from menu_modifiers where menu_item_id = $1 and is_active = true order by name, id`, [id],
      ),
      this.db.many<ModifierGroup>(
        `select id, name, min_choices as "minChoices", max_choices as "maxChoices"
         from menu_modifier_groups where menu_item_id = $1 order by created_at, id`, [id],
      ),
    ]);
    return { ...item, modifiers, modifierGroups };
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

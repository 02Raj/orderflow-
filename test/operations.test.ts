import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { AuditService } from '../src/server/audit/audit.service';
import { AuthService } from '../src/server/auth/auth.service';
import { BillingService } from '../src/server/billing/billing.service';
import { DatabaseService } from '../src/server/database/database.service';
import { Jwt } from '../src/server/jwt';
import { MenuService } from '../src/server/menu/menu.service';
import { OrdersService } from '../src/server/orders/orders.service';
import { ReportsService } from '../src/server/reports/reports.service';
import { RestaurantsService } from '../src/server/restaurants/restaurants.service';
import { TablesService } from '../src/server/tables/tables.service';
import { assertWritableSubscription } from '../src/server/subscription';
import { PAYMENTS_ENABLED } from '../src/lib/payments';
import { MAIL, SITE_DOMAIN, SITE_URL } from '../src/lib/site';
import type { AuthenticatedUser } from '../src/server/common/types';

delete process.env.DATABASE_URL;
process.env.JWT_SECRET = 'test-secret-orderflow-operations';
process.env.PGLITE_PATH = mkdtempSync(join(tmpdir(), 'orderflow-test-'));

const db = new DatabaseService();
const audit = new AuditService(db);
const jwt = new Jwt();
const auth = new AuthService(db, jwt, audit);
const restaurants = new RestaurantsService(db, audit);
const menu = new MenuService(db, audit);
const tables = new TablesService(db, audit);
const orders = new OrdersService(db, audit, restaurants);
const reports = new ReportsService(db, restaurants);
const billing = new BillingService(db, audit);

let owner: AuthenticatedUser;
let token: string;
let slug: string;
let tableId: string;
let qrToken: string;
let fishId: string;
let extraId: string;
let lemonadeId: string;

before(async () => {
  await db.init();
});

after(async () => {
  await db.close();
});

describe('site identity', () => {
  test('public domain and mailboxes are helloorderflow.com', () => {
    assert.equal(SITE_DOMAIN, 'helloorderflow.com');
    assert.equal(SITE_URL, 'https://helloorderflow.com');
    assert.equal(MAIL.hello, 'hello@helloorderflow.com');
    assert.equal(MAIL.privacy, 'privacy@helloorderflow.com');
    assert.equal(MAIL.security, 'security@helloorderflow.com');
  });

  test('paid checkout stays off until a gateway is wired', () => {
    assert.equal(PAYMENTS_ENABLED, false);
  });
});

describe('auth', () => {
  test('signup creates a GB venue with tables and a usable JWT', async () => {
    const res = await auth.signup({
      email: 'owner@harbour.test',
      password: 'correct-horse',
      fullName: 'Alex Owner',
      restaurantName: 'Harbour Test Kitchen',
      countryCode: 'GB',
    });
    token = res.token;
    owner = res.user;
    const venue = await restaurants.findById(owner.restaurantId);
    slug = venue.slug;
    assert.equal(owner.role, 'owner');
    assert.ok(token.length > 20);
    assert.equal(venue.currency, 'GBP');
    assert.equal(venue.taxInclusive, true);
    const dining = await tables.list(owner.restaurantId);
    assert.equal(dining.length, 8);
    tableId = dining[0].id;
    qrToken = dining[0].qrToken;
  });

  test('duplicate email is rejected', async () => {
    await assert.rejects(
      () =>
        auth.signup({
          email: 'owner@harbour.test',
          password: 'other',
          fullName: 'Other',
          restaurantName: 'Copy',
          countryCode: 'US',
        }),
      /already exists/,
    );
  });

  test('login succeeds with the same password and fails with a wrong one', async () => {
    const ok = await auth.login('owner@harbour.test', 'correct-horse');
    assert.equal(ok.user.id, owner.id);
    await assert.rejects(() => auth.login('owner@harbour.test', 'nope'), /Invalid email/);
  });

  test('owner can add kitchen staff who can log in', async () => {
    const staff = await auth.createStaff(owner, {
      email: 'pass@harbour.test',
      password: 'pass-word-9',
      fullName: 'Kim Pass',
      role: 'kitchen',
    });
    assert.equal(staff.role, 'kitchen');
    const session = await auth.login('pass@harbour.test', 'pass-word-9');
    assert.equal(session.user.role, 'kitchen');
    const listed = await auth.listStaff(owner.restaurantId);
    assert.ok(listed.some((row) => row.email === 'pass@harbour.test'));
  });
});

describe('menu, tables, QR', () => {
  test('paste-import builds categories and prices in minor units', async () => {
    const result = await menu.importFromText(
      owner,
      `Mains:\nFish pie 16.50\nDrinks:\nLemonade 3.5`,
    );
    assert.equal(result.items, 2);
    const full = await menu.getMenu(owner.restaurantId);
    assert.equal(full.categories.length, 2);
    const fish = full.items.find((i) => i.name === 'Fish pie');
    const lemonade = full.items.find((i) => i.name === 'Lemonade');
    assert.ok(fish && lemonade);
    assert.equal(fish.priceMinor, 1650);
    assert.equal(lemonade.priceMinor, 350);
    fishId = fish.id;
    lemonadeId = lemonade.id;
  });

  test('modifier can be added and 86 hides the item from the guest menu', async () => {
    const extra = await menu.addModifier(owner, fishId, {
      name: 'Extra mash',
      priceAdjustmentMinor: 150,
    });
    extraId = extra.id;
    await menu.updateItem(owner, lemonadeId, { isAvailable: false, unavailableReason: '86' });
    const guestMenu = await menu.getPublicMenu(owner.restaurantId);
    assert.ok(guestMenu.items.some((i) => i.id === fishId));
    assert.ok(!guestMenu.items.some((i) => i.id === lemonadeId));
  });

  test('QR token resolves the table; rotate invalidates the old token', async () => {
    const hit = await tables.findByToken(slug, qrToken);
    assert.ok(hit);
    assert.equal(hit.tableId, tableId);
    const rotated = await tables.rotateToken(owner, tableId);
    assert.notEqual(rotated.qrToken, qrToken);
    const stale = await tables.findByToken(slug, qrToken);
    assert.equal(stale, null);
    qrToken = rotated.qrToken;
    const fresh = await tables.findByToken(slug, qrToken);
    assert.ok(fresh);
  });

  test('venue settings save name and phone', async () => {
    const updated = await restaurants.update(owner, {
      name: 'Harbour & Test',
      phone: '+44 20 0000 0000',
    });
    assert.equal(updated.name, 'Harbour & Test');
    assert.equal(updated.phone, '+44 20 0000 0000');
  });
});

describe('guest order → kitchen → reports', () => {
  test('guest QR order prices fish plus modifier VAT-inclusive', async () => {
    const order = await orders.createGuestOrder({
      restaurantId: owner.restaurantId,
      tableId,
      clientRef: 'guest-1',
      customerLabel: 'Table 1',
      note: 'No peas',
      lines: [{ menuItemId: fishId, quantity: 1, modifierIds: [extraId], note: 'Crispy top' }],
    });
    assert.equal(order.status, 'new');
    assert.equal(order.totalMinor, 1800);
    assert.equal(order.subtotalMinor + order.taxMinor, order.totalMinor);
    assert.equal(order.items.length, 1);
    assert.equal(order.items[0].modifiers[0].name, 'Extra mash');
  });

  test('same clientRef is idempotent', async () => {
    const again = await orders.createGuestOrder({
      restaurantId: owner.restaurantId,
      tableId,
      clientRef: 'guest-1',
      lines: [{ menuItemId: fishId, quantity: 9 }],
    });
    assert.equal(again.items[0].quantity, 1);
  });

  test('86d item cannot be ordered', async () => {
    await assert.rejects(
      () =>
        orders.createGuestOrder({
          restaurantId: owner.restaurantId,
          tableId,
          clientRef: 'guest-86',
          lines: [{ menuItemId: lemonadeId, quantity: 1 }],
        }),
      /no longer available/,
    );
  });

  test('kitchen can walk new → served and line items pending → ready', async () => {
    const open = await orders.list(owner.restaurantId, { activeOnly: true });
    assert.equal(open.length, 1);
    const id = open[0].id;
    await orders.setStatus(owner, id, 'accepted');
    await orders.setStatus(owner, id, 'preparing');
    const withItem = await orders.setItemStatus(owner, id, open[0].items[0].id, 'preparing');
    await orders.setItemStatus(owner, id, withItem.items[0].id, 'ready');
    await orders.setStatus(owner, id, 'ready');
    const served = await orders.setStatus(owner, id, 'served');
    assert.equal(served.status, 'served');
    const stillOpen = await orders.list(owner.restaurantId, { activeOnly: true });
    assert.equal(stillOpen.length, 0);
  });

  test('illegal status jump is rejected', async () => {
    const extra = await orders.createGuestOrder({
      restaurantId: owner.restaurantId,
      tableId,
      clientRef: 'guest-2',
      lines: [{ menuItemId: fishId, quantity: 1 }],
    });
    await assert.rejects(() => orders.setStatus(owner, extra.id, 'served'), /Cannot move/);
    await orders.setStatus(owner, extra.id, 'cancelled', 'guest left');
  });

  test('day report counts the served ticket and ignores cancelled', async () => {
    const day = await reports.day(owner.restaurantId);
    assert.equal(day.orderCount, 1);
    assert.equal(day.grossMinor, 1800);
    assert.equal(day.cancelled.count, 1);
    assert.equal(day.topItems[0].name, 'Fish pie');
    assert.equal(day.currency, 'GBP');
  });
});

describe('tenants and billing gate', () => {
  test('second venue cannot read the first venue order or menu', async () => {
    const other = await auth.signup({
      email: 'other@venue.test',
      password: 'other-pass-1',
      fullName: 'Other Owner',
      restaurantName: 'Other Room',
      countryCode: 'US',
      taxRegion: 'TX',
    });
    const otherVenue = await restaurants.findById(other.user.restaurantId);
    assert.equal(otherVenue.currency, 'USD');
    const stolenMenu = await menu.getMenu(other.user.restaurantId);
    assert.equal(stolenMenu.items.length, 0);
    const firstOrders = await orders.list(owner.restaurantId, { limit: 5 });
    assert.ok(firstOrders.length > 0);
    await assert.rejects(
      () => orders.findById(other.user.restaurantId, firstOrders[0].id),
      /not found/i,
    );
  });

  test('expired trial does not block writes while payments are off', async () => {
    await db.query(
      `update subscriptions set trial_ends_at = $2, status = 'trialing' where restaurant_id = $1`,
      [owner.restaurantId, new Date(Date.now() - 86400000).toISOString()],
    );
    const status = await billing.status(owner.restaurantId);
    assert.equal(status.accessBlocked, false);
    await assertWritableSubscription(billing, owner.restaurantId);
    const dining = await tables.list(owner.restaurantId);
    const stillWorks = await orders.createGuestOrder({
      restaurantId: owner.restaurantId,
      tableId: dining[0].id,
      clientRef: 'after-trial',
      lines: [{ menuItemId: fishId, quantity: 1 }],
    });
    assert.equal(stillWorks.status, 'new');
  });
});

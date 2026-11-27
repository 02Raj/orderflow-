import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { AuditService } from '../src/server/audit/audit.service';
import { AuthService } from '../src/server/auth/auth.service';
import { BillingService } from '../src/server/billing/billing.service';
import { DatabaseService } from '../src/server/database/database.service';
import { Jwt, userFromToken } from '../src/server/jwt';
import { MenuService } from '../src/server/menu/menu.service';
import { businessDateFor, OrdersService } from '../src/server/orders/orders.service';
import { ReportsService } from '../src/server/reports/reports.service';
import { isOrderingOpen, RestaurantsService } from '../src/server/restaurants/restaurants.service';
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
  test('public domain and mailboxes are ordernflow.com', () => {
    assert.equal(SITE_DOMAIN, 'ordernflow.com');
    assert.equal(SITE_URL, 'https://ordernflow.com');
    assert.equal(MAIL.hello, 'hello@ordernflow.com');
    assert.equal(MAIL.privacy, 'privacy@ordernflow.com');
    assert.equal(MAIL.security, 'security@ordernflow.com');
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
  test('a duplicate table number returns a conflict the UI can display', async () => {
    await assert.rejects(() => tables.create(owner, { tableNumber: 1 }), {
      status: 409,
      message: 'Table 1 already exists. Choose a different number.',
    });
  });

  test('invalid table payloads are rejected before writing', async () => {
    for (const payload of [null, {}, { tableNumber: 1.5 }, { tableNumber: 0 }, { tableNumber: 2147483648 }, { tableNumber: 30, area: 4 }]) {
      await assert.rejects(() => tables.create(owner, payload), { status: 400 });
    }
  });

  test('area management preserves the QR through edits and deactivate/reactivate', async () => {
    const created = await tables.create(owner, { tableNumber: 30, label: ' Window ', area: ' Patio ' });
    assert.equal(created.label, 'Window');
    assert.equal(created.area, 'Patio');
    await assert.rejects(() => tables.update(owner, created.id, { tableNumber: 1 }), { status: 409 });
    const moved = await tables.update(owner, created.id, { tableNumber: 31, label: '', area: 'Main Hall' });
    assert.equal(moved.label, null);
    assert.equal(moved.area, 'Main Hall');
    assert.equal(moved.qrToken, created.qrToken);
    assert.equal((await tables.findByToken(slug, created.qrToken))?.tableNumber, 31);
    await tables.update(owner, created.id, { isActive: false });
    assert.equal(await tables.findByToken(slug, created.qrToken), null);
    const reactivated = await tables.update(owner, created.id, { isActive: true, area: null });
    assert.equal(reactivated.area, null);
    assert.equal((await tables.findByToken(slug, created.qrToken))?.tableId, created.id);
  });

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

  test('a failed database transaction rolls back all writes', async () => {
    await assert.rejects(() => db.transaction(async (tx) => {
      await tx.query('insert into order_counters (restaurant_id, business_date, last_number) values ($1, $2, $3)',
        [owner.restaurantId, '2099-01-01', 9]);
      throw new Error('simulate insert failure');
    }), /simulate insert failure/);
    const row = await db.one('select last_number from order_counters where restaurant_id = $1 and business_date = $2',
      [owner.restaurantId, '2099-01-01']);
    assert.equal(row, null);
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
    const recalled = await orders.recall(owner, id);
    assert.equal(recalled.status, 'ready');
    assert.equal((await orders.list(owner.restaurantId, { activeOnly: true })).length, 1);
    await orders.setStatus(owner, id, 'served');
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

  test('staff can create a takeaway with a pickup token and no table', async () => {
    const takeaway = await orders.createStaffOrder(owner, {
      restaurantId: owner.restaurantId,
      fulfillmentType: 'takeaway',
      clientRef: 'takeaway-alex',
      customerLabel: 'Alex',
      lines: [{ menuItemId: fishId, quantity: 1 }],
    });
    assert.equal(takeaway.fulfillmentType, 'takeaway');
    assert.equal(takeaway.tableId, null);
    assert.equal(takeaway.customerLabel, 'Alex');
    assert.ok(takeaway.orderNumber > 0);
    await orders.setStatus(owner, takeaway.id, 'cancelled', 'test cleanup');
  });

  test('takeaway requires a pickup name', async () => {
    await assert.rejects(() => orders.createStaffOrder(owner, {
      restaurantId: owner.restaurantId,
      fulfillmentType: 'takeaway',
      clientRef: 'takeaway-no-name',
      lines: [{ menuItemId: fishId, quantity: 1 }],
    }), /customer name/i);
  });

  test('venue can pause guest orders while staff can still take them', async () => {
    await restaurants.update(owner, { orderingPaused: true });
    const existing = await orders.createGuestOrder({
      restaurantId: owner.restaurantId, tableId, clientRef: 'guest-1',
      lines: [{ menuItemId: fishId, quantity: 1 }],
    });
    assert.equal(existing.items[0].quantity, 1);
    await assert.rejects(() => orders.createGuestOrder({
      restaurantId: owner.restaurantId, tableId, clientRef: 'paused-guest',
      lines: [{ menuItemId: fishId, quantity: 1 }],
    }), /not taking QR orders/);
    const staffOrder = await orders.createStaffOrder(owner, {
      restaurantId: owner.restaurantId, tableId, clientRef: 'paused-staff',
      lines: [{ menuItemId: fishId, quantity: 1 }],
    });
    assert.equal(staffOrder.status, 'new');
    await restaurants.update(owner, { orderingPaused: false });
  });

  test('opening hours use venue local time and support overnight service', () => {
    const hours = { orderingPaused: false, openingTime: '18:00', closingTime: '02:00', timezone: 'UTC' };
    assert.equal(isOrderingOpen(hours, new Date('2026-11-24T23:00:00Z')), true);
    assert.equal(isOrderingOpen(hours, new Date('2026-11-25T01:30:00Z')), true);
    assert.equal(isOrderingOpen(hours, new Date('2026-11-25T10:00:00Z')), false);
  });

  test('active boards keep older open tickets beyond the history limit', async () => {
    const [older, newer] = await Promise.all(['queue-first', 'queue-second'].map((clientRef) =>
      orders.createStaffOrder(owner, {
        restaurantId: owner.restaurantId, tableId, clientRef,
        lines: [{ menuItemId: fishId, quantity: 1 }],
      }),
    ));
    const active = await orders.list(owner.restaurantId, { activeOnly: true, limit: 1 });
    assert.ok(active.some((ticket) => ticket.id === older.id));
    assert.ok(active.some((ticket) => ticket.id === newer.id));
    assert.equal((await orders.list(owner.restaurantId, { limit: 1 })).length, 1);
  });

  test('concurrent acceptance and rejection cannot both commit', async () => {
    const ticket = await orders.createStaffOrder(owner, {
      restaurantId: owner.restaurantId, tableId, clientRef: 'concurrent-ack',
      lines: [{ menuItemId: fishId, quantity: 1 }],
    });
    const results = await Promise.allSettled([
      orders.setStatus(owner, ticket.id, 'accepted'),
      orders.setStatus(owner, ticket.id, 'cancelled', 'Kitchen closed'),
    ]);
    const accepted = results.filter((result) => result.status === 'fulfilled');
    assert.equal(accepted.length, 1);
    assert.equal((await orders.findById(owner.restaurantId, ticket.id)).status, accepted[0].value.status);
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

describe('password management', () => {
  test('user can change password and reset forgotten password via token', async () => {
    const res = await auth.signup({
      email: 'pw-reset@venue.test',
      password: 'initial-password',
      fullName: 'Reset User',
      restaurantName: 'Reset Room',
      countryCode: 'US',
      taxRegion: 'NYC',
    });

    await assert.rejects(
      () => auth.changePassword(res.user, 'wrong-pass', 'new-password-1'),
      /incorrect/i,
    );

    await auth.changePassword(res.user, 'initial-password', 'changed-password-1');
    await auth.login('pw-reset@venue.test', 'changed-password-1');

    const req = await auth.requestPasswordReset('pw-reset@venue.test');
    assert.equal(req.ok, true);
    assert.ok(req.devResetUrl);
    const token = new URL(req.devResetUrl!).searchParams.get('token')!;
    const attempts = await Promise.allSettled([
      auth.resetPassword(token, 'final-password-2'),
      auth.resetPassword(token, 'final-password-2'),
    ]);
    assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1);
    await auth.login('pw-reset@venue.test', 'final-password-2');
    await assert.rejects(() => auth.resetPassword(token, 'reused-token-3'), /invalid|expired/i);
  });
});

describe('live shift corrections and payments', () => {
  test('disabling and re-enabling staff never restores previously issued sessions', async () => {
    const email = 'shift-revocation@venue.test';
    const staff = await auth.createStaff(owner, { email, password: 'staff-password', fullName: 'Shift Staff', role: 'staff' });
    const original = await userFromToken((await auth.login(email, 'staff-password')).token);
    assert.equal(await auth.sessionIsCurrent(staff.id, owner.restaurantId, original.sessionVersion), true);
    await auth.setStaffActive(owner, staff.id, false);
    await assert.rejects(() => auth.login(email, 'staff-password'), /invalid/i);
    await auth.setStaffActive(owner, staff.id, true);
    assert.equal(await auth.sessionIsCurrent(staff.id, owner.restaurantId, original.sessionVersion), false);
    const current = await userFromToken((await auth.login(email, 'staff-password')).token);
    assert.equal(await auth.sessionIsCurrent(staff.id, owner.restaurantId, current.sessionVersion), true);
  });

  test('corrections update kitchen readiness and prevent duplicate external payments', async () => {
    const ticket = await orders.createStaffOrder(owner, {
      restaurantId: owner.restaurantId, tableId, clientRef: randomUUID(),
      lines: [{ menuItemId: fishId, quantity: 1 }],
    });
    await orders.setStatus(owner, ticket.id, 'accepted');
    const preparing = await orders.setStatus(owner, ticket.id, 'preparing');
    await assert.rejects(() => orders.setStatus(owner, ticket.id, 'ready'), /remaining items/);
    await orders.setStatus(owner, ticket.id, 'ready', undefined, true, new Date(preparing.updatedAt).toISOString());
    const itemId = randomUUID();
    const added = await orders.addItem(owner, ticket.id, { menuItemId: fishId, quantity: 1 }, itemId, 'Guest added another');
    assert.equal(added.status, 'preparing');
    assert.equal(added.totalMinor, ticket.totalMinor * 2);
    assert.equal(added.items.find((item) => item.id === itemId)?.status, 'pending');
    assert.match(added.correctionSummary ?? '', /Guest added another/);
    await assert.rejects(() => orders.addItem(owner, ticket.id, { menuItemId: fishId, quantity: 1 }, itemId, 'Retry'), /already been added/);
    const corrected = await orders.correctItem(owner, ticket.id, itemId, { quantity: 0, expectedQuantity: 1, reason: 'Guest changed mind' });
    assert.equal(corrected.items.length, 1);
    assert.equal(corrected.totalMinor, ticket.totalMinor);
    assert.match(corrected.correctionSummary ?? '', /Guest added another[\s\S]*Guest changed mind/);
    await assert.rejects(() => orders.acknowledgeCorrections(owner, ticket.id, added.correctionSummary), /ticket changed/i);
    const acknowledged = await orders.acknowledgeCorrections(owner, ticket.id, corrected.correctionSummary);
    assert.equal(acknowledged.correctionSummary, null);
    await assert.rejects(() => orders.recordPayment(owner, ticket.id, 'cash', added.totalMinor), /ticket has changed/i);

    const payments = await Promise.allSettled([
      orders.recordPayment(owner, ticket.id, 'cash', corrected.totalMinor),
      orders.recordPayment(owner, ticket.id, 'upi', corrected.totalMinor),
    ]);
    assert.equal(payments.filter((result) => result.status === 'fulfilled').length, 1);
    const paid = await orders.findById(owner.restaurantId, ticket.id);
    assert.equal(paid.paidMinor, corrected.totalMinor);
    await assert.rejects(() => orders.setStatus(owner, ticket.id, 'cancelled'), /payment reversal/);
    const date = businessDateFor(new Date(), (await restaurants.findById(owner.restaurantId)).timezone);
    assert.equal((await reports.range(owner.restaurantId, date, date)).collectedMinor, paid.paidMinor);
    const reversed = await orders.reversePayment(owner, ticket.id, 'Incorrect cash entry', new Date(paid.updatedAt).toISOString());
    assert.equal(reversed.paidMinor, 0);
    assert.equal((await reports.range(owner.restaurantId, date, date)).collectedMinor, 0);
    const ledger = (await reports.range(owner.restaurantId, date, date)).paymentsByMethod;
    assert.equal(ledger[0].reversedMinor, paid.paidMinor);
  });
});

test('required modifier groups validate QR, staff and ticket additions while preserving selected option IDs on edit', async () => {
  const latte = await menu.createItem(owner, { name: 'Modifier test latte', priceMinor: 400 });
  const { id: groupId } = await menu.saveModifierGroup(owner, latte.id, {
    name: 'Size', minChoices: 1, maxChoices: 1,
    options: [{ name: 'Regular', priceAdjustmentMinor: 0 }, { name: 'Large', priceAdjustmentMinor: 100 }],
  });
  const item = (await menu.getPublicMenu(owner.restaurantId)).items.find((entry) => entry.id === latte.id)!;
  assert.equal(item.modifierGroups?.[0].id, groupId);
  const large = item.modifiers.find((option) => option.name === 'Large')!;
  const regular = item.modifiers.find((option) => option.name === 'Regular')!;
  const order = (modifierIds: string[]) => ({
    restaurantId: owner.restaurantId, tableId, clientRef: randomUUID(),
    lines: [{ menuItemId: latte.id, quantity: 1, modifierIds }],
  });
  await assert.rejects(() => orders.createGuestOrder(order([])), /Size: choose at least 1/);
  await assert.rejects(() => orders.createStaffOrder(owner, order([large.id, regular.id])), /Size: choose up to 1/);
  const valid = await orders.createStaffOrder(owner, order([large.id]));
  assert.equal(valid.items[0].lineTotalMinor, 500);
  await assert.rejects(() => orders.addItem(owner, valid.id, order([]).lines[0], randomUUID(), 'One more'), /Size: choose at least 1/);
  await menu.saveModifierGroup(owner, latte.id, {
    name: 'Size', minChoices: 1, maxChoices: 1,
    options: [{ id: large.id, name: 'Large', priceAdjustmentMinor: 120 }],
  }, groupId);
  const added = await orders.addItem(owner, valid.id, order([large.id]).lines[0], randomUUID(), 'One more');
  assert.deepEqual(added.items.map((line) => line.lineTotalMinor).sort(), [500, 520]);
  await assert.rejects(() => orders.createStaffOrder(owner, order([regular.id])), /no longer available/);
});

describe('business locations', () => {
  test('switches the same owner between separate branches and keeps staff, QR codes and billing scoped', async () => {
    const root = await auth.signup({
      email: 'ss-owner@example.test', password: 'ss-password-1', fullName: 'SS Owner',
      restaurantName: 'SS Cafe Marina', countryCode: 'AE',
    });
    const marina = await userFromToken(root.token);
    const marinaVenue = await restaurants.findById(marina.restaurantId);
    const [marinaTable] = await tables.list(marina.restaurantId);
    const branch = await auth.createLocation(marina, { name: 'SS Cafe JLT', countryCode: 'AE' });
    const switched = await auth.switchLocation(marina, branch.id);
    const jlt = await userFromToken(switched.token);
    assert.equal(jlt.id, marina.id);
    assert.equal(jlt.restaurantId, branch.id);
    assert.equal(jlt.expiresAt, marina.expiresAt);
    assert.deepEqual((await auth.listLocations(jlt)).map(({ id }) => id), [branch.id, marina.restaurantId]);
    assert.equal((await auth.switchLocation(jlt, marina.restaurantId)).user.restaurantId, marina.restaurantId);
    await assert.rejects(() => auth.switchLocation(jlt, owner.restaurantId), /location not found/i);
    await assert.rejects(() => auth.createLocation(jlt, { name: 'SS Cafe JLT', countryCode: 'AE' }), /already has a location/i);

    const jltVenue = await restaurants.findById(jlt.restaurantId);
    const [jltTable] = await tables.list(jlt.restaurantId);
    assert.equal(jltVenue.currency, 'AED');
    assert.notEqual(jltTable.qrToken, marinaTable.qrToken);
    assert.equal((await tables.findByToken(marinaVenue.slug, marinaTable.qrToken))?.restaurantId, marina.restaurantId);
    assert.equal(await tables.findByToken(jltVenue.slug, marinaTable.qrToken), null);

    const category = await menu.createCategory(jlt, 'Coffee');
    const coffee = await menu.createItem(jlt, { categoryId: category.id, name: 'Latte', priceMinor: 1200 });
    const ticket = await orders.createGuestOrder({
      restaurantId: jlt.restaurantId, tableId: jltTable.id, clientRef: randomUUID(),
      lines: [{ menuItemId: coffee.id, quantity: 1 }],
    });
    assert.equal((await orders.findById(jlt.restaurantId, ticket.id)).id, ticket.id);
    await assert.rejects(() => orders.findById(marina.restaurantId, ticket.id), /not found/i);
    assert.equal((await menu.getPublicMenu(marina.restaurantId)).items.length, 0);

    const staff = await auth.createStaff(jlt, {
      email: 'ss-jlt-staff@example.test', password: 'ss-password-2', fullName: 'JLT Staff', role: 'manager',
    });
    const staffSession = await userFromToken((await auth.login(staff.email, 'ss-password-2')).token);
    assert.equal(staffSession.restaurantId, jlt.restaurantId);
    assert.equal(await auth.sessionIsCurrent(staffSession.id, marina.restaurantId, staffSession.sessionVersion), false);
    await assert.rejects(() => auth.switchLocation(staffSession, marina.restaurantId), /location not found/i);
    await assert.rejects(() => auth.createLocation(staffSession, { name: 'Staff branch', countryCode: 'AE' }), /business owner/i);

    await billing.markActive(jlt.restaurantId, { provider: 'mock', billing_interval: 'yearly' });
    assert.equal((await billing.status(jlt.restaurantId)).priceLabel, 'US$290 / year');
    assert.equal((await billing.status(marina.restaurantId)).status, 'trialing');
    const changed = await auth.changePassword(jlt, 'ss-password-1', 'ss-password-3');
    assert.equal(changed.user.restaurantId, jlt.restaurantId);
    assert.equal(await auth.sessionIsCurrent(jlt.id, jlt.restaurantId, jlt.sessionVersion), false);
    assert.equal(await auth.sessionIsCurrent(marina.id, marina.restaurantId, marina.sessionVersion), false);
  });
});

describe('dodo payments webhook', () => {
  test('verifies Standard Webhooks signature and activates / cancels subscription', async () => {
    const secretRaw = Buffer.from('test-dodo-webhook-secret-32-bytes!!').toString('base64');
    process.env.DODO_PAYMENTS_WEBHOOK_KEY = `whsec_${secretRaw}`;

    const sign = (id: string, ts: string, body: string) => {
      const mac = createHmac('sha256', Buffer.from(secretRaw, 'base64'))
        .update(`${id}.${ts}.${body}`)
        .digest('base64');
      return `v1,${mac}`;
    };

    const ts = String(Math.floor(Date.now() / 1000));
    const activeBody = JSON.stringify({
      type: 'subscription.active',
      data: {
        subscription_id: 'sub_dodo_123',
        customer: { customer_id: 'cus_dodo_123' },
        metadata: { restaurant_id: owner.restaurantId, billing_interval: 'yearly' },
      },
    });

    await assert.rejects(
      () => billing.handleDodoEvent(activeBody, { id: 'msg_1', timestamp: ts, signature: 'v1,bad' }),
      /invalid/i,
    );

    const accepted = await billing.handleDodoEvent(activeBody, {
      id: 'msg_1',
      timestamp: ts,
      signature: sign('msg_1', ts, activeBody),
    });
    assert.deepEqual(accepted, { received: true });

    const duplicate = await billing.handleDodoEvent(activeBody, {
      id: 'msg_1',
      timestamp: ts,
      signature: sign('msg_1', ts, activeBody),
    });
    assert.deepEqual(duplicate, { received: true, duplicate: true });

    const active = await billing.status(owner.restaurantId);
    assert.equal(active.status, 'active');
    assert.equal(active.provider, 'dodo');
    assert.equal(active.priceLabel, 'US$290 / year');

    const cancelBody = JSON.stringify({
      type: 'subscription.cancelled',
      data: { subscription_id: 'sub_dodo_123' },
    });
    await billing.handleDodoEvent(cancelBody, {
      id: 'msg_2',
      timestamp: ts,
      signature: sign('msg_2', ts, cancelBody),
    });

    const canceled = await billing.status(owner.restaurantId);
    assert.equal(canceled.status, 'canceled');
    delete process.env.DODO_PAYMENTS_WEBHOOK_KEY;
  });

  test('creates a test checkout with remaining trial and tax collection enabled', async () => {
    const originalFetch = globalThis.fetch;
    const originalAppUrl = process.env.APP_PUBLIC_URL;
    process.env.DODO_PAYMENTS_API_KEY = 'test_api_key';
    process.env.DODO_PRODUCT_ID = 'pdt_monthly_test';
    process.env.DODO_YEARLY_PRODUCT_ID = 'pdt_yearly_test';
    process.env.DODO_PAYMENTS_ENV = 'test_mode';
    process.env.APP_PUBLIC_URL = 'http://127.0.0.1:43123';
    await db.query(
      `update subscriptions
       set status = 'trialing', trial_ends_at = $2, provider_subscription_id = null
       where restaurant_id = $1`,
      [owner.restaurantId, new Date(Date.now() + 10 * 86400000).toISOString()],
    );

    let requestUrl = '';
    let requestBody: Record<string, unknown> = {};
    globalThis.fetch = async (input, init) => {
      requestUrl = String(input);
      requestBody = JSON.parse(String(init?.body));
      return Response.json({
        session_id: 'cks_test_123',
        checkout_url: 'https://test.checkout.dodopayments.com/session/cks_test_123',
      });
    };

    try {
      const checkout = await billing.createCheckout(
        owner,
        'http://127.0.0.1:43123/app/settings?billing=success',
        'https://attacker.example/steal',
      );
      assert.equal(checkout.mode, 'dodo');
      assert.match(checkout.url, /test\.checkout\.dodopayments\.com/);
      assert.equal(requestUrl, 'https://test.dodopayments.com/checkouts');
      assert.deepEqual(requestBody.product_cart, [{ product_id: 'pdt_monthly_test', quantity: 1 }]);
      assert.deepEqual(requestBody.subscription_data, { trial_period_days: 10 });
      assert.equal((requestBody.feature_flags as { allow_tax_id: boolean }).allow_tax_id, true);
      assert.match(String(requestBody.cancel_url), /^http:\/\/127\.0\.0\.1:43123\//);
      await billing.createCheckout(owner, '/app/settings', '/app/settings', 'yearly');
      assert.deepEqual(requestBody.product_cart, [{ product_id: 'pdt_yearly_test', quantity: 1 }]);
      assert.deepEqual(requestBody.metadata, { restaurant_id: owner.restaurantId, billing_interval: 'yearly' });
      await assert.rejects(() => billing.createCheckout(owner, '/', '/', 'high_volume'), /monthly or yearly/);
      delete process.env.DODO_YEARLY_PRODUCT_ID;
      await assert.rejects(() => billing.createCheckout(owner, '/', '/', 'yearly'), /currently unavailable/);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.DODO_PAYMENTS_API_KEY;
      delete process.env.DODO_PRODUCT_ID;
      delete process.env.DODO_YEARLY_PRODUCT_ID;
      delete process.env.DODO_PAYMENTS_ENV;
      if (originalAppUrl === undefined) delete process.env.APP_PUBLIC_URL;
      else process.env.APP_PUBLIC_URL = originalAppUrl;
    }
  });
});

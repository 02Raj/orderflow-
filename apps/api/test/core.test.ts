import { Injectable } from '@nestjs/common';
import { parseMenuText } from '../src/menu/menu.service';
import { computeTotals } from '../src/common/money';
import { businessDateFor } from '../src/orders/orders.service';
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('parseMenuText groups items under category headers', () => {
  const parsed = parseMenuText(`Mains:\nFish pie 16.50\nChicken 17\nDrinks:\nLemonade 3.5`);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].items[0].priceMinor, 1650);
  assert.equal(parsed[1].items[0].name, 'Lemonade');
});

test('VAT-inclusive totals stay receipt-accurate', () => {
  const totals = computeTotals(1650, { taxRateBp: 2000, taxInclusive: true });
  assert.equal(totals.totalMinor, 1650);
  assert.equal(totals.subtotalMinor + totals.taxMinor, 1650);
});

test('US tax-exclusive adds tax on top', () => {
  const totals = computeTotals(1000, { taxRateBp: 875, taxInclusive: false });
  assert.equal(totals.subtotalMinor, 1000);
  assert.equal(totals.totalMinor, 1088);
});

test('NYC vs Texas sales tax is exclusive and different', async () => {
  const { resolveRegion } = await import('../src/auth/tax-regions');
  const nyc = resolveRegion('US', 'NYC');
  const tx = resolveRegion('US', 'TX');
  assert.equal(nyc?.taxRateBp, 888);
  assert.equal(tx?.taxRateBp, 820);
  const nycTicket = computeTotals(1000, { taxRateBp: nyc!.taxRateBp, taxInclusive: false });
  const txTicket = computeTotals(1000, { taxRateBp: tx!.taxRateBp, taxInclusive: false });
  assert.equal(nycTicket.totalMinor, 1089);
  assert.equal(txTicket.totalMinor, 1082);
});

test('UAE VAT-inclusive advertised price is the total', () => {
  const totals = computeTotals(10500, { taxRateBp: 500, taxInclusive: true });
  assert.equal(totals.totalMinor, 10500);
  assert.equal(totals.taxMinor, 500);
  assert.equal(totals.subtotalMinor, 10000);
});

test('India restaurant GST 5% stays inside the menu price', () => {
  const totals = computeTotals(10500, { taxRateBp: 500, taxInclusive: true });
  assert.equal(totals.totalMinor, 10500);
  assert.equal(totals.taxMinor, 500);
});

test('businessDateFor uses venue timezone not UTC', () => {
  const lateUtc = new Date('2026-03-20T02:30:00.000Z');
  assert.equal(businessDateFor(lateUtc, 'America/New_York'), '2026-03-19');
});

test('global country presets include major markets', async () => {
  const { COUNTRY_PRESETS } = await import('../src/auth/country-presets');
  const codes = COUNTRY_PRESETS.map((p) => p.countryCode);
  for (const code of ['US', 'GB', 'IN', 'AE', 'SG', 'DE', 'BR', 'ZA', 'BH', 'OM', 'KW', 'AU', 'IE']) {
    assert.ok(codes.includes(code), `missing ${code}`);
  }
});

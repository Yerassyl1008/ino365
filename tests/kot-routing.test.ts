/**
 * Pure kitchen/bar ticket grouping (no printer IO).
 *
 * Usage: npx ts-node --transpile-only -P tests/tsconfig.json tests/kot-routing.test.ts
 */

import assert from 'node:assert/strict';
import {
  CAFE_BAR_CATEGORY_IDS,
  CAFE_KITCHEN_CATEGORY_IDS,
  CAFE_SKIP_KOT_CATEGORY_IDS,
} from '../shared/catalog-scope';
import { groupItemsByKitchenStations } from '../shared/kot-routing';

type Item = { id: string; categoryId: string };

const kitchen = {
  id: 'stn-express-kitchen',
  name: 'Kitchen',
  categoryIds: [...CAFE_KITCHEN_CATEGORY_IDS],
  printer: 'kitchen-printer',
};
const bar = {
  id: 'stn-express-bar',
  name: 'Bar',
  categoryIds: [...CAFE_BAR_CATEGORY_IDS],
  printer: 'bar-printer',
};
const stations = [kitchen, bar];
const resolve = (item: Item) => item.categoryId;

const soup: Item = { id: 'soup', categoryId: 'cat-express-soups' };
const cola: Item = { id: 'cola', categoryId: 'cat-express-soft-drinks' };
const vodka: Item = { id: 'vodka', categoryId: 'cat-express-alcohol' };
const cigarette: Item = { id: 'tobacco', categoryId: 'cat-express-tobacco' };
const custom: Item = { id: 'custom', categoryId: 'cat-custom-specials' };

const foodOnly = groupItemsByKitchenStations([soup], resolve, stations, CAFE_SKIP_KOT_CATEGORY_IDS);
assert.equal(foodOnly.length, 1);
assert.equal(foodOnly[0].stationName, 'Kitchen');
assert.equal(foodOnly[0].printer, 'kitchen-printer');
assert.deepEqual(foodOnly[0].items.map((item) => item.id), ['soup']);

const drinkOnly = groupItemsByKitchenStations([cola], resolve, stations, CAFE_SKIP_KOT_CATEGORY_IDS);
assert.equal(drinkOnly.length, 1);
assert.equal(drinkOnly[0].stationName, 'Bar');
assert.deepEqual(drinkOnly[0].items.map((item) => item.id), ['cola']);

const mixed = groupItemsByKitchenStations([soup, cola, vodka], resolve, stations, CAFE_SKIP_KOT_CATEGORY_IDS);
assert.equal(mixed.length, 2, 'mixed orders split into two tickets');
assert.deepEqual(mixed.find((group) => group.stationName === 'Kitchen')?.items.map((item) => item.id), ['soup']);
assert.deepEqual(mixed.find((group) => group.stationName === 'Bar')?.items.map((item) => item.id), ['cola', 'vodka']);

assert.deepEqual(
  groupItemsByKitchenStations([cigarette], resolve, stations, CAFE_SKIP_KOT_CATEGORY_IDS),
  [],
  'tobacco-only orders produce no kitchen/bar ticket',
);
assert.deepEqual(
  groupItemsByKitchenStations([], resolve, stations, CAFE_SKIP_KOT_CATEGORY_IDS),
  [],
  'empty orders produce no ticket groups',
);

const foodAndSkip = groupItemsByKitchenStations([soup, cigarette], resolve, stations, CAFE_SKIP_KOT_CATEGORY_IDS);
assert.equal(foodAndSkip.length, 1);
assert.deepEqual(foodAndSkip[0].items.map((item) => item.id), ['soup']);

const unmatched = groupItemsByKitchenStations([custom], resolve, stations, CAFE_SKIP_KOT_CATEGORY_IDS);
assert.equal(unmatched.length, 1);
assert.equal(unmatched[0].stationName, 'Kitchen');
assert.equal(unmatched[0].printer, null);
assert.deepEqual(unmatched[0].items.map((item) => item.id), ['custom']);

const noStations = groupItemsByKitchenStations([soup, cola], resolve, [], CAFE_SKIP_KOT_CATEGORY_IDS);
assert.equal(noStations.length, 1);
assert.equal(noStations[0].stationName, 'Kitchen');
assert.equal(noStations[0].items.length, 2);

console.log('Cafe kitchen/bar ticket grouping passed.');

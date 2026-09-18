/**
 * Integration Test: Issue #134 — Route kitchen tickets to per-category stations
 *
 * Replaces the earlier send_to_kitchen boolean idea. Each kitchen station
 * (kitchen, bar, dessert counter, etc.) can be linked to a printer and a set
 * of categories; KOT items are split and routed to whichever station
 * their category belongs to. A station printer is optional — mixed cafe
 * orders still produce two tickets (kitchen food / bar drinks), falling back
 * to the default printer until hardware is assigned. Skip categories
 * (tobacco) never print a kitchen/bar ticket. Items with no matching station,
 * and the whole order when no stations are configured at all, fall back to
 * the plain default-printer ticket — no behavior change for stores not using
 * stations.
 *
 * This tests routeItemsToStations() directly — no printer dispatch involved,
 * so it exercises the actual routing/grouping logic without touching network
 * or USB I/O.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/issue-134-station-routing.test.ts
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-issue-134-routing-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'test-secret-issue-134-routing';

const {
  initTestDb, seedCategory, seedProduct,
  assert, assertEqual, getResults, closeDatabase,
} = require('./helpers/test-setup');
const { routeItemsToStations } = require('../main/routes/printers');

function main() {
  console.log('Integration Test: Issue #134 — Station-based KOT routing');
  console.log('='.repeat(60));

  const db = initTestDb();

  seedCategory(db, 'cat-food', 'Food');
  seedCategory(db, 'cat-bev', 'Beverages');
  seedCategory(db, 'cat-dessert', 'Desserts');
  seedProduct(db, 'prod-food', 'cat-food', 'Sandwich', 150);
  seedProduct(db, 'prod-bev', 'cat-bev', 'Cola', 40);
  seedProduct(db, 'prod-dessert', 'cat-dessert', 'Brownie', 90);

  console.log('\n─── Scenario A: no stations configured — single ticket, default printer ───');
  {
    const items = [{ product_id: 'prod-food' }, { product_id: 'prod-bev' }];
    const groups = routeItemsToStations(db, items);
    assertEqual(groups.length, 1, 'A: exactly one group');
    assertEqual(groups[0].stationName, 'Kitchen', 'A: falls back to the generic Kitchen label');
    assert(groups[0].printer === null, 'A: printer is null (caller falls back to default printer)');
    assertEqual(groups[0].items.length, 2, 'A: both items stay in the one ticket');
  }

  console.log('\n─── Scenario B: bar station configured — beverages split to bar printer ───');
  {
    db.prepare(`INSERT INTO printers (id, name, connection_type, ip_address, port) VALUES ('pr-bar', 'Bar Printer', 'network', '192.168.1.60', 9100)`).run();
    db.prepare(`INSERT INTO kitchen_stations (id, name, category_ids, printer_id, is_active) VALUES ('stn-bar', 'Bar', ?, 'pr-bar', 1)`).run(JSON.stringify(['cat-bev']));

    const items = [{ product_id: 'prod-food' }, { product_id: 'prod-bev' }];
    const groups = routeItemsToStations(db, items);
    assertEqual(groups.length, 2, 'B: two groups — bar and fallback kitchen');

    const bar = groups.find((g: any) => g.stationName === 'Bar');
    assert(!!bar, 'B: a Bar group exists');
    assertEqual(bar.items.length, 1, 'B: Bar group has exactly the beverage');
    assertEqual(bar.items[0].product_id, 'prod-bev', 'B: Bar group item is the beverage');
    assertEqual(bar.printer.id, 'pr-bar', 'B: Bar group is routed to the bar printer');

    const kitchen = groups.find((g: any) => g.stationName === 'Kitchen');
    assert(!!kitchen, 'B: unmatched food item still lands on a fallback Kitchen ticket');
    assertEqual(kitchen.items.length, 1, 'B: Kitchen group has just the food item');
    assert(kitchen.printer === null, 'B: fallback Kitchen group uses the default printer');
  }

  console.log('\n─── Scenario C: two fully-covered stations — everything routed, no fallback ───');
  {
    db.prepare(`INSERT INTO printers (id, name, connection_type, ip_address, port) VALUES ('pr-kitchen', 'Kitchen Printer', 'network', '192.168.1.61', 9100)`).run();
    db.prepare(`INSERT INTO kitchen_stations (id, name, category_ids, printer_id, is_active) VALUES ('stn-kitchen', 'Kitchen', ?, 'pr-kitchen', 1)`).run(JSON.stringify(['cat-food', 'cat-dessert']));

    const items = [{ product_id: 'prod-food' }, { product_id: 'prod-bev' }, { product_id: 'prod-dessert' }];
    const groups = routeItemsToStations(db, items);
    assertEqual(groups.length, 2, 'C: two groups — Kitchen and Bar, no generic fallback');
    assert(!groups.some((g: any) => g.printer === null), 'C: no group falls back to the default printer');

    const kitchenGroup = groups.find((g: any) => g.stationName === 'Kitchen');
    assertEqual(kitchenGroup.items.length, 2, 'C: Kitchen group has food + dessert');
    const barGroup = groups.find((g: any) => g.stationName === 'Bar');
    assertEqual(barGroup.items.length, 1, 'C: Bar group has just the beverage');
  }

  console.log('\n─── Scenario D: inactive station is ignored ───');
  {
    db.prepare(`UPDATE kitchen_stations SET is_active = 0 WHERE id = 'stn-bar'`).run();
    const items = [{ product_id: 'prod-bev' }];
    const groups = routeItemsToStations(db, items);
    assertEqual(groups.length, 1, 'D: only the fallback Kitchen group remains');
    assertEqual(groups[0].stationName, 'Kitchen', 'D: beverage falls back once its station is deactivated');
    db.prepare(`UPDATE kitchen_stations SET is_active = 1 WHERE id = 'stn-bar'`).run();
  }

  console.log('\n─── Scenario E: station with no printer linked is skipped (misconfigured) ───');
  {
    db.prepare(`INSERT INTO kitchen_stations (id, name, category_ids, printer_id, is_active) VALUES ('stn-dessert', 'Dessert', ?, NULL, 1)`).run(JSON.stringify(['cat-dessert']));
    const items = [{ product_id: 'prod-dessert' }];
    const groups = routeItemsToStations(db, items);
    // stn-kitchen already claims cat-dessert from scenario C, so this should still route there
    assertEqual(groups.length, 1, 'E: dessert still routes via the station that has both a printer and the category');
    assertEqual(groups[0].stationName, 'Kitchen', 'E: unlinked Dessert station is ignored in favor of the configured one');
  }

  console.log('\n─── Scenario F: WebUSB station printer is skipped for backend KOT routing ───');
  {
    db.prepare('UPDATE kitchen_stations SET is_active = 0').run();
    db.prepare(`INSERT INTO printers (id, name, connection_type, ip_address, port) VALUES ('pr-webusb', 'Browser WebUSB', 'webusb', null, null)`).run();
    db.prepare(`INSERT INTO kitchen_stations (id, name, category_ids, printer_id, is_active) VALUES ('stn-webusb', 'Browser Bar', ?, 'pr-webusb', 1)`).run(JSON.stringify(['cat-bev']));

    const groups = routeItemsToStations(db, [{ product_id: 'prod-bev' }]);
    assertEqual(groups.length, 1, 'F: WebUSB station still produces one bar ticket');
    assertEqual(groups[0].stationName, 'Browser Bar', 'F: bar items keep the bar station label');
    assertEqual(groups[0].items[0].product_id, 'prod-bev', 'F: WebUSB station still receives the beverage');
    assert(groups[0].printer === null, 'F: WebUSB printer is not used for backend dispatch');
  }

  console.log('\n─── Scenario G: cafe kitchen + bar stations split tickets without printers ───');
  {
    const { seedExpressRestaurantCatalog } = require('../main/services/catalog-templates');
    db.prepare('DELETE FROM kitchen_stations').run();
    seedExpressRestaurantCatalog(db, 'en');

    const foodOnly = routeItemsToStations(db, [{ product_id: 'prod-express-domashnyaya-lapsha' }]);
    assertEqual(foodOnly.length, 1, 'G: food-only order is one ticket');
    assertEqual(foodOnly[0].stationName, 'Kitchen', 'G: food goes to Kitchen');
    assertEqual(foodOnly[0].items.length, 1, 'G: kitchen ticket has the food item');
    assert(foodOnly[0].printer === null, 'G: kitchen printer stays unassigned until Settings');

    const drinkOnly = routeItemsToStations(db, [{ product_id: 'prod-express-coca-cola' }]);
    assertEqual(drinkOnly.length, 1, 'G: drink-only order is one ticket');
    assertEqual(drinkOnly[0].stationName, 'Bar', 'G: drinks go to Bar');
    assertEqual(drinkOnly[0].items[0].product_id, 'prod-express-coca-cola', 'G: bar ticket has the drink');

    const mixed = routeItemsToStations(db, [
      { product_id: 'prod-express-domashnyaya-lapsha' },
      { product_id: 'prod-express-coca-cola' },
      { product_id: 'prod-express-absolut' },
    ]);
    assertEqual(mixed.length, 2, 'G: mixed order produces two tickets, not one combined ticket');
    const mixedKitchen = mixed.find((g: any) => g.stationName === 'Kitchen');
    const mixedBar = mixed.find((g: any) => g.stationName === 'Bar');
    assert(!!mixedKitchen && !!mixedBar, 'G: mixed order has Kitchen and Bar groups');
    assertEqual(mixedKitchen.items.length, 1, 'G: kitchen ticket has food only');
    assertEqual(mixedKitchen.items[0].product_id, 'prod-express-domashnyaya-lapsha', 'G: kitchen ticket is the soup');
    assertEqual(mixedBar.items.length, 2, 'G: bar ticket has both drinks');
    assert(mixedBar.items.some((item: any) => item.product_id === 'prod-express-coca-cola'), 'G: bar ticket includes cola');
    assert(mixedBar.items.some((item: any) => item.product_id === 'prod-express-absolut'), 'G: bar ticket includes alcohol');
  }

  console.log('\n─── Scenario H: tobacco and empty destinations do not print kitchen/bar tickets ───');
  {
    const tobaccoOnly = routeItemsToStations(db, [{ product_id: 'prod-express-esse-mango' }]);
    assertEqual(tobaccoOnly.length, 0, 'H: tobacco-only order prints no kitchen/bar ticket');

    const empty = routeItemsToStations(db, []);
    assertEqual(empty.length, 0, 'H: empty item list produces no ticket groups');

    const foodAndTobacco = routeItemsToStations(db, [
      { product_id: 'prod-express-pepperoni' },
      { product_id: 'prod-express-esse-mango' },
    ]);
    assertEqual(foodAndTobacco.length, 1, 'H: tobacco is omitted from a mixed food order');
    assertEqual(foodAndTobacco[0].stationName, 'Kitchen', 'H: remaining food still goes to Kitchen');
    assertEqual(foodAndTobacco[0].items.length, 1, 'H: only the pizza is on the kitchen ticket');
    assertEqual(foodAndTobacco[0].items[0].product_id, 'prod-express-pepperoni', 'H: kitchen ticket is the pizza');

    const unmatched = routeItemsToStations(db, [{ product_id: 'prod-food' }]);
    assertEqual(unmatched.length, 1, 'H: custom/unmapped categories default to Kitchen');
    assertEqual(unmatched[0].stationName, 'Kitchen', 'H: unmatched fallback label is Kitchen');
    assertEqual(unmatched[0].items[0].product_id, 'prod-food', 'H: unmatched item is kept on the kitchen ticket');
  }

  closeDatabase();
  fs.rmSync(testDir, { recursive: true, force: true });

  const { passed, failed, total } = getResults();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('FAILED');
    process.exit(1);
  } else {
    console.log('ALL PASSED');
  }
}

main();

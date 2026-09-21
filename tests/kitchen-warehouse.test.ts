/**
 * Kitchen warehouse: ingredients, tech cards, and recipe deduction on sale.
 *
 * Usage: node tests/run-electron-node-test.cjs tests/kitchen-warehouse.test.ts
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-kitchen-warehouse-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'test-secret-kitchen-warehouse';

const {
  initTestDb, createApp, startServer,
  seedOwnerUser, seedCategory, seedProduct, seedTable,
  api, assert, assertEqual, getResults, closeDatabase,
} = require('./helpers/test-setup');

const { registerRoutes } = require('../main/routes/index');
const { seedShashlikMenu } = require('../main/services/shashlik-seed');
const { MIGRATIONS, getCurrentSchemaVersion } = require('../main/db');

async function main() {
  console.log('Kitchen warehouse — ingredients, tech cards, POS deduction');
  console.log('='.repeat(60));

  const db = initTestDb();
  assertEqual(getCurrentSchemaVersion(), MIGRATIONS[MIGRATIONS.length - 1].version, 'schema includes kitchen warehouse migration');
  assert(!!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ingredients'").get(), 'ingredients table exists');
  assert(!!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'product_recipes'").get(), 'product_recipes table exists');

  const { authHeader } = seedOwnerUser(db);
  seedCategory(db, 'cat-wh', 'Grill');
  seedProduct(db, 'prod-plov', 'cat-wh', 'Plov', 1800);
  seedTable(db, 'tbl-wh-1', 1, 4);

  const app = createApp({});
  registerRoutes(app);
  const { baseUrl, server } = await startServer(app);

  try {
    console.log('\n─── Ingredients API ───');
    let res = await api(baseUrl, '/api/warehouse/ingredients', {
      method: 'POST',
      headers: authHeader,
      body: { name: 'Rice', unit: 'g', stock_quantity: 1000, low_stock_threshold: 200, cost_per_unit: 0.5 },
    });
    assertEqual(res.status, 201, 'create ingredient returns 201');
    const riceId = res.data.ingredient.id;

    res = await api(baseUrl, '/api/warehouse/ingredients', {
      method: 'POST',
      headers: authHeader,
      body: { name: 'Lamb', unit: 'g', stock_quantity: 500, low_stock_threshold: 100 },
    });
    assertEqual(res.status, 201, 'create lamb ingredient');
    const lambId = res.data.ingredient.id;

    res = await api(baseUrl, `/api/warehouse/recipes/prod-plov`, {
      method: 'PUT',
      headers: authHeader,
      body: { items: [{ ingredient_id: riceId, quantity: 120 }, { ingredient_id: lambId, quantity: 80 }] },
    });
    assertEqual(res.status, 200, 'save tech card');
    assertEqual(res.data.recipe.length, 2, 'tech card has two lines');

    console.log('\n─── Sale deducts recipe stock ───');
    const order = await api(baseUrl, '/api/orders', {
      method: 'POST',
      headers: authHeader,
      body: { type: 'dine_in', table_id: 'tbl-wh-1', items: [{ product_id: 'prod-plov', quantity: 2 }] },
    });
    assertEqual(order.status, 201, 'order with recipe item succeeds');
    const riceAfterSale = db.prepare('SELECT stock_quantity FROM ingredients WHERE id = ?').get(riceId).stock_quantity;
    const lambAfterSale = db.prepare('SELECT stock_quantity FROM ingredients WHERE id = ?').get(lambId).stock_quantity;
    assertEqual(riceAfterSale, 760, 'rice deducted 240g for 2 portions');
    assertEqual(lambAfterSale, 340, 'lamb deducted 160g for 2 portions');

    console.log('\n─── Insufficient ingredient stock ───');
    db.prepare('UPDATE ingredients SET stock_quantity = 50 WHERE id = ?').run(riceId);
    const blocked = await api(baseUrl, '/api/orders', {
      method: 'POST',
      headers: authHeader,
      body: { type: 'takeaway', items: [{ product_id: 'prod-plov', quantity: 1 }] },
    });
    assertEqual(blocked.status, 400, 'insufficient recipe stock is rejected');
    db.prepare('UPDATE ingredients SET stock_quantity = 760 WHERE id = ?').run(riceId);

    console.log('\n─── Cancel restores recipe stock ───');
    const orderId = order.data.order.id;
    const cancel = await api(baseUrl, `/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: authHeader,
      body: { status: 'cancelled', reason: 'Guest left' },
    });
    assertEqual(cancel.status, 200, 'cancel order');
    assertEqual(db.prepare('SELECT stock_quantity FROM ingredients WHERE id = ?').get(riceId).stock_quantity, 1000, 'rice restored on cancel');
    assertEqual(db.prepare('SELECT stock_quantity FROM ingredients WHERE id = ?').get(lambId).stock_quantity, 500, 'lamb restored on cancel');

    console.log('\n─── Receive / waste ───');
    res = await api(baseUrl, `/api/warehouse/ingredients/${riceId}/receive`, {
      method: 'POST',
      headers: authHeader,
      body: { quantity: 250, note: 'Supplier' },
    });
    assertEqual(res.status, 200, 'receive rice');
    assertEqual(res.data.ingredient.stock_quantity, 1250, 'rice received');

    res = await api(baseUrl, `/api/warehouse/ingredients/${riceId}/waste`, {
      method: 'POST',
      headers: authHeader,
      body: { quantity: 50, note: 'Spilled' },
    });
    assertEqual(res.status, 200, 'waste rice');
    assertEqual(res.data.ingredient.stock_quantity, 1200, 'rice wasted');

    console.log('\n─── Bulk count ───');
    const listed = await api(baseUrl, '/api/warehouse/ingredients', { headers: authHeader });
    assertEqual(listed.status, 200, 'list ingredients');
    assertEqual(listed.data.warehouse_enabled, true, 'warehouse tracking defaults on');

    res = await api(baseUrl, '/api/warehouse/count', {
      method: 'POST',
      headers: authHeader,
      body: {
        items: [
          { ingredient_id: riceId, quantity: 900 },
          { ingredient_id: lambId, quantity: 500 },
          { ingredient_id: '', quantity: 10 },
        ],
        note: 'Evening count',
      },
    });
    assertEqual(res.status, 200, 'bulk count succeeds');
    assertEqual(res.data.counted, 1, 'only changed rice is counted');
    assertEqual(res.data.skipped, 2, 'unchanged and empty rows skipped');
    assertEqual(db.prepare('SELECT stock_quantity FROM ingredients WHERE id = ?').get(riceId).stock_quantity, 900, 'rice counted to 900');
    assertEqual(db.prepare('SELECT stock_quantity FROM ingredients WHERE id = ?').get(lambId).stock_quantity, 500, 'lamb left as is');

    console.log('\n─── Warehouse optional ───');
    const disable = await api(baseUrl, '/api/settings/kitchen_warehouse_enabled', {
      method: 'PUT',
      headers: authHeader,
      body: { value: 'false' },
    });
    assertEqual(disable.status, 200, 'disable kitchen warehouse');
    db.prepare('UPDATE ingredients SET stock_quantity = 1 WHERE id = ?').run(riceId);
    const unblocked = await api(baseUrl, '/api/orders', {
      method: 'POST',
      headers: authHeader,
      body: { type: 'takeaway', items: [{ product_id: 'prod-plov', quantity: 1 }] },
    });
    assertEqual(unblocked.status, 201, 'POS sells when warehouse is off even with low stock');
    assertEqual(db.prepare('SELECT stock_quantity FROM ingredients WHERE id = ?').get(riceId).stock_quantity, 1, 'stock is not deducted when warehouse is off');

    const enable = await api(baseUrl, '/api/settings/kitchen_warehouse_enabled', {
      method: 'PUT',
      headers: authHeader,
      body: { value: 'true' },
    });
    assertEqual(enable.status, 200, 're-enable kitchen warehouse');
    const blockedAgain = await api(baseUrl, '/api/orders', {
      method: 'POST',
      headers: authHeader,
      body: { type: 'takeaway', items: [{ product_id: 'prod-plov', quantity: 1 }] },
    });
    assertEqual(blockedAgain.status, 400, 'insufficient recipe stock blocks again when warehouse is on');
    db.prepare('UPDATE ingredients SET stock_quantity = 900 WHERE id = ?').run(riceId);

    console.log('\n─── Shashlik demo seed ───');
    seedShashlikMenu(db, 'ru');
    const plov = db.prepare("SELECT name FROM products WHERE id = 'prod-demo-plov'").get();
    assertEqual(plov.name, 'Плов', 'shashlik seed localizes plov');
    const recipeCount = db.prepare("SELECT COUNT(*) AS count FROM product_recipes WHERE product_id = 'prod-demo-plov'").get().count;
    assert(recipeCount >= 4, 'plov tech card has rice, lamb, carrot, onion, oil');
    const mixGrill = db.prepare("SELECT name FROM products WHERE id = 'prod-demo-mix-grill'").get();
    assertEqual(mixGrill.name, 'Ассорти на мангале', 'expanded shashlik seed includes mixed grill');
    const sauceCount = db.prepare("SELECT COUNT(*) AS count FROM product_recipes WHERE product_id = 'prod-demo-sauce-garlic'").get().count;
    assert(sauceCount >= 2, 'garlic sauce has a tech card');
    const lambStock = db.prepare("SELECT stock_quantity FROM ingredients WHERE id = 'ing-lamb'").get().stock_quantity;
    assert(lambStock > 0, 'seeded lamb stock is available');

    const seedApi = await api(baseUrl, '/api/warehouse/seed-shashlik', {
      method: 'POST',
      headers: authHeader,
      body: { language: 'kk' },
    });
    assertEqual(seedApi.status, 200, 'seed-shashlik API succeeds');
    assert(seedApi.data.recipes > 0, 'seed-shashlik reports recipes');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    closeDatabase();
  }

  const { passed, failed } = getResults();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

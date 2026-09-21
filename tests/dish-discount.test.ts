/**
 * Catalog dish discounts by order type (dine-in / delivery / takeaway / online).
 *
 * Usage: node tests/run-electron-node-test.cjs tests/dish-discount.test.ts
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-dish-discount-'));
Module._load = function (request: string, parent: unknown, isMain: boolean) {
  if (request === 'electron') return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  return originalLoad.apply(this, arguments as any);
};

process.env.JWT_SECRET = 'test-secret-dish-discount';

const {
  catalogLineDiscount,
  dishDiscountApplies,
  discountedUnitPrice,
  visibleDishPrices,
} = require('../shared/dish-discount');
const {
  initTestDb, createApp, startServer,
  seedOwnerUser, seedCategory, seedProduct, seedTable,
  api, assert, assertEqual, getResults, closeDatabase,
} = require('./helpers/test-setup');
const { registerRoutes } = require('../main/routes/index');
const { MIGRATIONS, getCurrentSchemaVersion, getDatabase } = require('../main/db');

async function main() {
  console.log('Dish discounts by order type');
  console.log('='.repeat(60));

  console.log('\n─── Shared pricing helper ───');
  const pizza = {
    price: 1000,
    discount_type: 'percentage',
    discount_value: 10,
    discount_applies_to: ['delivery'],
  };
  assert(dishDiscountApplies(pizza, 'delivery'), '10% pizza applies to delivery');
  assert(!dishDiscountApplies(pizza, 'dine_in'), '10% pizza does not apply to dine-in');
  assertEqual(catalogLineDiscount(pizza, 'delivery', 1000, 1, 0), 100, 'delivery line discount is 100');
  assertEqual(catalogLineDiscount(pizza, 'dine_in', 1000, 1, 0), 0, 'dine-in line discount is 0');
  assertEqual(discountedUnitPrice(1000, 'percentage', 10), 900, 'unit price after 10% is 900');
  assertEqual(visibleDishPrices(pizza, 'delivery').discounted, 900, 'POS shows 900 on delivery');
  assertEqual(visibleDishPrices(pizza, 'dine_in').discounted, null, 'POS hides sale price on dine-in');
  assertEqual(catalogLineDiscount({
    discount_type: 'amount', discount_value: 50, discount_applies_to: ['dine_in', 'takeaway', 'delivery', 'online'],
  }, 'dine_in', 200, 2, 0), 100, 'flat 50 off is per unit (qty 2 → 100)');
  assertEqual(catalogLineDiscount({
    discount_type: 'percentage', discount_value: 10, discount_applies_to: ['dine_in'],
  }, 'dine_in', 500, 1, 50), 55, 'percent includes addon line total');

  const db = initTestDb();
  assertEqual(getCurrentSchemaVersion(), MIGRATIONS[MIGRATIONS.length - 1].version, 'schema includes dish discount migration');
  const cols = (getDatabase().prepare('PRAGMA table_info(products)').all() as Array<{ name: string }>).map((c) => c.name);
  assert(cols.includes('discount_type'), 'products.discount_type exists');
  assert(cols.includes('discount_value'), 'products.discount_value exists');
  assert(cols.includes('discount_applies_to'), 'products.discount_applies_to exists');

  const { authHeader } = seedOwnerUser(db);
  seedCategory(db, 'cat-dish', 'Mains');
  seedProduct(db, 'prod-pizza', 'cat-dish', 'Pizza', 1000);
  seedTable(db, 'tbl-dish-1', 1, 4);
  seedTable(db, 'tbl-dish-2', 2, 4);
  seedTable(db, 'tbl-dish-3', 3, 4);

  const app = createApp({});
  registerRoutes(app);
  const { baseUrl, server } = await startServer(app);

  try {
    console.log('\n─── Save catalog dish discount ───');
    let res = await api(baseUrl, '/api/products/prod-pizza', {
      method: 'PUT',
      headers: authHeader,
      body: {
        discount_type: 'percentage',
        discount_value: 10,
        discount_applies_to: ['delivery'],
      },
    });
    assertEqual(res.status, 200, 'PUT dish discount returns 200');
    assertEqual(res.data.product.discount_type, 'percentage', 'saved type is percentage');
    assertEqual(res.data.product.discount_value, 10, 'saved value is 10');
    assert(Array.isArray(res.data.product.discount_applies_to) && res.data.product.discount_applies_to.includes('delivery'), 'applies to delivery');
    assert(!res.data.product.discount_applies_to.includes('dine_in'), 'does not apply to dine-in');

    console.log('\n─── Pricing by order type ───');
    const dineIn = await api(baseUrl, '/api/orders', {
      method: 'POST',
      headers: authHeader,
      body: { type: 'dine_in', table_id: 'tbl-dish-1', items: [{ product_id: 'prod-pizza', quantity: 1 }] },
    });
    assertEqual(dineIn.status, 201, 'dine-in order created');
    assertEqual(dineIn.data.order.items[0].discount_amount, 0, 'dine-in pizza has no dish discount');
    assertEqual(dineIn.data.order.items[0].subtotal, 1000, 'dine-in pizza subtotal is full price');
    assertEqual(dineIn.data.order.subtotal, 1000, 'dine-in order subtotal is full price');

    const delivery = await api(baseUrl, '/api/orders', {
      method: 'POST',
      headers: authHeader,
      body: { type: 'delivery', items: [{ product_id: 'prod-pizza', quantity: 1 }] },
    });
    assertEqual(delivery.status, 201, 'delivery order created');
    assertEqual(delivery.data.order.items[0].discount_amount, 100, 'delivery pizza discount is 100');
    assertEqual(delivery.data.order.items[0].subtotal, 900, 'delivery pizza subtotal is 900');
    assertEqual(delivery.data.order.subtotal, 900, 'delivery order subtotal is 900');

    const takeaway = await api(baseUrl, '/api/orders', {
      method: 'POST',
      headers: authHeader,
      body: { type: 'takeaway', items: [{ product_id: 'prod-pizza', quantity: 1 }] },
    });
    assertEqual(takeaway.status, 201, 'takeaway order created');
    assertEqual(takeaway.data.order.items[0].discount_amount, 0, 'takeaway pizza has no dish discount');

    console.log('\n─── Client cannot inject item discount ───');
    const injected = await api(baseUrl, '/api/orders', {
      method: 'POST',
      headers: authHeader,
      body: {
        type: 'dine_in',
        table_id: 'tbl-dish-2',
        items: [{ product_id: 'prod-pizza', quantity: 1, discount_amount: 500 }],
      },
    });
    assertEqual(injected.status, 201, 'order with client discount_amount still created');
    assertEqual(injected.data.order.items[0].discount_amount, 0, 'client item discount is ignored');

    console.log('\n─── Tax preview follows order type ───');
    const previewDine = await api(baseUrl, '/api/tax/preview', {
      method: 'POST',
      headers: authHeader,
      body: { items: [{ product_id: 'prod-pizza', quantity: 1, addons: [] }], order_type: 'dine_in' },
    });
    assertEqual(previewDine.status, 200, 'dine-in preview succeeds');
    assertEqual(previewDine.data.summary.subtotal, 1000, 'dine-in preview is full price');

    const previewDelivery = await api(baseUrl, '/api/tax/preview', {
      method: 'POST',
      headers: authHeader,
      body: { items: [{ product_id: 'prod-pizza', quantity: 1, addons: [] }], order_type: 'delivery' },
    });
    assertEqual(previewDelivery.status, 200, 'delivery preview succeeds');
    assertEqual(previewDelivery.data.summary.subtotal, 900, 'delivery preview uses dish discount');
    assertEqual(previewDelivery.data.items[0].discount_amount, 100, 'preview item discount_amount is 100');

    console.log('\n─── Stacks under a bill discount ───');
    const stacked = await api(baseUrl, `/api/orders/${delivery.data.order.id}/discount`, {
      method: 'PATCH',
      headers: authHeader,
      body: { discount_type: 'percentage', discount_value: 10 },
    });
    assertEqual(stacked.status, 200, 'bill discount applies on discounted dish');
    assertEqual(stacked.data.order.subtotal, 900, 'bill discount does not restore dish price');
    assertEqual(stacked.data.order.discount_amount, 90, '10% bill discount is of remaining 900');

    console.log('\n─── Cafe + delivery ("оба") ───');
    res = await api(baseUrl, '/api/products/prod-pizza', {
      method: 'PUT',
      headers: authHeader,
      body: {
        discount_type: 'percentage',
        discount_value: 10,
        discount_applies_to: ['dine_in', 'delivery'],
      },
    });
    assertEqual(res.status, 200, 'оба channels saved');
    const bothDine = await api(baseUrl, '/api/orders', {
      method: 'POST',
      headers: authHeader,
      body: { type: 'dine_in', table_id: 'tbl-dish-3', items: [{ product_id: 'prod-pizza', quantity: 1 }] },
    });
    assertEqual(bothDine.status, 201, 'оба dine-in order created');
    assertEqual(bothDine.data.order.items[0].discount_amount, 100, 'оба: dine-in gets discount');
    const bothTakeaway = await api(baseUrl, '/api/orders', {
      method: 'POST',
      headers: authHeader,
      body: { type: 'takeaway', items: [{ product_id: 'prod-pizza', quantity: 1 }] },
    });
    assertEqual(bothTakeaway.data.order.items[0].discount_amount, 0, 'оба: takeaway stays full price');

    console.log('\n─── Clear dish discount ───');
    res = await api(baseUrl, '/api/products/prod-pizza', {
      method: 'PUT',
      headers: authHeader,
      body: { discount_type: null, discount_value: 0, discount_applies_to: [] },
    });
    assertEqual(res.status, 200, 'clear discount returns 200');
    assertEqual(res.data.product.discount_value, 0, 'discount_value cleared');
    assertEqual(res.data.product.discount_type, null, 'discount_type cleared');
    const afterClear = await api(baseUrl, '/api/orders', {
      method: 'POST',
      headers: authHeader,
      body: { type: 'delivery', items: [{ product_id: 'prod-pizza', quantity: 1 }] },
    });
    assertEqual(afterClear.data.order.items[0].discount_amount, 0, 'cleared discount is not applied');
    assertEqual(afterClear.data.order.subtotal, 1000, 'cleared discount uses full price');

    console.log('\n─── Validation ───');
    res = await api(baseUrl, '/api/products/prod-pizza', {
      method: 'PUT',
      headers: authHeader,
      body: { discount_type: 'percentage', discount_value: 150, discount_applies_to: ['delivery'] },
    });
    assertEqual(res.status, 400, 'percent over 100 is rejected');
    res = await api(baseUrl, '/api/products/prod-pizza', {
      method: 'PUT',
      headers: authHeader,
      body: { discount_type: 'percentage', discount_value: 10, discount_applies_to: [] },
    });
    assertEqual(res.status, 400, 'empty applies-to is rejected');
  } finally {
    server.close();
    closeDatabase();
  }

  const { passed, failed, total } = getResults();
  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

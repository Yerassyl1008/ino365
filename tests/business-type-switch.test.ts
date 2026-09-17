/**
 * Switching cafe ↔ shop via PUT /settings/business must not wipe catalog data.
 *
 * Run: node tests/run-electron-node-test.cjs tests/business-type-switch.test.ts
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-business-type-'));

const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') {
    return {
      app: {
        isPackaged: true,
        getPath: () => tempDir,
        getVersion: () => '1.0.0-test',
      },
    };
  }
  return originalLoad.apply(this, arguments);
};

const assert = require('node:assert/strict');

const {
  createApp,
  startServer,
  seedOwnerUser,
  seedCategory,
  seedProduct,
  seedTable,
  api,
  initTestDb,
  getDatabase,
  closeDatabase,
} = require('./helpers/test-setup');

const { settingsRoutes } = require('../main/routes/settings');
const { categoryRoutes } = require('../main/routes/categories');
const { productRoutes } = require('../main/routes/products');
const { warehouseRoutes } = require('../main/routes/warehouse');
const { cloudSync } = require('../main/services/cloud-sync');

function setting(key: string): string | null {
  const row = getDatabase().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function count(table: string): number {
  return (getDatabase().prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
}

async function main() {
  console.log('Business type switch without data reset');
  console.log('='.repeat(60));

  const originalRefreshRegistrationProfile = cloudSync.refreshRegistrationProfile.bind(cloudSync);
  cloudSync.refreshRegistrationProfile = () => {};

  const db = initTestDb();
  const app = createApp({
    '/api/settings': settingsRoutes,
    '/api/categories': categoryRoutes,
    '/api/products': productRoutes,
    '/api/warehouse': warehouseRoutes,
  });
  const { baseUrl, server } = await startServer(app);

  try {
    const owner = seedOwnerUser(db);
    seedCategory(db, 'cat-switch', 'Drinks');
    seedProduct(db, 'prod-switch', 'cat-switch', 'Cola', 250, { track_inventory: true, stock_quantity: 12 });
    db.prepare(`
      INSERT OR IGNORE INTO categories (id, name, sort_order, is_active, business_scope, created_at, updated_at)
      VALUES ('cat-demo-grill', 'Шашлык', 2, 1, 'restaurant', datetime('now'), datetime('now'))
    `).run();
    seedProduct(db, 'prod-demo-shashlik-lamb', 'cat-demo-grill', 'Шашлык', 2800);
    seedTable(db, 'tbl-switch', 1, 4);
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('kds_enabled', 'true', datetime('now'))").run();
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('tables_required', 'true', datetime('now'))").run();
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('business_type', 'restaurant', datetime('now'))").run();

    const getBefore = await api(baseUrl, '/api/settings/business', { headers: owner.authHeader });
    assert.equal(getBefore.status, 200, 'GET /settings/business returns 200');
    assert.equal(getBefore.data.business_type, 'restaurant', 'fresh tenant reports restaurant');

    const toShop = await api(baseUrl, '/api/settings/business', {
      method: 'PUT',
      body: { business_type: 'retail' },
      headers: owner.authHeader,
    });
    assert.equal(toShop.status, 200, 'PUT business_type=retail succeeds');
    assert.equal(toShop.data.business_type, 'retail', 'response reports shop mode');
    assert.equal(setting('business_type'), 'retail', 'shop mode is persisted');
    assert.equal(setting('kds_enabled'), 'true', 'kitchen display setting is left untouched');
    assert.equal(setting('tables_required'), 'true', 'tables_required is left untouched');
    assert.equal(count('products'), 2, 'products are not deleted');
    assert.equal(count('tables'), 1, 'tables are not deleted');
    const stock = getDatabase().prepare('SELECT stock_quantity FROM products WHERE id = ?').get('prod-switch') as { stock_quantity: number };
    assert.equal(stock.stock_quantity, 12, 'product stock is unchanged');

    const shopCategories = await api(baseUrl, '/api/categories?active=1', { headers: owner.authHeader });
    assert.equal(shopCategories.status, 200, 'GET /categories in shop mode succeeds');
    const shopCategoryIds = (shopCategories.data.categories as Array<{ id: string }>).map((row) => row.id);
    assert.ok(shopCategoryIds.includes('cat-switch'), 'merchant drinks stay visible in shop mode');
    assert.ok(!shopCategoryIds.includes('cat-demo-grill'), 'shashlik category is hidden in shop mode');

    const shopProducts = await api(baseUrl, '/api/products?active=1', { headers: owner.authHeader });
    assert.equal(shopProducts.status, 200, 'GET /products in shop mode succeeds');
    const shopProductIds = (shopProducts.data.products as Array<{ id: string }>).map((row) => row.id);
    assert.ok(shopProductIds.includes('prod-switch'), 'shop still sells cola');
    assert.ok(!shopProductIds.includes('prod-demo-shashlik-lamb'), 'shashlik product is hidden in shop mode');
    assert.equal(
      (getDatabase().prepare("SELECT COUNT(*) AS count FROM products WHERE id = 'prod-demo-shashlik-lamb'").get() as { count: number }).count,
      1,
      'hidden cafe products remain in the database',
    );

    const seedBlocked = await api(baseUrl, '/api/warehouse/seed-shashlik', {
      method: 'POST',
      body: {},
      headers: owner.authHeader,
    });
    assert.equal(seedBlocked.status, 403, 'shop mode cannot load the kitchen shashlik menu');

    const invalid = await api(baseUrl, '/api/settings/business', {
      method: 'PUT',
      body: { business_type: 'pharmacy' },
      headers: owner.authHeader,
    });
    assert.equal(invalid.status, 400, 'unknown business type is rejected');
    assert.equal(setting('business_type'), 'retail', 'rejected type does not overwrite shop mode');

    const toCafe = await api(baseUrl, '/api/settings/business', {
      method: 'PUT',
      body: { business_type: 'restaurant' },
      headers: owner.authHeader,
    });
    assert.equal(toCafe.status, 200, 'PUT business_type=restaurant succeeds');
    assert.equal(toCafe.data.business_type, 'restaurant', 'response reports cafe mode');
    assert.equal(count('products'), 2, 'switching back still keeps products');
    assert.equal(count('tables'), 1, 'switching back still keeps tables');

    const cafeCategories = await api(baseUrl, '/api/categories?active=1', { headers: owner.authHeader });
    const cafeCategoryIds = (cafeCategories.data.categories as Array<{ id: string }>).map((row) => row.id);
    assert.ok(cafeCategoryIds.includes('cat-demo-grill'), 'shashlik category returns in cafe mode');

    getDatabase().prepare("UPDATE categories SET business_scope = 'restaurant' WHERE id = 'cat-switch'").run();
    const toShopWithTemplate = await api(baseUrl, '/api/settings/business', {
      method: 'PUT',
      body: { business_type: 'retail' },
      headers: owner.authHeader,
    });
    assert.equal(toShopWithTemplate.status, 200, 'second switch to shop succeeds');
    assert.ok(
      getDatabase().prepare("SELECT id FROM categories WHERE id = 'cat-express-grocery' AND deleted_at IS NULL").get(),
      'empty shop catalog receives the grocery template',
    );
    assert.equal(
      (getDatabase().prepare('SELECT COUNT(*) AS count FROM products').get() as { count: number }).count,
      7,
      'shop template adds products without deleting cafe rows',
    );

    console.log('\n✅ Business type can switch without wiping store data');
  } finally {
    cloudSync.refreshRegistrationProfile = originalRefreshRegistrationProfile;
    server.close();
    try { closeDatabase(); } catch {}
    Module._load = originalLoad;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  try { closeDatabase(); } catch {}
  Module._load = originalLoad;
  fs.rmSync(tempDir, { recursive: true, force: true });
  process.exit(1);
});

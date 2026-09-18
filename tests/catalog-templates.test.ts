/**
 * Express restaurant seed: the venue cafe menu (categories, KZT prices, compositions).
 *
 * Usage: node tests/run-electron-node-test.cjs tests/catalog-templates.test.ts
 */

const Module = require('module');
const originalLoad = Module._load;
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flo-catalog-templates-'));
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return { app: { isPackaged: true, getPath: () => testDir, getVersion: () => 'test' } };
  return originalLoad.apply(this, arguments as any);
};

const assert = require('node:assert/strict');
const { initTestDb, closeDatabase } = require('./helpers/test-setup');
const {
  EXPRESS_RESTAURANT_MENU,
  EXPRESS_RESTAURANT_CATEGORY_COUNT,
  EXPRESS_RESTAURANT_PRODUCT_COUNT,
  seedExpressRestaurantCatalog,
} = require('../main/services/catalog-templates');

function count(db: any, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE deleted_at IS NULL`).get() as { count: number }).count;
}

async function main() {
  console.log('Express restaurant catalog seed');
  console.log('='.repeat(60));

  assert.equal(EXPRESS_RESTAURANT_CATEGORY_COUNT, 14, 'menu defines 14 kitchen categories');
  assert.equal(EXPRESS_RESTAURANT_PRODUCT_COUNT, 97, 'menu defines 97 sellable items');
  const ids = EXPRESS_RESTAURANT_MENU.flatMap((category: { id: string; items: Array<{ id: string }> }) => [
    category.id,
    ...category.items.map((item) => item.id),
  ]);
  assert.equal(new Set(ids).size, ids.length, 'seed ids are unique');

  const db = initTestDb();
  try {
    seedExpressRestaurantCatalog(db, 'en');
    seedExpressRestaurantCatalog(db, 'en');

    assert.equal(count(db, 'categories'), 14, 'seed is idempotent for categories');
    assert.equal(count(db, 'products'), 97, 'seed is idempotent for products and does not drop dishes');

    const categoryNames = (db.prepare(
      'SELECT name FROM categories WHERE deleted_at IS NULL ORDER BY sort_order, name',
    ).all() as Array<{ name: string }>).map((row) => row.name);
    assert.deepEqual(categoryNames, [
      'Первые блюда',
      'Салаты',
      'Пицца',
      'Суши',
      'Шашлык',
      'Гарниры',
      'Холодные закуски',
      'Соусы',
      'Закуски к пиву',
      'Хлебное ассорти и выпечка',
      'Горячие напитки',
      'Напитки и лимонады',
      'Спиртные напитки',
      'Табачные изделия и прочее',
    ], 'category names stay Russian for kitchen / Z-report departments');

    const scopes = db.prepare(
      'SELECT DISTINCT business_scope AS scope FROM categories WHERE deleted_at IS NULL',
    ).all() as Array<{ scope: string }>;
    assert.ok(scopes.every((row) => row.scope === 'restaurant'), 'cafe menu categories are restaurant-scoped');

    const lapsha = db.prepare(
      "SELECT price, description, category_id FROM products WHERE name = 'Домашняя лапша'",
    ).get() as { price: number; description: string; category_id: string };
    assert.equal(lapsha.price, 1590);
    assert.equal(lapsha.description, 'лапша, картофель, морковь, курица');
    assert.equal(lapsha.category_id, 'cat-express-soups');

    const aitsultan = db.prepare(
      "SELECT price, description FROM products WHERE name = 'Фирменный салат «Айтсултан»'",
    ).get() as { price: number; description: string };
    assert.equal(aitsultan.price, 2600);
    assert.equal(aitsultan.description, 'куриное филе, мясо говядина, огурцы, яйцо, горох, кукуруза, соус, чипсы, чечил');

    const krylyshki = db.prepare(
      "SELECT price, description FROM products WHERE name = 'Крылышки' AND category_id = 'cat-express-shashlik'",
    ).get() as { price: number; description: string | null };
    assert.equal(krylyshki.price, 650);
    assert.equal(krylyshki.description, null, 'shashlik items without composition stay description-less');

    const philadelphia = db.prepare("SELECT price FROM products WHERE name = 'Филадельфия'").get() as { price: number };
    assert.equal(philadelphia.price, 2590);

    const absolut = db.prepare("SELECT price FROM products WHERE name = 'Абсолют Оригинал'").get() as { price: number };
    assert.equal(absolut.price, 11000);

    const esse = db.prepare("SELECT price FROM products WHERE name = 'Esse Манго'").get() as { price: number };
    assert.equal(esse.price, 1800);

    const breadAssorti = db.prepare(
      "SELECT price, description FROM products WHERE name = 'Хлебное ассорти'",
    ).get() as { price: number; description: string };
    assert.equal(breadAssorti.price, 2300);
    assert.equal(breadAssorti.description, 'бауырсак (5 шт), каттама (2 вида), лепешки (2 шт), черный хлеб');

    const genericFood = db.prepare(
      "SELECT COUNT(*) AS count FROM categories WHERE name IN ('Food', 'Еда', 'Meal') AND deleted_at IS NULL",
    ).get() as { count: number };
    assert.equal(genericFood.count, 0, 'generic Food/Meal buckets are not the cafe default');

    const stations = db.prepare(
      'SELECT id, name, category_ids FROM kitchen_stations ORDER BY sort_order, name',
    ).all() as Array<{ id: string; name: string; category_ids: string }>;
    assert.equal(stations.length, 2, 'cafe seed creates kitchen and bar stations');
    const kitchen = stations.find((station) => station.id === 'stn-express-kitchen');
    const bar = stations.find((station) => station.id === 'stn-express-bar');
    assert.ok(kitchen, 'kitchen station id is stable');
    assert.ok(bar, 'bar station id is stable');
    assert.equal(kitchen?.name, 'Kitchen');
    assert.equal(bar?.name, 'Bar');
    assert.deepEqual(JSON.parse(kitchen?.category_ids || '[]'), [
      'cat-express-soups',
      'cat-express-salads',
      'cat-express-pizza',
      'cat-express-sushi',
      'cat-express-shashlik',
      'cat-express-sides',
      'cat-express-cold-apps',
      'cat-express-sauces',
      'cat-express-beer-snacks',
      'cat-express-bakery',
    ]);
    assert.deepEqual(JSON.parse(bar?.category_ids || '[]'), [
      'cat-express-hot-drinks',
      'cat-express-soft-drinks',
      'cat-express-alcohol',
    ]);

    const {
      CAFE_KITCHEN_CATEGORY_IDS,
      CAFE_BAR_CATEGORY_IDS,
      CAFE_SKIP_KOT_CATEGORY_IDS,
    } = require('../shared/catalog-scope');
    const routed = new Set([
      ...CAFE_KITCHEN_CATEGORY_IDS,
      ...CAFE_BAR_CATEGORY_IDS,
      ...CAFE_SKIP_KOT_CATEGORY_IDS,
    ]);
    assert.deepEqual(
      [...routed].sort(),
      EXPRESS_RESTAURANT_MENU.map((category: { id: string }) => category.id).sort(),
      'every cafe category is kitchen, bar, or cashier-only skip',
    );

    seedExpressRestaurantCatalog(db, 'ru');
    const renamed = db.prepare('SELECT name FROM kitchen_stations WHERE id = ?').get('stn-express-kitchen') as { name: string };
    assert.equal(renamed.name, 'Kitchen', 'station seed does not overwrite an existing kitchen station');

    console.log(`   ✓ seeded ${EXPRESS_RESTAURANT_PRODUCT_COUNT} dishes in ${EXPRESS_RESTAURANT_CATEGORY_COUNT} categories`);
  } finally {
    closeDatabase();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

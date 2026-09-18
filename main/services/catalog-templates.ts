import type Database from 'better-sqlite3';
import { now } from '../db';
import {
  CAFE_BAR_CATEGORY_IDS,
  CAFE_BAR_STATION_ID,
  CAFE_KITCHEN_CATEGORY_IDS,
  CAFE_KITCHEN_STATION_ID,
  CATEGORY_SCOPE_SQL,
  normalizeCatalogBusinessType,
  type CatalogBusinessType,
} from '../../shared/catalog-scope';

type SeedDb = Database.Database;
type SeedLanguage = 'en' | 'ru' | 'kk';

function seedLanguage(language?: string): SeedLanguage {
  return language === 'ru' || language === 'kk' ? language : 'en';
}

const EXPRESS_SHOP: Record<SeedLanguage, Record<'grocery' | 'drinks' | 'household' | 'water' | 'cola' | 'bread' | 'milk' | 'soap', string>> = {
  en: { grocery: 'Grocery', drinks: 'Drinks', household: 'Household', water: 'Water 0.5L', cola: 'Cola 0.5L', bread: 'Bread', milk: 'Milk 1L', soap: 'Soap' },
  ru: { grocery: 'Продукты', drinks: 'Напитки', household: 'Бытовое', water: 'Вода 0.5 л', cola: 'Кола 0.5 л', bread: 'Хлеб', milk: 'Молоко 1 л', soap: 'Мыло' },
  kk: { grocery: 'Азық-түлік', drinks: 'Сусындар', household: 'Тұрмыс', water: 'Су 0.5 л', cola: 'Кола 0.5 л', bread: 'Нан', milk: 'Сүт 1 л', soap: 'Сабын' },
};

export type CafeMenuItem = {
  id: string;
  name: string;
  price: number;
  description?: string;
};

export type CafeMenuCategory = {
  id: string;
  name: string;
  color: string;
  icon: string;
  items: CafeMenuItem[];
};

/**
 * Venue restaurant catalog (Russian names as sold). Used by the recommended
 * Express first-run profile and by ensureCatalogForBusinessType for cafe mode.
 * Ticket routing lives in shared/catalog-scope.ts: food-like categories →
 * Kitchen, drinks → Bar, tobacco → cashier-only (no kitchen/bar ticket).
 */
export const EXPRESS_RESTAURANT_MENU: CafeMenuCategory[] = [
  {
    id: 'cat-express-soups',
    name: 'Первые блюда',
    color: '#EA580C',
    icon: '🍲',
    items: [
      { id: 'prod-express-domashnyaya-lapsha', name: 'Домашняя лапша', price: 1590, description: 'лапша, картофель, морковь, курица' },
      { id: 'prod-express-shurpa-baranina', name: 'Шурпа из баранины', price: 1800, description: 'мясо/ребра баранины, картофель, морковь' },
      { id: 'prod-express-ramen', name: 'Рамён', price: 2200, description: 'рамён, лапша, курица, яйцо, соевый соус' },
      { id: 'prod-express-nokhat-shurpa', name: 'Нохат шурпа', price: 1700, description: 'мясо баранины, картофель, морковь, болгарский перец' },
      { id: 'prod-express-solyanka', name: 'Солянка', price: 2000, description: 'охотничьи сосиски, мясо, колбаса, картофель, маслины, томат, соленые огурцы, карбонад' },
      { id: 'prod-express-pelmeni', name: 'Пельмени', price: 1700, description: 'фарш из говядины, лук' },
      { id: 'prod-express-mampar', name: 'Мампар', price: 1600, description: 'мясо, картофель, лук, томат' },
      { id: 'prod-express-kuksi', name: 'Кукси', price: 1700, description: 'лапша, огурцы, яйца, мясо, омлет' },
      { id: 'prod-express-mastava', name: 'Мастава', price: 1690, description: 'лапша, мясо, картофель, морковь, лук, болгарский перец' },
      { id: 'prod-express-naryn', name: 'Нарын', price: 1650, description: 'казы, мясо, тесто' },
    ],
  },
  {
    id: 'cat-express-salads',
    name: 'Салаты',
    color: '#16A34A',
    icon: '🥗',
    items: [
      { id: 'prod-express-horetiko', name: 'Хоретико', price: 1790, description: 'помидоры, огурцы, светофор, маслины, красный лук, лимон, фетакса, лист салата, оливковое масло' },
      { id: 'prod-express-caesar-chicken', name: 'Цезарь с курицей', price: 2200, description: 'капуста айсберг, курица, соус цезарь, сыр, помидоры черри, сухари' },
      { id: 'prod-express-fresh-salad', name: 'Свежий салат', price: 1400, description: 'помидоры, огурцы, лук' },
      { id: 'prod-express-achichuk', name: 'Ачичук', price: 1300, description: 'помидоры, лук, стручковый перец' },
      { id: 'prod-express-olivier', name: 'Оливье', price: 1800, description: 'картофель вареный, колбаса, морковь, горошек, яйца, соленые огурцы, майонез' },
      { id: 'prod-express-muzhskoy-kapriz', name: 'Мужской каприз', price: 1800, description: 'говяжье мясо, соленые огурцы, картофель, яйцо, сметанный сыр, майонез' },
      { id: 'prod-express-crispy-eggplant', name: 'Хрустящие баклажаны', price: 2800, description: 'баклажаны, черри, руккола, кедровые орехи, творожный сыр, кисло-сладкий соус, бальзамический крем' },
      { id: 'prod-express-thai-salad', name: 'Тайский', price: 1790, description: 'говяжье мясо, помидоры, огурцы, перец светофор, кинза, зеленый лук, соя' },
      { id: 'prod-express-aitsultan', name: 'Фирменный салат «Айтсултан»', price: 2600, description: 'куриное филе, мясо говядина, огурцы, яйцо, горох, кукуруза, соус, чипсы, чечил' },
      { id: 'prod-express-veg-platter', name: 'Овощная нарезка', price: 5000, description: 'помидор, огурцы, лимон, фетакса, перец светофор, зелень' },
    ],
  },
  {
    id: 'cat-express-pizza',
    name: 'Пицца',
    color: '#DC2626',
    icon: '🍕',
    items: [
      { id: 'prod-express-pepperoni', name: 'Пеперони', price: 2590, description: 'моцарелла, гауда, колбаса' },
      { id: 'prod-express-margarita', name: 'Маргарита', price: 2390, description: 'моцарелла, гауда, помидоры' },
      { id: 'prod-express-chicken-pizza', name: 'Куриная', price: 2690, description: 'моцарелла, гауда, куриное филе' },
      { id: 'prod-express-four-seasons', name: '4 сезона', price: 2890, description: 'моцарелла, гауда, колбаса, помидор, куриное филе, грибы' },
      { id: 'prod-express-cheese-pizza', name: 'Сырная', price: 2390, description: 'моцарелла, гауда' },
      { id: 'prod-express-turkish-pizza', name: 'Пицца турецкая', price: 2890, description: 'моцарелла, гауда, фарш' },
    ],
  },
  {
    id: 'cat-express-sushi',
    name: 'Суши',
    color: '#0F766E',
    icon: '🍣',
    items: [
      { id: 'prod-express-caesar-roll', name: 'Цезарь', price: 2190, description: 'рис, нори, куриное филе, огурцы, панко, творожный сыр' },
      { id: 'prod-express-caesar-baked', name: 'Цезарь запеченный', price: 2290, description: 'рис, нори, куриное филе, огурцы, панко, запеченный соус, творожный сыр' },
      { id: 'prod-express-america-roll', name: 'Америка', price: 2290, description: 'рис, нори, угорь, лосось, панко, творожный сыр' },
      { id: 'prod-express-philadelphia', name: 'Филадельфия', price: 2590, description: 'рис, нори, лосось, творожный сыр' },
      { id: 'prod-express-california', name: 'Калифорния', price: 2290, description: 'рис, нори, лосось, огурцы, икра, творожный сыр' },
      { id: 'prod-express-eel-cucumber', name: 'Угорь с огурцами', price: 2290, description: 'рис, нори, угорь, огурцы, творожный сыр' },
    ],
  },
  {
    id: 'cat-express-shashlik',
    name: 'Шашлык',
    color: '#E11D48',
    icon: '🔥',
    items: [
      { id: 'prod-express-shashlik-kuskovoy', name: 'Кусковой', price: 620 },
      { id: 'prod-express-shashlik-farsh', name: 'Фарш', price: 620 },
      { id: 'prod-express-shashlik-okorochka', name: 'Окорочка без костей', price: 620 },
      { id: 'prod-express-shashlik-utka', name: 'Утка', price: 620 },
      { id: 'prod-express-shashlik-krylyshki', name: 'Крылышки', price: 650 },
      { id: 'prod-express-shashlik-pechen', name: 'Печень', price: 620 },
      { id: 'prod-express-shashlik-rulet', name: 'Рулет из фарша', price: 620 },
    ],
  },
  {
    id: 'cat-express-sides',
    name: 'Гарниры',
    color: '#A16207',
    icon: '🍟',
    items: [
      { id: 'prod-express-puree', name: 'Пюре', price: 700 },
      { id: 'prod-express-rice', name: 'Рис', price: 800 },
      { id: 'prod-express-fries', name: 'Фри', price: 800 },
      { id: 'prod-express-nuggets', name: 'Наггетсы', price: 1400 },
    ],
  },
  {
    id: 'cat-express-cold-apps',
    name: 'Холодные закуски',
    color: '#7C3AED',
    icon: '🥩',
    items: [
      { id: 'prod-express-meat-assorti', name: 'Мясное ассорти', price: 7790, description: 'жая, рулет, казы, сыр' },
      { id: 'prod-express-russian-zakuska', name: 'Русская закуска', price: 3990, description: 'селёдка, соленые огурцы, квашеная капуста, вареный картофель, красный лук, лимон' },
      { id: 'prod-express-solenya', name: 'Соленья', price: 3500, description: 'соленые помидоры, квашеная капуста, соленые огурцы, патиссоны, зелень, лимон' },
    ],
  },
  {
    id: 'cat-express-sauces',
    name: 'Соусы',
    color: '#B91C1C',
    icon: '🫙',
    items: [
      { id: 'prod-express-sauce-garlic', name: 'Чесночный', price: 390 },
      { id: 'prod-express-sauce-bbq', name: 'Барбекю', price: 400 },
      { id: 'prod-express-sauce-ketchup', name: 'Кетчуп', price: 250 },
      { id: 'prod-express-sauce-cheese', name: 'Сырный', price: 490 },
    ],
  },
  {
    id: 'cat-express-beer-snacks',
    name: 'Закуски к пиву',
    color: '#CA8A04',
    icon: '🍺',
    items: [
      { id: 'prod-express-pistachios', name: 'Фисташки', price: 880 },
      { id: 'prod-express-chechil', name: 'Чечил', price: 1090 },
      { id: 'prod-express-kurt-5', name: 'Курт (5 шт)', price: 800 },
      { id: 'prod-express-peanuts', name: 'Арахис', price: 790 },
      { id: 'prod-express-kirieshki', name: 'Кириешки', price: 590 },
      { id: 'prod-express-chips', name: 'Чипсы', price: 1700 },
      { id: 'prod-express-garlics', name: 'Гарлики', price: 800 },
    ],
  },
  {
    id: 'cat-express-bakery',
    name: 'Хлебное ассорти и выпечка',
    color: '#92400E',
    icon: '🍞',
    items: [
      { id: 'prod-express-lepeshka', name: 'Лепешка', price: 250 },
      { id: 'prod-express-kattama', name: 'Каттама', price: 490 },
      { id: 'prod-express-black-bread', name: 'Черный хлеб', price: 290 },
      { id: 'prod-express-baursak-10', name: 'Бауырсаки (10 шт)', price: 890 },
      { id: 'prod-express-baursak-kg', name: 'Бауырсаки (1 кг)', price: 2290 },
      { id: 'prod-express-samsa', name: 'Самса с мясом', price: 280 },
      { id: 'prod-express-bread-assorti', name: 'Хлебное ассорти', price: 2300, description: 'бауырсак (5 шт), каттама (2 вида), лепешки (2 шт), черный хлеб' },
    ],
  },
  {
    id: 'cat-express-hot-drinks',
    name: 'Горячие напитки',
    color: '#0F766E',
    icon: '🍵',
    items: [
      { id: 'prod-express-green-tea', name: 'Зеленый чай', price: 660 },
      { id: 'prod-express-black-tea', name: 'Черный чай', price: 660 },
      { id: 'prod-express-tashkent-tea', name: 'Ташкентский чай', price: 1990 },
      { id: 'prod-express-lemon', name: 'Лимон', price: 400 },
    ],
  },
  {
    id: 'cat-express-soft-drinks',
    name: 'Напитки и лимонады',
    color: '#0284C7',
    icon: '🥤',
    items: [
      { id: 'prod-express-coca-cola', name: 'Кока-Кола', price: 900 },
      { id: 'prod-express-sprite', name: 'Спрайт', price: 900 },
      { id: 'prod-express-fanta', name: 'Фанта', price: 900 },
      { id: 'prod-express-fusty', name: 'Фьюсти', price: 900 },
      { id: 'prod-express-juice-assorti', name: 'Сок в ассортименте', price: 1200 },
      { id: 'prod-express-bonaqua', name: 'Бонаква (без газа)', price: 650 },
      { id: 'prod-express-borjomi', name: 'Боржоми', price: 1500 },
      { id: 'prod-express-mojito', name: 'Мохито', price: 1500 },
      { id: 'prod-express-berry-lemonade', name: 'Ягодный лимонад', price: 1700 },
      { id: 'prod-express-kiwi-lime', name: 'Киви-лайм', price: 1600 },
      { id: 'prod-express-ice', name: 'Лёд', price: 300 },
      { id: 'prod-express-gorilla', name: 'Горилла', price: 900 },
      { id: 'prod-express-dizzy', name: 'Диззи', price: 900 },
    ],
  },
  {
    id: 'cat-express-alcohol',
    name: 'Спиртные напитки',
    color: '#1E3A8A',
    icon: '🥃',
    items: [
      { id: 'prod-express-absolut', name: 'Абсолют Оригинал', price: 11000 },
      { id: 'prod-express-tsarskaya', name: 'Царская', price: 8000 },
      { id: 'prod-express-arkhangelskaya', name: 'Архангельская', price: 5500 },
      { id: 'prod-express-kyzyl-zhar', name: 'Кызыл Жар Легенда', price: 6000 },
      { id: 'prod-express-stolichnaya', name: 'Столичная', price: 5500 },
      { id: 'prod-express-tundra', name: 'Тундра', price: 5000 },
      { id: 'prod-express-kazakhstan-5', name: 'Казахстан 5 звезд (коньяк)', price: 8000 },
      { id: 'prod-express-bakhus', name: 'Бахус Казахстан (коньяк)', price: 6500 },
      { id: 'prod-express-shokolad-kz', name: 'Шоколад Казахстан', price: 1500 },
      { id: 'prod-express-prague-beer', name: 'Пиво «Прага»', price: 650 },
    ],
  },
  {
    id: 'cat-express-tobacco',
    name: 'Табачные изделия и прочее',
    color: '#57534E',
    icon: '🚬',
    items: [
      { id: 'prod-express-esse-mango', name: 'Esse Манго', price: 1800 },
      { id: 'prod-express-esse-capsule', name: 'Esse Капсула', price: 1800 },
      { id: 'prod-express-richmond', name: 'Richmond', price: 1800 },
      { id: 'prod-express-parliament', name: 'Parliament', price: 1800 },
      { id: 'prod-express-lighter', name: 'Зажигалка', price: 500 },
      { id: 'prod-express-orbit', name: 'Орбит', price: 490 },
    ],
  },
];

export const EXPRESS_RESTAURANT_CATEGORY_IDS = EXPRESS_RESTAURANT_MENU.map((category) => category.id);
export const EXPRESS_RESTAURANT_CATEGORY_COUNT = EXPRESS_RESTAURANT_MENU.length;
export const EXPRESS_RESTAURANT_PRODUCT_COUNT = EXPRESS_RESTAURANT_MENU.reduce(
  (sum, category) => sum + category.items.length,
  0,
);

export function insertScopedCategory(
  db: SeedDb,
  id: string,
  name: string,
  color: string,
  icon: string,
  sortOrder: number,
  businessScope: CatalogBusinessType,
): void {
  db.prepare(`
    INSERT OR IGNORE INTO categories (id, name, color, icon, sort_order, is_active, business_scope, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).run(id, name, color, icon, sortOrder, businessScope, now(), now());
  db.prepare(`
    UPDATE categories SET business_scope = ? WHERE id = ? AND (business_scope IS NULL OR business_scope = 'both' OR business_scope = ?)
  `).run(businessScope, id, businessScope);
}

function insertProduct(
  db: SeedDb,
  id: string,
  categoryId: string,
  name: string,
  price: number,
  sortOrder: number,
  description?: string,
): void {
  db.prepare(`
    INSERT OR IGNORE INTO products (id, category_id, name, description, price, sort_order, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(id, categoryId, name, description ?? null, price, sortOrder, now(), now());
}

function insertInventoryProduct(
  db: SeedDb,
  id: string,
  categoryId: string,
  name: string,
  price: number,
  sortOrder: number,
  barcode: string,
  stockQuantity: number,
): void {
  db.prepare(`
    INSERT OR IGNORE INTO products (
      id, category_id, name, price, sort_order, is_active,
      barcode, sku, track_inventory, stock_quantity, low_stock_threshold,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, 1, ?, 5, ?, ?)
  `).run(id, categoryId, name, price, sortOrder, barcode, barcode, stockQuantity, now(), now());
}

export function seedExpressRetail(db: SeedDb, language?: string): void {
  const shop = EXPRESS_SHOP[seedLanguage(language)];
  insertScopedCategory(db, 'cat-express-grocery', shop.grocery, '#16A34A', '🛒', 1, 'retail');
  insertScopedCategory(db, 'cat-express-drinks', shop.drinks, '#0EA5E9', '🥤', 2, 'retail');
  insertScopedCategory(db, 'cat-express-household', shop.household, '#6366F1', '🧴', 3, 'retail');

  insertInventoryProduct(db, 'prod-express-water', 'cat-express-drinks', shop.water, 150, 1, '4870000000001', 40);
  insertInventoryProduct(db, 'prod-express-cola', 'cat-express-drinks', shop.cola, 250, 2, '4870000000002', 30);
  insertInventoryProduct(db, 'prod-express-bread', 'cat-express-grocery', shop.bread, 200, 1, '4870000000003', 20);
  insertInventoryProduct(db, 'prod-express-milk', 'cat-express-grocery', shop.milk, 450, 2, '4870000000004', 15);
  insertInventoryProduct(db, 'prod-express-soap', 'cat-express-household', shop.soap, 300, 1, '4870000000005', 25);
}

const CAFE_STATION_NAMES: Record<SeedLanguage, { kitchen: string; bar: string }> = {
  en: { kitchen: 'Kitchen', bar: 'Bar' },
  ru: { kitchen: 'Кухня', bar: 'Бар' },
  kk: { kitchen: 'Ас үй', bar: 'Бар' },
};

/**
 * Cafe first-run kitchen + bar stations. Only inserted when the cafe menu
 * exists and no stations have been created yet — never overwrites merchant
 * routing. Printers stay unassigned until Settings → Kitchen Stations.
 */
export function ensureCafeKitchenStations(db: SeedDb, language?: string): void {
  const cafeMenu = db.prepare(
    "SELECT 1 AS ok FROM categories WHERE id = 'cat-express-soups' AND deleted_at IS NULL",
  ).get() as { ok: number } | undefined;
  if (!cafeMenu) return;

  const existing = db.prepare('SELECT COUNT(*) AS count FROM kitchen_stations').get() as { count: number };
  if (existing.count > 0) return;

  const names = CAFE_STATION_NAMES[seedLanguage(language)];
  const stamp = now();
  db.prepare(`
    INSERT INTO kitchen_stations (id, name, description, category_ids, is_active, sort_order, created_at, updated_at)
    VALUES (?, ?, NULL, ?, 1, ?, ?, ?)
  `).run(CAFE_KITCHEN_STATION_ID, names.kitchen, JSON.stringify([...CAFE_KITCHEN_CATEGORY_IDS]), 0, stamp, stamp);
  db.prepare(`
    INSERT INTO kitchen_stations (id, name, description, category_ids, is_active, sort_order, created_at, updated_at)
    VALUES (?, ?, NULL, ?, 1, ?, ?, ?)
  `).run(CAFE_BAR_STATION_ID, names.bar, JSON.stringify([...CAFE_BAR_CATEGORY_IDS]), 1, stamp, stamp);
}

/** Cafe express catalog only — dine-in tables stay a first-run concern. */
export function seedExpressRestaurantCatalog(db: SeedDb, language?: string): void {
  EXPRESS_RESTAURANT_MENU.forEach((category, categoryIndex) => {
    insertScopedCategory(db, category.id, category.name, category.color, category.icon, categoryIndex + 1, 'restaurant');
    category.items.forEach((item, itemIndex) => {
      insertProduct(db, item.id, category.id, item.name, item.price, itemIndex + 1, item.description);
    });
  });
  ensureCafeKitchenStations(db, language);
}

export function countVisibleCategories(db: SeedDb, businessType: CatalogBusinessType): number {
  return (db.prepare(`
    SELECT COUNT(*) AS count FROM categories
    WHERE deleted_at IS NULL AND is_active = 1 AND ${CATEGORY_SCOPE_SQL}
  `).get(businessType) as { count: number }).count;
}

/**
 * If the new venue type has no usable categories, load that type's express
 * template. Existing cafe/shop rows are never deleted.
 */
export function ensureCatalogForBusinessType(db: SeedDb, businessType: unknown, language?: string): void {
  const type = normalizeCatalogBusinessType(businessType);
  if (countVisibleCategories(db, type) === 0) {
    if (type === 'retail') seedExpressRetail(db, language);
    else seedExpressRestaurantCatalog(db, language);
    return;
  }
  if (type === 'restaurant') ensureCafeKitchenStations(db, language);
}

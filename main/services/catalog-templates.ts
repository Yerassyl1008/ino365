import type Database from 'better-sqlite3';
import { now } from '../db';
import {
  CATEGORY_SCOPE_SQL,
  normalizeCatalogBusinessType,
  type CatalogBusinessType,
} from '../../shared/catalog-scope';

type SeedDb = Database.Database;
type SeedLanguage = 'en' | 'ru' | 'kk';

function seedLanguage(language?: string): SeedLanguage {
  return language === 'ru' || language === 'kk' ? language : 'en';
}

const EXPRESS_MENU: Record<SeedLanguage, Record<'food' | 'beverages' | 'meal' | 'snack' | 'tea' | 'coffee', string>> = {
  en: { food: 'Food', beverages: 'Beverages', meal: 'Meal', snack: 'Snack', tea: 'Tea', coffee: 'Coffee' },
  ru: { food: 'Еда', beverages: 'Напитки', meal: 'Обед', snack: 'Закуска', tea: 'Чай', coffee: 'Кофе' },
  kk: { food: 'Тағам', beverages: 'Сусындар', meal: 'Түскі ас', snack: 'Тіскебасар', tea: 'Шай', coffee: 'Кофе' },
};

const EXPRESS_SHOP: Record<SeedLanguage, Record<'grocery' | 'drinks' | 'household' | 'water' | 'cola' | 'bread' | 'milk' | 'soap', string>> = {
  en: { grocery: 'Grocery', drinks: 'Drinks', household: 'Household', water: 'Water 0.5L', cola: 'Cola 0.5L', bread: 'Bread', milk: 'Milk 1L', soap: 'Soap' },
  ru: { grocery: 'Продукты', drinks: 'Напитки', household: 'Бытовое', water: 'Вода 0.5 л', cola: 'Кола 0.5 л', bread: 'Хлеб', milk: 'Молоко 1 л', soap: 'Мыло' },
  kk: { grocery: 'Азық-түлік', drinks: 'Сусындар', household: 'Тұрмыс', water: 'Су 0.5 л', cola: 'Кола 0.5 л', bread: 'Нан', milk: 'Сүт 1 л', soap: 'Сабын' },
};

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

function insertProduct(db: SeedDb, id: string, categoryId: string, name: string, price: number, sortOrder: number): void {
  db.prepare(`
    INSERT OR IGNORE INTO products (id, category_id, name, price, sort_order, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).run(id, categoryId, name, price, sortOrder, now(), now());
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

/** Cafe express catalog only — dine-in tables stay a first-run concern. */
export function seedExpressRestaurantCatalog(db: SeedDb, language?: string): void {
  const menu = EXPRESS_MENU[seedLanguage(language)];
  insertScopedCategory(db, 'cat-express-food', menu.food, '#F97316', '🍽️', 1, 'restaurant');
  insertScopedCategory(db, 'cat-express-beverages', menu.beverages, '#0EA5E9', '🥤', 2, 'restaurant');

  insertProduct(db, 'prod-express-meal', 'cat-express-food', menu.meal, 150, 1);
  insertProduct(db, 'prod-express-snack', 'cat-express-food', menu.snack, 80, 2);
  insertProduct(db, 'prod-express-tea', 'cat-express-beverages', menu.tea, 25, 1);
  insertProduct(db, 'prod-express-coffee', 'cat-express-beverages', menu.coffee, 40, 2);
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
  if (countVisibleCategories(db, type) > 0) return;
  if (type === 'retail') seedExpressRetail(db, language);
  else seedExpressRestaurantCatalog(db, language);
}

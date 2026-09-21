import type Database from 'better-sqlite3';
import { generateShortId, isKitchenWarehouseEnabled, now } from '../db';

export const INGREDIENT_UNITS = ['g', 'kg', 'ml', 'l', 'pcs'] as const;
export type IngredientUnit = (typeof INGREDIENT_UNITS)[number];

export const STOCK_REASONS = ['sale', 'cancel', 'restore', 'receive', 'waste', 'count', 'adjustment'] as const;
export type StockReason = (typeof STOCK_REASONS)[number];

export type KitchenDb = Database.Database;

type StockError = Error & { statusCode: number };

function stockError(message: string, statusCode = 400): StockError {
  return Object.assign(new Error(message), { statusCode });
}

export function roundQty(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function isIngredientUnit(value: unknown): value is IngredientUnit {
  return typeof value === 'string' && (INGREDIENT_UNITS as readonly string[]).includes(value);
}

type RecipeNeed = {
  ingredient_id: string;
  name: string;
  unit: string;
  quantity: number;
  stock_quantity: number;
};

export function expandProductRecipe(db: KitchenDb, productId: string, quantity: number): RecipeNeed[] {
  const portions = Number(quantity);
  if (!Number.isFinite(portions) || portions <= 0) return [];

  const lines = db.prepare(`
    SELECT r.ingredient_id, r.quantity AS per_portion, i.name, i.unit, i.stock_quantity, i.is_active
    FROM product_recipes r
    JOIN ingredients i ON i.id = r.ingredient_id
    WHERE r.product_id = ?
  `).all(productId) as Array<{
    ingredient_id: string;
    per_portion: number;
    name: string;
    unit: string;
    stock_quantity: number;
    is_active: number;
  }>;

  return lines
    .map((line) => ({
      ingredient_id: line.ingredient_id,
      name: line.name,
      unit: line.unit,
      quantity: roundQty(Number(line.per_portion) * portions),
      stock_quantity: Number(line.stock_quantity),
    }))
    .filter((line) => line.quantity > 0);
}

function assertNeedsAvailable(needs: RecipeNeed[]): void {
  for (const need of needs) {
    if (need.stock_quantity + 0.0001 < need.quantity) {
      throw stockError(
        `Insufficient stock for ${need.name} (need ${need.quantity} ${need.unit}, have ${roundQty(need.stock_quantity)})`,
      );
    }
  }
}

function insertMovement(
  db: KitchenDb,
  params: {
    ingredientId: string;
    quantity: number;
    reason: StockReason;
    orderId?: string | number | bigint | null;
    orderItemId?: string | number | bigint | null;
    note?: string | null;
    userId?: string | null;
  },
): void {
  db.prepare(`
    INSERT INTO stock_movements (
      ingredient_id, quantity, reason, order_id, order_item_id, note, user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.ingredientId,
    params.quantity,
    params.reason,
    params.orderId == null ? null : String(params.orderId),
    params.orderItemId == null ? null : Number(params.orderItemId),
    params.note ?? null,
    params.userId ?? null,
    now(),
  );
}

function deductIngredient(db: KitchenDb, ingredientId: string, quantity: number, name: string): void {
  const result = db.prepare(`
    UPDATE ingredients
    SET stock_quantity = stock_quantity - ?, updated_at = ?
    WHERE id = ? AND stock_quantity + 0.0001 >= ?
  `).run(quantity, now(), ingredientId, quantity);
  if (result.changes === 0) {
    throw stockError(`Insufficient stock for ${name}`);
  }
}

export function consumeOrderItemIngredients(
  db: KitchenDb,
  params: {
    orderId: number | string | bigint;
    orderItemId: number | string | bigint;
    productId: string;
    quantity: number;
    userId?: string | null;
  },
): void {
  if (!isKitchenWarehouseEnabled()) return;
  const needs = expandProductRecipe(db, params.productId, params.quantity);
  if (needs.length === 0) return;

  assertNeedsAvailable(needs);

  const insertDeduction = db.prepare(`
    INSERT INTO order_item_ingredient_deductions (order_item_id, ingredient_id, quantity)
    VALUES (?, ?, ?)
  `);

  for (const need of needs) {
    deductIngredient(db, need.ingredient_id, need.quantity, need.name);
    insertDeduction.run(params.orderItemId, need.ingredient_id, need.quantity);
    insertMovement(db, {
      ingredientId: need.ingredient_id,
      quantity: -need.quantity,
      reason: 'sale',
      orderId: params.orderId,
      orderItemId: params.orderItemId,
      userId: params.userId,
    });
  }
}

export function restoreOrderItemIngredients(
  db: KitchenDb,
  params: {
    orderId: number | string | bigint;
    orderItemId: number | string | bigint;
    userId?: string | null;
    reason?: Extract<StockReason, 'cancel'>;
  },
): void {
  const lines = db.prepare(`
    SELECT d.ingredient_id, d.quantity, i.name
    FROM order_item_ingredient_deductions d
    JOIN ingredients i ON i.id = d.ingredient_id
    WHERE d.order_item_id = ?
  `).all(params.orderItemId) as Array<{ ingredient_id: string; quantity: number; name: string }>;

  for (const line of lines) {
    const qty = roundQty(Number(line.quantity));
    if (qty <= 0) continue;
    db.prepare(`
      UPDATE ingredients SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ?
    `).run(qty, now(), line.ingredient_id);
    insertMovement(db, {
      ingredientId: line.ingredient_id,
      quantity: qty,
      reason: params.reason || 'cancel',
      orderId: params.orderId,
      orderItemId: params.orderItemId,
      userId: params.userId,
    });
  }
}

export function redeductOrderItemIngredients(
  db: KitchenDb,
  params: {
    orderId: number | string | bigint;
    orderItemId: number | string | bigint;
    userId?: string | null;
  },
): void {
  if (!isKitchenWarehouseEnabled()) return;
  const lines = db.prepare(`
    SELECT d.ingredient_id, d.quantity, i.name, i.stock_quantity
    FROM order_item_ingredient_deductions d
    JOIN ingredients i ON i.id = d.ingredient_id
    WHERE d.order_item_id = ?
  `).all(params.orderItemId) as Array<{
    ingredient_id: string;
    quantity: number;
    name: string;
    stock_quantity: number;
  }>;

  const needs: RecipeNeed[] = lines.map((line) => ({
    ingredient_id: line.ingredient_id,
    name: line.name,
    unit: '',
    quantity: roundQty(Number(line.quantity)),
    stock_quantity: Number(line.stock_quantity),
  })).filter((line) => line.quantity > 0);

  assertNeedsAvailable(needs);

  for (const need of needs) {
    deductIngredient(db, need.ingredient_id, need.quantity, need.name);
    insertMovement(db, {
      ingredientId: need.ingredient_id,
      quantity: -need.quantity,
      reason: 'restore',
      orderId: params.orderId,
      orderItemId: params.orderItemId,
      userId: params.userId,
    });
  }
}

export function replaceProductRecipe(
  db: KitchenDb,
  productId: string,
  items: Array<{ ingredient_id: string; quantity: number }>,
): Array<{ id: string; product_id: string; ingredient_id: string; quantity: number }> {
  const product = db.prepare('SELECT id FROM products WHERE id = ? AND deleted_at IS NULL').get(productId);
  if (!product) throw stockError('Product not found', 404);

  const seen = new Set<string>();
  const normalized: Array<{ ingredient_id: string; quantity: number }> = [];
  for (const item of items) {
    const ingredientId = typeof item.ingredient_id === 'string' ? item.ingredient_id.trim() : '';
    const quantity = roundQty(Number(item.quantity));
    if (!ingredientId) throw stockError('ingredient_id is required');
    if (!Number.isFinite(quantity) || quantity <= 0) throw stockError('Recipe quantity must be greater than 0');
    if (seen.has(ingredientId)) throw stockError('Duplicate ingredient in recipe');
    seen.add(ingredientId);
    const ingredient = db.prepare('SELECT id FROM ingredients WHERE id = ? AND is_active = 1').get(ingredientId);
    if (!ingredient) throw stockError('Ingredient not found or inactive');
    normalized.push({ ingredient_id: ingredientId, quantity });
  }

  db.prepare('DELETE FROM product_recipes WHERE product_id = ?').run(productId);
  const insert = db.prepare(`
    INSERT INTO product_recipes (id, product_id, ingredient_id, quantity, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const stamp = now();
  for (const line of normalized) {
    insert.run(generateShortId('product_recipes'), productId, line.ingredient_id, line.quantity, stamp, stamp);
  }

  return listProductRecipe(db, productId);
}

export function listProductRecipe(db: KitchenDb, productId: string): Array<{
  id: string;
  product_id: string;
  ingredient_id: string;
  quantity: number;
  ingredient_name: string;
  unit: string;
  stock_quantity: number;
}> {
  return db.prepare(`
    SELECT r.id, r.product_id, r.ingredient_id, r.quantity, i.name AS ingredient_name, i.unit, i.stock_quantity
    FROM product_recipes r
    JOIN ingredients i ON i.id = r.ingredient_id
    WHERE r.product_id = ?
    ORDER BY i.name
  `).all(productId) as Array<{
    id: string;
    product_id: string;
    ingredient_id: string;
    quantity: number;
    ingredient_name: string;
    unit: string;
    stock_quantity: number;
  }>;
}

export function applyIngredientReceive(db: KitchenDb, ingredientId: string, quantity: number, userId?: string | null, note?: string | null) {
  const qty = roundQty(Number(quantity));
  if (!Number.isFinite(qty) || qty <= 0) throw stockError('Receive quantity must be greater than 0');
  const ingredient = db.prepare('SELECT id, name FROM ingredients WHERE id = ?').get(ingredientId) as { id: string; name: string } | undefined;
  if (!ingredient) throw stockError('Ingredient not found', 404);
  db.prepare('UPDATE ingredients SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ?')
    .run(qty, now(), ingredientId);
  insertMovement(db, { ingredientId, quantity: qty, reason: 'receive', userId, note });
}

export function applyIngredientWaste(db: KitchenDb, ingredientId: string, quantity: number, userId?: string | null, note?: string | null) {
  const qty = roundQty(Number(quantity));
  if (!Number.isFinite(qty) || qty <= 0) throw stockError('Waste quantity must be greater than 0');
  const ingredient = db.prepare('SELECT id, name, stock_quantity FROM ingredients WHERE id = ?')
    .get(ingredientId) as { id: string; name: string; stock_quantity: number } | undefined;
  if (!ingredient) throw stockError('Ingredient not found', 404);
  if (Number(ingredient.stock_quantity) + 0.0001 < qty) {
    throw stockError(`Insufficient stock for ${ingredient.name}`);
  }
  deductIngredient(db, ingredientId, qty, ingredient.name);
  insertMovement(db, { ingredientId, quantity: -qty, reason: 'waste', userId, note });
}

export function applyIngredientCount(db: KitchenDb, ingredientId: string, quantity: number, userId?: string | null, note?: string | null) {
  const counted = roundQty(Number(quantity));
  if (!Number.isFinite(counted) || counted < 0) throw stockError('Counted quantity must be 0 or greater');
  const ingredient = db.prepare('SELECT id, stock_quantity FROM ingredients WHERE id = ?')
    .get(ingredientId) as { id: string; stock_quantity: number } | undefined;
  if (!ingredient) throw stockError('Ingredient not found', 404);
  const delta = roundQty(counted - Number(ingredient.stock_quantity));
  db.prepare('UPDATE ingredients SET stock_quantity = ?, updated_at = ? WHERE id = ?')
    .run(counted, now(), ingredientId);
  if (delta !== 0) {
    insertMovement(db, { ingredientId, quantity: delta, reason: 'count', userId, note });
  }
}

export function applyIngredientCountBatch(
  db: KitchenDb,
  items: Array<{ ingredient_id?: unknown; quantity?: unknown }>,
  userId?: string | null,
  note?: string | null,
): { counted: number; skipped: number } {
  let counted = 0;
  let skipped = 0;
  const seen = new Set<string>();

  for (const item of items) {
    const ingredientId = typeof item.ingredient_id === 'string' ? item.ingredient_id.trim() : '';
    if (!ingredientId) {
      skipped += 1;
      continue;
    }
    if (item.quantity === '' || item.quantity === null || item.quantity === undefined) {
      skipped += 1;
      continue;
    }
    if (seen.has(ingredientId)) throw stockError('Duplicate ingredient in count');
    seen.add(ingredientId);

    const nextQty = roundQty(Number(item.quantity));
    if (!Number.isFinite(nextQty) || nextQty < 0) throw stockError('Counted quantity must be 0 or greater');

    const ingredient = db.prepare('SELECT id, stock_quantity FROM ingredients WHERE id = ?')
      .get(ingredientId) as { id: string; stock_quantity: number } | undefined;
    if (!ingredient) throw stockError('Ingredient not found', 404);

    if (roundQty(nextQty - Number(ingredient.stock_quantity)) === 0) {
      skipped += 1;
      continue;
    }

    applyIngredientCount(db, ingredientId, nextQty, userId, note);
    counted += 1;
  }

  return { counted, skipped };
}

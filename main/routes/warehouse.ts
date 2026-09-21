import { Router, Request, Response } from 'express';
import expressRateLimit from 'express-rate-limit';
import { getDatabase, now, generateShortId, getSettingValue, isKitchenWarehouseEnabled, withTxn } from '../db';
import { requireRole } from '../middleware/security';
import { ROLE_ACCESS } from '../../shared/role-permissions';
import {
  applyIngredientCount,
  applyIngredientCountBatch,
  applyIngredientReceive,
  applyIngredientWaste,
  isIngredientUnit,
  listProductRecipe,
  replaceProductRecipe,
  roundQty,
} from '../services/kitchen-inventory';
import { seedShashlikMenu } from '../services/shashlik-seed';

const router = Router();
const warehouseWriteRateLimit = expressRateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });

router.use(requireRole(...ROLE_ACCESS.ownerManager));

function serializeIngredient(row: any) {
  if (!row) return row;
  return {
    ...row,
    is_active: Boolean(row.is_active),
    is_low: Number(row.stock_quantity) <= Number(row.low_stock_threshold),
  };
}

function parseOptionalNote(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return String(value);
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 200) : null;
}

function userIdOf(req: Request): string | null {
  return (req as any).user?.userId || null;
}

function sendStockError(res: Response, error: any): void {
  if (error?.statusCode) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  console.error('[API] Warehouse error:', error);
  res.status(500).json({ error: 'Internal server error' });
}

router.get('/ingredients', (_req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const ingredients = db.prepare(`
      SELECT * FROM ingredients ORDER BY is_active DESC, name
    `).all();
    res.json({
      ingredients: ingredients.map(serializeIngredient),
      warehouse_enabled: isKitchenWarehouseEnabled(),
    });
  } catch (error: any) {
    sendStockError(res, error);
  }
});

router.get('/low-stock', (_req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const ingredients = db.prepare(`
      SELECT * FROM ingredients
      WHERE is_active = 1 AND stock_quantity <= low_stock_threshold
      ORDER BY name
    `).all();
    res.json({ ingredients: ingredients.map(serializeIngredient) });
  } catch (error: any) {
    sendStockError(res, error);
  }
});

router.post('/ingredients', warehouseWriteRateLimit, (req: Request, res: Response) => {
  try {
    const { name, unit, stock_quantity, low_stock_threshold, cost_per_unit } = req.body || {};
    const ingredientName = typeof name === 'string' ? name.trim() : '';
    if (!ingredientName) return res.status(400).json({ error: 'Name is required' });
    if (!isIngredientUnit(unit)) return res.status(400).json({ error: 'Valid unit is required (g, kg, ml, l, pcs)' });

    const stock = roundQty(Number(stock_quantity ?? 0));
    const low = roundQty(Number(low_stock_threshold ?? 0));
    const cost = roundQty(Number(cost_per_unit ?? 0));
    if (!Number.isFinite(stock) || stock < 0) return res.status(400).json({ error: 'stock_quantity must be 0 or greater' });
    if (!Number.isFinite(low) || low < 0) return res.status(400).json({ error: 'low_stock_threshold must be 0 or greater' });
    if (!Number.isFinite(cost) || cost < 0) return res.status(400).json({ error: 'cost_per_unit must be 0 or greater' });

    const db = getDatabase();
    const id = generateShortId('ingredients');
    db.prepare(`
      INSERT INTO ingredients (id, name, unit, stock_quantity, low_stock_threshold, cost_per_unit, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, ingredientName, unit, stock, low, cost, now(), now());
    const ingredient = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(id);
    res.status(201).json({ ingredient: serializeIngredient(ingredient) });
  } catch (error: any) {
    sendStockError(res, error);
  }
});

router.put('/ingredients/:id', warehouseWriteRateLimit, (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Ingredient not found' });

    const body = req.body || {};
    let name = (existing as any).name;
    if (Object.prototype.hasOwnProperty.call(body, 'name')) {
      if (typeof body.name !== 'string' || !body.name.trim()) return res.status(400).json({ error: 'Name is required' });
      name = body.name.trim();
    }

    let unit = (existing as any).unit;
    if (Object.prototype.hasOwnProperty.call(body, 'unit')) {
      if (!isIngredientUnit(body.unit)) return res.status(400).json({ error: 'Valid unit is required (g, kg, ml, l, pcs)' });
      unit = body.unit;
    }

    let low = (existing as any).low_stock_threshold;
    if (Object.prototype.hasOwnProperty.call(body, 'low_stock_threshold')) {
      low = roundQty(Number(body.low_stock_threshold));
      if (!Number.isFinite(low) || low < 0) return res.status(400).json({ error: 'low_stock_threshold must be 0 or greater' });
    }

    let cost = (existing as any).cost_per_unit;
    if (Object.prototype.hasOwnProperty.call(body, 'cost_per_unit')) {
      cost = roundQty(Number(body.cost_per_unit));
      if (!Number.isFinite(cost) || cost < 0) return res.status(400).json({ error: 'cost_per_unit must be 0 or greater' });
    }

    let isActive = (existing as any).is_active;
    if (Object.prototype.hasOwnProperty.call(body, 'is_active')) {
      isActive = body.is_active ? 1 : 0;
    }

    db.prepare(`
      UPDATE ingredients
      SET name = ?, unit = ?, low_stock_threshold = ?, cost_per_unit = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `).run(name, unit, low, cost, isActive, now(), req.params.id);

    const ingredient = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(req.params.id);
    res.json({ ingredient: serializeIngredient(ingredient) });
  } catch (error: any) {
    sendStockError(res, error);
  }
});

router.delete('/ingredients/:id', warehouseWriteRateLimit, (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const existing = db.prepare('SELECT id FROM ingredients WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Ingredient not found' });
    const inRecipe = db.prepare('SELECT 1 FROM product_recipes WHERE ingredient_id = ? LIMIT 1').get(req.params.id);
    if (inRecipe) {
      return res.status(400).json({ error: 'Ingredient is used in a tech card. Remove it from recipes first.' });
    }
    db.prepare('UPDATE ingredients SET is_active = 0, updated_at = ? WHERE id = ?').run(now(), req.params.id);
    res.json({ ok: true });
  } catch (error: any) {
    sendStockError(res, error);
  }
});

router.post('/ingredients/:id/receive', warehouseWriteRateLimit, (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    withTxn(() => applyIngredientReceive(db, String(req.params.id), req.body?.quantity, userIdOf(req), parseOptionalNote(req.body?.note)));
    const ingredient = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(req.params.id);
    res.json({ ingredient: serializeIngredient(ingredient) });
  } catch (error: any) {
    sendStockError(res, error);
  }
});

router.post('/ingredients/:id/waste', warehouseWriteRateLimit, (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    withTxn(() => applyIngredientWaste(db, String(req.params.id), req.body?.quantity, userIdOf(req), parseOptionalNote(req.body?.note)));
    const ingredient = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(req.params.id);
    res.json({ ingredient: serializeIngredient(ingredient) });
  } catch (error: any) {
    sendStockError(res, error);
  }
});

router.post('/ingredients/:id/count', warehouseWriteRateLimit, (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    withTxn(() => applyIngredientCount(db, String(req.params.id), req.body?.quantity, userIdOf(req), parseOptionalNote(req.body?.note)));
    const ingredient = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(req.params.id);
    res.json({ ingredient: serializeIngredient(ingredient) });
  } catch (error: any) {
    sendStockError(res, error);
  }
});

router.post('/count', warehouseWriteRateLimit, (req: Request, res: Response) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length > 500) return res.status(400).json({ error: 'Too many count rows' });
    const db = getDatabase();
    const result = withTxn(() => applyIngredientCountBatch(db, items, userIdOf(req), parseOptionalNote(req.body?.note)));
    res.json(result);
  } catch (error: any) {
    sendStockError(res, error);
  }
});

router.get('/movements', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const ingredientId = typeof req.query.ingredient_id === 'string' ? req.query.ingredient_id : '';
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 80));
    const rows = ingredientId
      ? db.prepare(`
          SELECT m.*, i.name AS ingredient_name, i.unit
          FROM stock_movements m
          JOIN ingredients i ON i.id = m.ingredient_id
          WHERE m.ingredient_id = ?
          ORDER BY m.id DESC
          LIMIT ?
        `).all(ingredientId, limit)
      : db.prepare(`
          SELECT m.*, i.name AS ingredient_name, i.unit
          FROM stock_movements m
          JOIN ingredients i ON i.id = m.ingredient_id
          ORDER BY m.id DESC
          LIMIT ?
        `).all(limit);
    res.json({ movements: rows });
  } catch (error: any) {
    sendStockError(res, error);
  }
});

router.get('/recipes', (_req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const products = db.prepare(`
      SELECT p.id, p.name,
        (SELECT COUNT(*) FROM product_recipes r WHERE r.product_id = p.id) AS recipe_lines
      FROM products p
      WHERE p.deleted_at IS NULL AND p.is_active = 1
      ORDER BY p.sort_order, p.name
    `).all();
    const recipes = db.prepare(`
      SELECT r.product_id, r.ingredient_id, r.quantity, i.name AS ingredient_name, i.unit
      FROM product_recipes r
      JOIN ingredients i ON i.id = r.ingredient_id
      ORDER BY i.name
    `).all() as Array<{ product_id: string; ingredient_id: string; quantity: number; ingredient_name: string; unit: string }>;
    const byProduct = new Map<string, typeof recipes>();
    for (const line of recipes) {
      const rows = byProduct.get(line.product_id) || [];
      rows.push(line);
      byProduct.set(line.product_id, rows);
    }
    res.json({
      products: products.map((product: any) => ({
        ...product,
        recipe: byProduct.get(product.id) || [],
      })),
    });
  } catch (error: any) {
    sendStockError(res, error);
  }
});

router.get('/recipes/:productId', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const product = db.prepare('SELECT id, name FROM products WHERE id = ? AND deleted_at IS NULL').get(req.params.productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ product, recipe: listProductRecipe(db, String(req.params.productId)) });
  } catch (error: any) {
    sendStockError(res, error);
  }
});

router.put('/recipes/:productId', warehouseWriteRateLimit, (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const recipe = withTxn(() => replaceProductRecipe(db, String(req.params.productId), items));
    res.json({ recipe });
  } catch (error: any) {
    sendStockError(res, error);
  }
});

router.post('/seed-shashlik', warehouseWriteRateLimit, (req: Request, res: Response) => {
  try {
    if ((getSettingValue('business_type') || 'restaurant') === 'retail') {
      return res.status(403).json({ error: 'Kitchen menu seeding is not available in shop mode' });
    }
    const db = getDatabase();
    const requested = typeof req.body?.language === 'string' ? req.body.language : getSettingValue('language');
    const language = requested === 'ru' || requested === 'kk' ? requested : 'en';
    withTxn(() => seedShashlikMenu(db, language));
    const ingredients = db.prepare('SELECT COUNT(*) AS count FROM ingredients').get() as { count: number };
    const recipes = db.prepare('SELECT COUNT(*) AS count FROM product_recipes').get() as { count: number };
    res.json({ ok: true, language, ingredients: ingredients.count, recipes: recipes.count });
  } catch (error: any) {
    sendStockError(res, error);
  }
});

export const warehouseRoutes = router;

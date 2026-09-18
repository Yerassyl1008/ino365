import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase, now, generateShortId, getSettingValue } from '../db';
import { requireRole } from '../middleware/security';
import { ROLE_ACCESS } from '../../shared/role-permissions';
import { normalizeCatalogBusinessType } from '../../shared/catalog-scope';
import {
  decodeMenuFileBase64,
  parseMenuFile,
  MAX_MENU_ITEMS,
  type ParsedMenuItem,
} from '../services/menu-pdf-parse';

const router = Router();

function fallbackCategoryName(): string {
  const lang = String(getSettingValue('language') || 'en').slice(0, 2).toLowerCase();
  if (lang === 'ru') return 'Меню';
  if (lang === 'kk') return 'Мәзір';
  return 'Menu';
}

function slugForName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  if (slug) return slug;
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return `cat-${Math.abs(hash)}`;
}

function normalizeImportItems(raw: unknown): ParsedMenuItem[] {
  if (!Array.isArray(raw)) {
    throw Object.assign(new Error('items must be an array'), { statusCode: 400 });
  }
  if (raw.length > MAX_MENU_ITEMS) {
    throw Object.assign(new Error(`Import exceeds the ${MAX_MENU_ITEMS}-item limit`), { statusCode: 400 });
  }

  const items: ParsedMenuItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    const name = typeof rec.name === 'string' ? rec.name.trim() : '';
    if (!name) continue;
    const price = typeof rec.price === 'number' ? rec.price : Number(rec.price);
    if (!Number.isFinite(price) || price < 0) continue;
    const description = typeof rec.description === 'string' ? rec.description.trim() : '';
    const category = typeof rec.category === 'string' ? rec.category.trim() : '';
    items.push({
      name: name.slice(0, 200),
      price,
      description: description.slice(0, 2000),
      category: category.slice(0, 100),
    });
  }
  return items;
}

function pdfErrorResponse(res: Response, error: unknown): Response {
  const status = (error as { statusCode?: number })?.statusCode;
  if (status && status >= 400 && status < 500) {
    return res.status(status).json({ error: (error as Error).message });
  }
  console.error('[API] Menu PDF import failed:', error);
  return res.status(500).json({ error: 'Menu PDF import failed' });
}

router.post('/parse', requireRole(...ROLE_ACCESS.ownerManager), async (req: Request, res: Response) => {
  try {
    const body = (req.body || {}) as { file_base64?: unknown; pdf_base64?: unknown };
    const buffer = decodeMenuFileBase64(body.file_base64 || body.pdf_base64);
    const parsed = await parseMenuFile(buffer, '');
    res.json({
      items: parsed.items,
      skipped: parsed.skipped.slice(0, 50),
      skipped_count: parsed.skipped.length,
      warnings: parsed.warnings,
      pages: parsed.pages,
      text_length: parsed.textLength,
      ocr: parsed.ocr,
    });
  } catch (error) {
    return pdfErrorResponse(res, error);
  }
});

router.post('/import', requireRole(...ROLE_ACCESS.ownerManager), (req: Request, res: Response) => {
  try {
    const body = (req.body || {}) as { items?: unknown; replace?: unknown };
    const items = normalizeImportItems(body.items);
    if (!items.length) return res.status(400).json({ error: 'No menu items to import' });

    const replace = body.replace === true;
    const db = getDatabase();
    const catalogScope = normalizeCatalogBusinessType(getSettingValue('business_type'));
    const defaultCategory = fallbackCategoryName();

    let created = 0;
    let skipped = 0;
    let failed = 0;
    let categoriesCreated = 0;
    let replacedProducts = 0;
    let replacedCategories = 0;
    const errors: string[] = [];

    db.transaction(() => {
      if (replace) {
        const stamp = now();
        const productResult = db.prepare(`
          UPDATE products SET deleted_at = ?, updated_at = ?
          WHERE deleted_at IS NULL
            AND (
              category_id IS NULL
              OR category_id IN (
                SELECT id FROM categories
                WHERE deleted_at IS NULL AND (business_scope = 'both' OR business_scope = ?)
              )
            )
        `).run(stamp, stamp, catalogScope);
        replacedProducts = productResult.changes;

        const categoryResult = db.prepare(`
          UPDATE categories SET deleted_at = ?, updated_at = ?
          WHERE deleted_at IS NULL AND (business_scope = 'both' OR business_scope = ?)
        `).run(stamp, stamp, catalogScope);
        replacedCategories = categoryResult.changes;
      }

      const catRows = db.prepare('SELECT id, name FROM categories WHERE deleted_at IS NULL').all() as { id: string; name: string }[];
      const catMap: Record<string, string> = {};
      for (const cat of catRows) catMap[cat.name.toLowerCase()] = cat.id;

      let nextSort = (db.prepare(
        'SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM categories WHERE deleted_at IS NULL',
      ).get() as { max_sort: number }).max_sort;

      const ensureCategory = (rawName: string): string => {
        const name = (rawName || defaultCategory).trim() || defaultCategory;
        const key = name.toLowerCase();
        const existing = catMap[key];
        if (existing) return existing;

        const id = uuidv4();
        nextSort += 1;
        db.prepare(`
          INSERT INTO categories (id, name, slug, description, color, icon, sort_order, is_active, business_scope, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        `).run(id, name, slugForName(name), null, null, null, nextSort, catalogScope, now(), now());
        catMap[key] = id;
        categoriesCreated++;
        return id;
      };

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.name) {
          failed++;
          errors.push(`Item ${i + 1}: missing name`);
          continue;
        }
        if (!Number.isFinite(item.price) || item.price < 0) {
          failed++;
          errors.push(`Item ${i + 1} (${item.name}): invalid price`);
          continue;
        }

        try {
          const categoryId = ensureCategory(item.category);
          const exists = db.prepare(
            'SELECT id FROM products WHERE name = ? AND category_id IS ? AND deleted_at IS NULL',
          ).get(item.name, categoryId);
          if (exists) {
            skipped++;
            continue;
          }

          db.prepare(`
            INSERT INTO products (id, name, category_id, price, description, cost, tax_type, tax_rate,
              tax_category_id, tax_behavior, cb_percent, tags, is_active, sku, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
          `).run(
            generateShortId('products'),
            item.name,
            categoryId,
            item.price,
            item.description || null,
            0,
            'none',
            0,
            null,
            'country_default',
            null,
            null,
            1,
            null,
            now(),
            now(),
          );
          created++;
        } catch (error: any) {
          failed++;
          errors.push(`Item ${i + 1} (${item.name}): ${error?.message || 'failed'}`);
        }
      }
    })();

    res.json({
      created,
      updated: 0,
      skipped,
      failed,
      categories_created: categoriesCreated,
      replaced_products: replacedProducts,
      replaced_categories: replacedCategories,
      errors,
    });
  } catch (error) {
    return pdfErrorResponse(res, error);
  }
});

export { router as menuPdfRoutes };

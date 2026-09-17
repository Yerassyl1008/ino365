/**
 * Catalog visibility by venue type. Cafe and shop share one products table;
 * categories declare which mode they belong to so POS/stock hide the rest
 * without deleting historical sales.
 */

export const BUSINESS_SCOPES = ['restaurant', 'retail', 'both'] as const;
export type BusinessScope = (typeof BUSINESS_SCOPES)[number];
export type CatalogBusinessType = 'restaurant' | 'retail';

export const RESTAURANT_TEMPLATE_CATEGORY_IDS = [
  'cat-express-food',
  'cat-express-beverages',
  'cat-demo-grill',
  'cat-demo-main',
  'cat-demo-starters',
  'cat-demo-sides',
  'cat-demo-sauces',
  'cat-demo-beverages',
  'cat-demo-desserts',
] as const;

export const RETAIL_TEMPLATE_CATEGORY_IDS = [
  'cat-express-grocery',
  'cat-express-drinks',
  'cat-express-household',
] as const;

export function isBusinessScope(value: unknown): value is BusinessScope {
  return value === 'restaurant' || value === 'retail' || value === 'both';
}

export function normalizeCatalogBusinessType(value: unknown): CatalogBusinessType {
  return value === 'retail' ? 'retail' : 'restaurant';
}

export function categoryVisibleForBusiness(
  scope: string | null | undefined,
  businessType: string,
): boolean {
  if (!scope || scope === 'both') return true;
  return scope === businessType;
}

/** SQL on categories; bind the current business type as the next parameter. */
export const CATEGORY_SCOPE_SQL = `(business_scope = 'both' OR business_scope = ?)`;

/**
 * SQL on a products query that LEFT JOINs categories AS c.
 * Uncategorized products stay visible in every mode.
 */
export const JOINED_CATEGORY_SCOPE_SQL = `(c.id IS NULL OR c.business_scope = 'both' OR c.business_scope = ?)`;

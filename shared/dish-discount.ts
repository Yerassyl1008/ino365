/**
 * Catalog (per-dish) discounts with channel targeting.
 *
 * Stacking with till/bill discounts (existing FloCafe rules, unchanged):
 * 1. Dish discount reduces the item subtotal first (same field as a manual
 *    PATCH /items/:id/discount — one item.discount_amount, last write wins).
 * 2. Order/bill discount then applies to the remaining order subtotal.
 * They do stack: pizza 10% off, then a 5% bill discount on the reduced total.
 * Catalog discounts are owner-set sale prices and skip till PIN / max-limit
 * checks. Clients cannot send item.discount_amount on create/add-item.
 */

export const ORDER_TYPES = ['dine_in', 'takeaway', 'delivery', 'online'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];
export type DishDiscountType = 'percentage' | 'amount';

export const ALL_ORDER_TYPES: OrderType[] = [...ORDER_TYPES];

export type ProductDiscountFields = {
  discount_type?: string | null;
  discount_value?: number | string | null;
  discount_applies_to?: unknown;
};

export function isOrderType(value: unknown): value is OrderType {
  return value === 'dine_in' || value === 'takeaway' || value === 'delivery' || value === 'online';
}

export function parseDiscountAppliesTo(raw: unknown): OrderType[] {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      parsed = trimmed.split(',').map((part) => part.trim());
    }
  }
  if (!Array.isArray(parsed)) return [];
  const unique: OrderType[] = [];
  for (const entry of parsed) {
    if (isOrderType(entry) && !unique.includes(entry)) unique.push(entry);
  }
  return unique;
}

export function serializeDiscountAppliesTo(types: OrderType[]): string {
  return JSON.stringify(ALL_ORDER_TYPES.filter((type) => types.includes(type)));
}

export function isActiveDishDiscount(product: ProductDiscountFields | null | undefined): boolean {
  if (!product) return false;
  const type = product.discount_type;
  const value = Number(product.discount_value);
  return (type === 'percentage' || type === 'amount') && Number.isFinite(value) && value > 0;
}

export function dishDiscountApplies(
  product: ProductDiscountFields | null | undefined,
  orderType: string | null | undefined,
): boolean {
  if (!isActiveDishDiscount(product) || !isOrderType(orderType)) return false;
  const channels = parseDiscountAppliesTo(product!.discount_applies_to);
  // Empty channel list means "all / оба" so a saved percent is never silently inert.
  if (channels.length === 0) return true;
  return channels.includes(orderType);
}

export function calculateDishDiscountAmount(params: {
  unitPrice: number;
  quantity: number;
  addonTotal?: number;
  discountType: DishDiscountType;
  discountValue: number;
}): number {
  const unitPrice = Number(params.unitPrice);
  const quantity = Number(params.quantity);
  const addonTotal = Number(params.addonTotal) || 0;
  const discountValue = Number(params.discountValue);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return 0;
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  if (!Number.isFinite(discountValue) || discountValue <= 0) return 0;

  const lineBase = unitPrice * quantity + (Number.isFinite(addonTotal) && addonTotal > 0 ? addonTotal : 0);
  if (lineBase <= 0) return 0;

  let amount: number;
  if (params.discountType === 'percentage') {
    const percent = Math.min(discountValue, 100);
    amount = (lineBase * percent) / 100;
  } else {
    // Flat amount is per dish (unit), not a one-shot off the whole line,
    // so POS old/new unit prices stay truthful at qty > 1.
    amount = Math.min(discountValue, unitPrice) * quantity;
    amount = Math.min(amount, lineBase);
  }
  return Math.round(amount * 100) / 100;
}

export function discountedUnitPrice(
  unitPrice: number,
  discountType: DishDiscountType,
  discountValue: number,
): number {
  const price = Number(unitPrice);
  const value = Number(discountValue);
  if (!Number.isFinite(price) || price < 0) return 0;
  if (!Number.isFinite(value) || value <= 0) return Math.round(price * 100) / 100;
  if (discountType === 'percentage') {
    return Math.max(0, Math.round(price * (1 - Math.min(value, 100) / 100) * 100) / 100);
  }
  return Math.max(0, Math.round((price - value) * 100) / 100);
}

export function catalogLineDiscount(
  product: ProductDiscountFields | null | undefined,
  orderType: string | null | undefined,
  unitPrice: number,
  quantity: number,
  addonTotal = 0,
): number {
  if (!dishDiscountApplies(product, orderType)) return 0;
  return calculateDishDiscountAmount({
    unitPrice,
    quantity,
    addonTotal,
    discountType: product!.discount_type as DishDiscountType,
    discountValue: Number(product!.discount_value),
  });
}

export function visibleDishPrices(
  product: ProductDiscountFields & { price?: number | string | null } | null | undefined,
  orderType?: string | null,
): { original: number; discounted: number | null } {
  const original = Number(product?.price) || 0;
  const active = orderType == null || orderType === ''
    ? isActiveDishDiscount(product)
    : dishDiscountApplies(product, orderType);
  if (!active || !product) return { original, discounted: null };
  const discounted = discountedUnitPrice(
    original,
    product.discount_type as DishDiscountType,
    Number(product.discount_value),
  );
  if (discounted >= original) return { original, discounted: null };
  return { original, discounted };
}

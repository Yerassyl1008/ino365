/**
 * Day-close (Z-report) aggregation for a UTC calendar day or inclusive date range.
 *
 * Paid bills in that window drive sales, staff, department, payment, and client
 * rows. Cancelled orders / voided items are counted separately and excluded
 * from sales. Share percents are each row's amount of the period's paid total.
 *
 * Departments prefer a kitchen station whose category_ids include the product
 * (Paloma-style подразделение). Otherwise they use the menu category. Catch-all
 * "Food"/"Еда" buckets yield to a more specific station or category named on
 * the product or order item. Department Сумма is item subtotals (not paid
 * bills); Обсл is the staff service share allocated by item amount, then qty.
 */

import Decimal from 'decimal.js';
import { getDatabase, getSettingValue, now, utcDayBounds } from '../db';

export type DayCloseNamedRow = {
  name: string | null;
  billCount: number;
  itemCount: number;
  serviceCharge: number;
  amount: number;
  sharePercent: number;
};

export type DayCloseStaffRow = DayCloseNamedRow & {
  userId: string | null;
};

export type DayCloseDepartmentRow = {
  categoryId: string | null;
  name: string | null;
  quantity: number;
  serviceCharge: number;
  amount: number;
  sharePercent: number;
};

export type DayCloseClientRow = {
  customerId: string | null;
  name: string | null;
  billCount: number;
  itemCount: number;
  amount: number;
  amountBeforeDiscount: number;
  sharePercent: number;
};

export type DayClosePaymentRow = {
  method: string;
  count: number;
  amount: number;
  sharePercent: number;
};

export type DayCloseReport = {
  date: string;
  startDate: string;
  endDate: string;
  generatedAt: string;
  businessName: string;
  header: {
    billCount: number;
    orderItemCount: number;
    cancelledReceiptCount: number;
    cancelledItemCount: number;
    cancelledAmount: number;
    guestCount: number;
    transfers: number;
    unlocks: number;
    serviceCharge: number;
    serviceChargeOwner: number;
  };
  payments: DayClosePaymentRow[];
  paymentTotal: number;
  staff: DayCloseStaffRow[];
  staffTotal: { billCount: number; itemCount: number; serviceCharge: number; amount: number };
  departments: DayCloseDepartmentRow[];
  departmentTotal: { quantity: number; serviceCharge: number; amount: number };
  clients: DayCloseClientRow[];
  clientTotal: { billCount: number; itemCount: number; amount: number; amountBeforeDiscount: number };
};

type Db = ReturnType<typeof getDatabase>;

function money(value: number | string | null | undefined): number {
  return new Decimal(value ?? 0).toDecimalPlaces(2).toNumber();
}

function sharePercent(part: number, whole: number): number {
  if (!(whole > 0)) return 0;
  return new Decimal(part).div(whole).mul(100).toDecimalPlaces(1).toNumber();
}

/** Express leftover / catch-all menu buckets — not Paloma kitchen departments. */
const GENERIC_CATEGORY_IDS = new Set(['cat-express-food']);
const GENERIC_DEPARTMENT_NAMES = new Set(['food', 'еда', 'тағам']);

type KitchenStationDept = { id: string; name: string; categoryIds: string[] };
type CategoryDept = { id: string; name: string | null; parentId: string | null };

function isGenericDepartmentName(name: string | null | undefined): boolean {
  return GENERIC_DEPARTMENT_NAMES.has((name || '').trim().toLowerCase());
}

function isGenericCategory(id: string | null | undefined, name: string | null | undefined): boolean {
  if (id && GENERIC_CATEGORY_IDS.has(id)) return true;
  return isGenericDepartmentName(name);
}

function parseJsonStringList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((value) => String(value).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** Largest-remainder split so department Обсл pennies sum to the staff share. */
function allocateMoney(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const signedMinor = new Decimal(total).mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  const sign = signedMinor < 0 ? -1 : 1;
  const sourceMinor = Math.abs(signedMinor);
  if (sourceMinor === 0) return Array(n).fill(0);

  const safeWeights = weights.map((weight) => Math.max(0, Number(weight) || 0));
  const totalWeight = safeWeights.reduce((sum, weight) => sum + weight, 0);
  const effective = totalWeight > 0 ? safeWeights : Array(n).fill(1);
  const effectiveTotal = effective.reduce((sum, weight) => sum + weight, 0);

  const base = new Array<number>(n);
  const remainders: { index: number; remainder: number }[] = new Array(n);
  let used = 0;
  for (let i = 0; i < n; i++) {
    const exact = (sourceMinor * effective[i]) / effectiveTotal;
    const floored = Math.floor(exact);
    base[i] = floored;
    used += floored;
    remainders[i] = { index: i, remainder: exact - floored };
  }
  remainders.sort((a, b) => {
    if (Math.abs(b.remainder - a.remainder) > 1e-9) return b.remainder - a.remainder;
    return a.index - b.index;
  });
  let left = sourceMinor - used;
  for (let i = 0; i < left; i++) base[remainders[i].index] += 1;
  return base.map((minor) => money((minor * sign) / 100));
}

function bestNameMatch(
  text: string,
  stations: KitchenStationDept[],
  categories: CategoryDept[],
): { id: string; name: string } | null {
  const hay = text.trim().toLowerCase();
  if (!hay) return null;
  const candidates: { id: string; name: string; len: number; station: boolean }[] = [];
  const consider = (id: string, name: string | null, station: boolean) => {
    const label = (name || '').trim();
    if (label.length < 3 || isGenericDepartmentName(label)) return;
    const needle = label.toLowerCase();
    if (!hay.includes(needle)) return;
    candidates.push({ id, name: label, len: needle.length, station });
  };
  for (const station of stations) consider(station.id, station.name, true);
  for (const category of categories) consider(category.id, category.name, false);
  candidates.sort((a, b) => b.len - a.len || Number(b.station) - Number(a.station) || a.name.localeCompare(b.name));
  const winner = candidates[0];
  return winner ? { id: winner.id, name: winner.name } : null;
}

function stationForCategory(
  categoryId: string | null,
  stationByCategory: Map<string, KitchenStationDept>,
  categoriesById: Map<string, CategoryDept>,
): KitchenStationDept | null {
  let id = categoryId;
  const seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    const station = stationByCategory.get(id);
    if (station) return station;
    id = categoriesById.get(id)?.parentId ?? null;
  }
  return null;
}

function resolveDepartment(
  categoryId: string | null,
  categoryName: string | null,
  productName: string,
  tags: string[],
  stations: KitchenStationDept[],
  stationByCategory: Map<string, KitchenStationDept>,
  categoriesById: Map<string, CategoryDept>,
): { id: string | null; name: string | null } {
  const station = stationForCategory(categoryId, stationByCategory, categoriesById);
  if (station) return { id: station.id, name: station.name };

  if (!isGenericCategory(categoryId, categoryName)) {
    return { id: categoryId, name: categoryName };
  }

  const searchText = [productName, ...tags].filter(Boolean).join(' ');
  const specific = bestNameMatch(searchText, stations, [...categoriesById.values()]);
  if (specific) return specific;
  return { id: categoryId, name: categoryName };
}

const PAID_WHERE = `b.paid_at >= ? AND b.paid_at < ? AND o.status != 'cancelled'`;
const LIVE_ITEM = `(oi.status IS NULL OR oi.status NOT IN ('cancelled', 'voided')) AND oi.voided_at IS NULL`;

function paymentBreakdown(db: Db, start: string, end: string): DayClosePaymentRow[] {
  const rows = db.prepare(`
    WITH payment_lines AS (
      SELECT je.value AS line
      FROM bills b
      JOIN orders o ON o.id = b.order_id
      JOIN json_each(CASE
        WHEN json_valid(b.payment_details) AND json_type(b.payment_details) = 'array'
          THEN b.payment_details
        WHEN json_valid(b.payment_details)
          THEN json_array(b.payment_details)
        ELSE '[]'
      END) je
      WHERE ${PAID_WHERE}
        AND b.payment_details IS NOT NULL
        AND json_type(je.value) = 'object'
    )
    SELECT COALESCE(pm.name, COALESCE(NULLIF(json_extract(line, '$.method'), ''), 'unknown')) AS method,
      COUNT(*) AS count,
      COALESCE(SUM(CASE WHEN typeof(json_extract(line, '$.amount')) IN ('integer', 'real')
        THEN json_extract(line, '$.amount') ELSE 0 END), 0) AS amount
    FROM payment_lines
    LEFT JOIN payment_methods pm ON pm.id = CAST(json_extract(line, '$.payment_method_id') AS INTEGER)
    GROUP BY COALESCE(pm.name, COALESCE(NULLIF(json_extract(line, '$.method'), ''), 'unknown'))
    ORDER BY amount DESC
  `).all(start, end) as { method: string; count: number; amount: number }[];

  const total = rows.reduce((sum, row) => sum + Number(row.amount), 0);
  return rows.map((row) => ({
    method: row.method,
    count: Number(row.count),
    amount: money(row.amount),
    sharePercent: sharePercent(Number(row.amount), total),
  }));
}

export function buildDayCloseReport(date: string, db: Db = getDatabase()): DayCloseReport {
  return buildPeriodCloseReport(date, date, db);
}

export function buildPeriodCloseReport(startDate: string, endDate: string, db: Db = getDatabase()): DayCloseReport {
  const [start] = utcDayBounds(startDate);
  const [, end] = utcDayBounds(endDate);

  const headerRow = db.prepare(`
    SELECT
      COUNT(b.id) AS billCount,
      COALESCE((
        SELECT SUM(oi.quantity)
        FROM order_items oi
        WHERE oi.order_id IN (
          SELECT DISTINCT b.order_id
          FROM bills b
          JOIN orders o ON o.id = b.order_id
          WHERE ${PAID_WHERE}
        )
          AND ${LIVE_ITEM}
      ), 0) AS orderItemCount,
      COALESCE((
        SELECT SUM(COALESCE(g.guest_count, 1))
        FROM (
          SELECT DISTINCT o.id, o.guest_count
          FROM bills b
          JOIN orders o ON o.id = b.order_id
          WHERE ${PAID_WHERE}
        ) g
      ), 0) AS guestCount
    FROM bills b
    JOIN orders o ON o.id = b.order_id
    WHERE ${PAID_WHERE}
  `).get(start, end, start, end, start, end) as {
    billCount: number;
    orderItemCount: number;
    guestCount: number;
  };

  const cancelledOrders = db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS amount
    FROM orders
    WHERE status = 'cancelled'
      AND COALESCE(cancelled_at, created_at) >= ?
      AND COALESCE(cancelled_at, created_at) < ?
  `).get(start, end) as { count: number; amount: number };

  const cancelledOrderItems = db.prepare(`
    SELECT COALESCE(SUM(oi.quantity), 0) AS qty
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status = 'cancelled'
      AND COALESCE(o.cancelled_at, o.created_at) >= ?
      AND COALESCE(o.cancelled_at, o.created_at) < ?
  `).get(start, end) as { qty: number };

  const voidedOnLive = db.prepare(`
    SELECT COALESCE(SUM(oi.quantity), 0) AS qty, COALESCE(SUM(oi.total), 0) AS amount
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status != 'cancelled'
      AND o.created_at >= ? AND o.created_at < ?
      AND (oi.status IN ('cancelled', 'voided') OR oi.voided_at IS NOT NULL)
  `).get(start, end) as { qty: number; amount: number };

  const paidTotalRow = db.prepare(`
    SELECT COALESCE(SUM(b.paid_amount), 0) AS amount
    FROM bills b
    JOIN orders o ON o.id = b.order_id
    WHERE ${PAID_WHERE}
  `).get(start, end) as { amount: number };
  const paidTotal = money(paidTotalRow.amount);

  const staffBillRows = db.prepare(`
    SELECT o.user_id AS userId, u.name AS name,
      COUNT(b.id) AS billCount,
      COALESCE(SUM(b.paid_amount), 0) AS amount
    FROM bills b
    JOIN orders o ON o.id = b.order_id
    LEFT JOIN users u ON u.id = o.user_id
    WHERE ${PAID_WHERE}
    GROUP BY o.user_id
    ORDER BY amount DESC, billCount DESC
  `).all(start, end) as { userId: string | null; name: string | null; billCount: number; amount: number }[];

  const staffItemRows = db.prepare(`
    SELECT o.user_id AS userId, COALESCE(SUM(oi.quantity), 0) AS itemCount
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.id IN (
      SELECT DISTINCT b.order_id
      FROM bills b
      JOIN orders o ON o.id = b.order_id
      WHERE ${PAID_WHERE}
    )
      AND ${LIVE_ITEM}
    GROUP BY o.user_id
  `).all(start, end) as { userId: string | null; itemCount: number }[];
  const staffItems = new Map(staffItemRows.map((row) => [row.userId ?? '', Number(row.itemCount)]));
  const staffServiceRows = db.prepare(`
    SELECT userId, COALESCE(SUM(staffShare), 0) AS staffShare
    FROM (
      SELECT DISTINCT o.id, o.user_id AS userId,
        COALESCE(o.service_charge, 0) - COALESCE(o.service_charge_owner_amount, 0) AS staffShare
      FROM bills b
      JOIN orders o ON o.id = b.order_id
      WHERE ${PAID_WHERE}
    )
    GROUP BY userId
  `).all(start, end) as { userId: string | null; staffShare: number }[];
  const staffService = new Map(staffServiceRows.map((row) => [row.userId ?? '', money(row.staffShare)]));

  const serviceTotals = db.prepare(`
    SELECT
      COALESCE(SUM(service_charge), 0) AS serviceCharge,
      COALESCE(SUM(service_charge_owner_amount), 0) AS ownerAmount
    FROM (
      SELECT DISTINCT o.id, o.service_charge, o.service_charge_owner_amount
      FROM bills b
      JOIN orders o ON o.id = b.order_id
      WHERE ${PAID_WHERE}
    )
  `).get(start, end) as { serviceCharge: number; ownerAmount: number };

  const staff: DayCloseStaffRow[] = staffBillRows.map((row) => ({
    userId: row.userId,
    name: row.name,
    billCount: Number(row.billCount),
    itemCount: staffItems.get(row.userId ?? '') ?? 0,
    serviceCharge: staffService.get(row.userId ?? '') ?? 0,
    amount: money(row.amount),
    sharePercent: sharePercent(Number(row.amount), paidTotal),
  }));

  const categoryRows = db.prepare(`
    SELECT id, name, parent_id AS parentId FROM categories WHERE deleted_at IS NULL
  `).all() as CategoryDept[];
  const categoriesById = new Map(categoryRows.map((row) => [row.id, row]));

  const stationRows = db.prepare(`
    SELECT id, name, category_ids AS categoryIds
    FROM kitchen_stations
    WHERE is_active = 1
  `).all() as { id: string; name: string; categoryIds: string | null }[];
  const stations: KitchenStationDept[] = stationRows
    .map((row) => ({ id: row.id, name: row.name, categoryIds: parseJsonStringList(row.categoryIds) }))
    .filter((station) => station.categoryIds.length > 0)
    .sort((a, b) => a.categoryIds.length - b.categoryIds.length || a.name.localeCompare(b.name));
  const stationByCategory = new Map<string, KitchenStationDept>();
  for (const station of stations) {
    for (const mappedId of station.categoryIds) {
      if (!stationByCategory.has(mappedId)) stationByCategory.set(mappedId, station);
    }
  }

  const departmentItemRows = db.prepare(`
    SELECT o.id AS orderId,
      COALESCE(o.service_charge, 0) - COALESCE(o.service_charge_owner_amount, 0) AS staffShare,
      p.category_id AS categoryId,
      c.name AS categoryName,
      COALESCE(oi.product_name, p.name) AS productName,
      p.tags AS tags,
      COALESCE(oi.quantity, 0) AS quantity,
      COALESCE(oi.subtotal, 0) AS amount
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE o.id IN (
      SELECT DISTINCT b.order_id
      FROM bills b
      JOIN orders o ON o.id = b.order_id
      WHERE ${PAID_WHERE}
    )
      AND ${LIVE_ITEM}
  `).all(start, end) as {
    orderId: number;
    staffShare: number;
    categoryId: string | null;
    categoryName: string | null;
    productName: string | null;
    tags: string | null;
    quantity: number;
    amount: number;
  }[];

  type DeptAgg = { categoryId: string | null; name: string | null; quantity: number; amount: Decimal; serviceCharge: Decimal };
  const departmentAgg = new Map<string, DeptAgg>();
  const orderWeights = new Map<number, { staffShare: number; weights: Map<string, { amount: number; quantity: number }> }>();

  for (const row of departmentItemRows) {
    const department = resolveDepartment(
      row.categoryId,
      row.categoryName,
      row.productName || '',
      parseJsonStringList(row.tags),
      stations,
      stationByCategory,
      categoriesById,
    );
    const key = department.id ?? '';
    const existing = departmentAgg.get(key);
    const amount = new Decimal(row.amount ?? 0);
    const quantity = Number(row.quantity) || 0;
    if (existing) {
      existing.quantity += quantity;
      existing.amount = existing.amount.plus(amount);
    } else {
      departmentAgg.set(key, {
        categoryId: department.id,
        name: department.name,
        quantity,
        amount,
        serviceCharge: new Decimal(0),
      });
    }

    let order = orderWeights.get(row.orderId);
    if (!order) {
      order = { staffShare: money(row.staffShare), weights: new Map() };
      orderWeights.set(row.orderId, order);
    }
    const weight = order.weights.get(key) || { amount: 0, quantity: 0 };
    weight.amount += Number(row.amount) || 0;
    weight.quantity += quantity;
    order.weights.set(key, weight);
  }

  for (const order of orderWeights.values()) {
    if (!(order.staffShare > 0) || order.weights.size === 0) continue;
    const keys = [...order.weights.keys()];
    const amountWeights = keys.map((key) => order.weights.get(key)!.amount);
    const quantityWeights = keys.map((key) => order.weights.get(key)!.quantity);
    const useQuantity = amountWeights.every((value) => !(value > 0));
    const shares = allocateMoney(order.staffShare, useQuantity ? quantityWeights : amountWeights);
    keys.forEach((key, index) => {
      const agg = departmentAgg.get(key);
      if (agg) agg.serviceCharge = agg.serviceCharge.plus(shares[index] || 0);
    });
  }

  const staffServiceTotal = money(staff.reduce((sum, row) => sum + row.serviceCharge, 0));
  const allocatedService = money([...departmentAgg.values()].reduce((sum, row) => sum + row.serviceCharge.toNumber(), 0));
  const leftoverService = money(new Decimal(staffServiceTotal).minus(allocatedService).toNumber());
  if (leftoverService !== 0 && departmentAgg.size > 0) {
    const keys = [...departmentAgg.keys()];
    const amountWeights = keys.map((key) => departmentAgg.get(key)!.amount.toNumber());
    const quantityWeights = keys.map((key) => departmentAgg.get(key)!.quantity);
    const useQuantity = amountWeights.every((value) => !(value > 0));
    const shares = allocateMoney(leftoverService, useQuantity ? quantityWeights : amountWeights);
    keys.forEach((key, index) => {
      const agg = departmentAgg.get(key);
      if (agg) agg.serviceCharge = agg.serviceCharge.plus(shares[index] || 0);
    });
  }

  const departments: DayCloseDepartmentRow[] = [...departmentAgg.values()]
    .map((row) => ({
      categoryId: row.categoryId,
      name: row.name,
      quantity: row.quantity,
      serviceCharge: money(row.serviceCharge.toNumber()),
      amount: money(row.amount.toNumber()),
      sharePercent: sharePercent(row.amount.toNumber(), paidTotal),
    }))
    .sort((a, b) => b.amount - a.amount || b.quantity - a.quantity || (a.name || '').localeCompare(b.name || ''));

  const clientRows = db.prepare(`
    SELECT b.customer_id AS customerId, c.name AS name,
      COUNT(b.id) AS billCount,
      COALESCE(SUM(b.paid_amount), 0) AS amount,
      COALESCE(SUM(b.paid_amount + COALESCE(b.discount_amount, 0)), 0) AS amountBeforeDiscount
    FROM bills b
    JOIN orders o ON o.id = b.order_id
    LEFT JOIN customers c ON c.id = b.customer_id
    WHERE ${PAID_WHERE}
    GROUP BY b.customer_id
    ORDER BY amount DESC
  `).all(start, end) as {
    customerId: string | null;
    name: string | null;
    billCount: number;
    amount: number;
    amountBeforeDiscount: number;
  }[];

  const clientItemRows = db.prepare(`
    SELECT b.customer_id AS customerId, COALESCE(SUM(oi.quantity), 0) AS itemCount
    FROM bills b
    JOIN orders o ON o.id = b.order_id
    JOIN order_items oi ON oi.order_id = o.id
    WHERE ${PAID_WHERE}
      AND ${LIVE_ITEM}
    GROUP BY b.customer_id
  `).all(start, end) as { customerId: string | null; itemCount: number }[];
  const clientItems = new Map(clientItemRows.map((row) => [row.customerId ?? '', Number(row.itemCount)]));

  const clients: DayCloseClientRow[] = clientRows.map((row) => ({
    customerId: row.customerId,
    name: row.name,
    billCount: Number(row.billCount),
    itemCount: clientItems.get(row.customerId ?? '') ?? 0,
    amount: money(row.amount),
    amountBeforeDiscount: money(row.amountBeforeDiscount),
    sharePercent: sharePercent(Number(row.amount), paidTotal),
  }));

  const payments = paymentBreakdown(db, start, end);
  const paymentTotal = money(payments.reduce((sum, row) => sum + row.amount, 0));

  return {
    date: startDate === endDate ? startDate : `${startDate}/${endDate}`,
    startDate,
    endDate,
    generatedAt: now(),
    businessName: getSettingValue('business_name') || '',
    header: {
      billCount: Number(headerRow.billCount),
      orderItemCount: Number(headerRow.orderItemCount),
      cancelledReceiptCount: Number(cancelledOrders.count),
      cancelledItemCount: Number(cancelledOrderItems.qty) + Number(voidedOnLive.qty),
      cancelledAmount: money(Number(cancelledOrders.amount) + Number(voidedOnLive.amount)),
      guestCount: Number(headerRow.guestCount),
      transfers: 0,
      unlocks: 0,
      serviceCharge: money(serviceTotals.serviceCharge),
      serviceChargeOwner: money(serviceTotals.ownerAmount),
    },
    payments,
    paymentTotal,
    staff,
    staffTotal: {
      billCount: staff.reduce((sum, row) => sum + row.billCount, 0),
      itemCount: staff.reduce((sum, row) => sum + row.itemCount, 0),
      serviceCharge: money(staff.reduce((sum, row) => sum + row.serviceCharge, 0)),
      amount: money(staff.reduce((sum, row) => sum + row.amount, 0)),
    },
    departments,
    departmentTotal: {
      quantity: departments.reduce((sum, row) => sum + row.quantity, 0),
      serviceCharge: money(departments.reduce((sum, row) => sum + row.serviceCharge, 0)),
      amount: money(departments.reduce((sum, row) => sum + row.amount, 0)),
    },
    clients,
    clientTotal: {
      billCount: clients.reduce((sum, row) => sum + row.billCount, 0),
      itemCount: clients.reduce((sum, row) => sum + row.itemCount, 0),
      amount: money(clients.reduce((sum, row) => sum + row.amount, 0)),
      amountBeforeDiscount: money(clients.reduce((sum, row) => sum + row.amountBeforeDiscount, 0)),
    },
  };
}

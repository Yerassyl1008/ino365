/**
 * Kitchen/bar ticket printing. POS and the waiter Server App share this path
 * so USB/LAN printers attached to the till (not the phone) receive KOT.
 */

import { attachEffectiveAddons, getDatabase, isAutoPrintKotEnabled, isKotPrintingEnabled, parseItemJson } from '../db';
import { KOT_LANGUAGE_POLICY_KEY, parseStoredLanguagePolicy } from '../lib/print-language-settings';
import * as thermal from '../printers/thermal';
import { CAFE_SKIP_KOT_CATEGORY_IDS } from '../../shared/catalog-scope';
import { groupItemsByKitchenStations } from '../../shared/kot-routing';
import { resolveKotLanguage, type KotLanguagePolicy } from '../../shared/print';

export type KotPrintTicketResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  warnings: NonNullable<Awaited<ReturnType<typeof thermal.printKOTDetailed>>['warnings']>;
  failure: Awaited<ReturnType<typeof thermal.printKOTDetailed>> | null;
  stations: string[];
};

type PrintKotTicketsArgs = {
  orderId: string | number;
  items?: any[];
  stationName?: string;
  useUnicode?: boolean;
  arabicShaping?: boolean;
  signal?: AbortSignal;
};

let autoPrintTail: Promise<unknown> = Promise.resolve();

export function getEffectiveOrderItems(db: any, orderId: string | number): any[] {
  return attachEffectiveAddons(
    db,
    (db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId) as any[]).map(parseItemJson),
  );
}

export function routeItemsToStations(db: any, orderItems: any[]): { stationName: string; printer: any; items: any[] }[] {
  const rawStations = db.prepare(
    `SELECT * FROM kitchen_stations WHERE is_active = 1 AND category_ids IS NOT NULL AND category_ids != '' ORDER BY sort_order, name`,
  ).all() as any[];

  const stations = rawStations
    .map((s) => {
      let categoryIds: string[] = [];
      try {
        categoryIds = JSON.parse(s.category_ids) || [];
      } catch {
        categoryIds = [];
      }
      const printer = s.printer_id
        ? db.prepare(
            `SELECT * FROM printers
             WHERE id = ? AND connection_type != 'webusb'`,
          ).get(s.printer_id)
        : null;
      return { id: s.id, name: s.name, categoryIds, printer: printer || null, hasPrinter: !!printer, sortOrder: Number(s.sort_order) || 0 };
    })
    .filter((s) => s.categoryIds.length > 0)
    .sort((a, b) => {
      if (a.hasPrinter !== b.hasPrinter) return a.hasPrinter ? -1 : 1;
      return a.sortOrder - b.sortOrder;
    });

  const categoryByProduct = new Map<string, string | null>();
  const resolveCategoryId = (item: any) => {
    if (!item?.product_id) return null;
    if (!categoryByProduct.has(item.product_id)) {
      const product = db.prepare('SELECT category_id FROM products WHERE id = ?').get(item.product_id) as { category_id?: string } | undefined;
      categoryByProduct.set(item.product_id, product?.category_id ?? null);
    }
    return categoryByProduct.get(item.product_id);
  };

  return groupItemsByKitchenStations(orderItems, resolveCategoryId, stations, CAFE_SKIP_KOT_CATEGORY_IDS);
}

function tenantLanguage(db: ReturnType<typeof getDatabase>): string {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'language'").get() as { value?: string } | undefined;
    return row?.value || 'en';
  } catch {
    return 'en';
  }
}

function tenantSettingValue(db: ReturnType<typeof getDatabase>, key: string): string | undefined {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value?: string } | undefined;
    return row?.value;
  } catch {
    return undefined;
  }
}

function resolveTenantKotLanguage(db: ReturnType<typeof getDatabase>): string {
  const policy = parseStoredLanguagePolicy(
    KOT_LANGUAGE_POLICY_KEY,
    tenantSettingValue(db, KOT_LANGUAGE_POLICY_KEY),
  ) as KotLanguagePolicy;
  return resolveKotLanguage(policy, tenantLanguage(db));
}

function hardwarePrinter(db: any): any | undefined {
  return db.prepare(
    `SELECT * FROM printers
     WHERE connection_type != 'webusb'
     ORDER BY is_default DESC, name
     LIMIT 1`,
  ).get();
}

function attachTable(db: any, order: any): void {
  if (!order?.table_id) return;
  const table: any = db.prepare('SELECT * FROM tables WHERE id = ?').get(order.table_id);
  if (table) order.table = { name: table.number };
}

export async function printKotTickets(args: PrintKotTicketsArgs): Promise<KotPrintTicketResult> {
  const warnings: KotPrintTicketResult['warnings'] = [];
  const stations: string[] = [];
  if (!isKotPrintingEnabled()) {
    return { ok: false, skipped: true, reason: 'kot_disabled', warnings, failure: null, stations };
  }

  const db = getDatabase();
  const order: any = db.prepare('SELECT * FROM orders WHERE id = ?').get(args.orderId);
  if (!order) {
    return { ok: false, reason: 'order_not_found', warnings, failure: null, stations };
  }

  attachTable(db, order);
  const kotLanguage = resolveTenantKotLanguage(db);
  const orderItems = getEffectiveOrderItems(db, args.orderId);
  const kotSourceItems = Array.isArray(args.items) ? args.items : orderItems;
  const useUnicode = args.useUnicode === true;
  const arabicShaping = typeof args.arabicShaping === 'boolean' ? args.arabicShaping : undefined;

  let success = true;
  let failure: KotPrintTicketResult['failure'] = null;

  if (args.stationName) {
    const kotItems = args.items || orderItems;
    const station = args.stationName || 'Kitchen';
    stations.push(station);
    const result = await thermal.printKOTDetailed(order, kotItems, station, useUnicode, undefined, args.signal, arabicShaping, kotLanguage);
    success = result.ok;
    failure = result.ok ? null : result;
    warnings.push(...(result.warnings || []));
  } else {
    const groups = routeItemsToStations(db, kotSourceItems).filter((g) => g.items.length > 0);
    if (groups.length === 0) {
      return { ok: true, skipped: true, reason: 'no_printable_items', warnings, failure: null, stations };
    }
    for (const group of groups) {
      stations.push(group.stationName);
      const result = await thermal.printKOTDetailed(
        order,
        group.items,
        group.stationName,
        useUnicode,
        group.printer || undefined,
        args.signal,
        arabicShaping,
        kotLanguage,
      );
      success = success && result.ok;
      warnings.push(...(result.warnings || []));
      if (!result.ok && !failure) failure = result;
    }
  }

  return { ok: success, warnings, failure, stations };
}

async function autoPrintKotImpl(orderId: string | number, items?: any[]): Promise<KotPrintTicketResult> {
  const empty: KotPrintTicketResult = { ok: true, skipped: true, warnings: [], failure: null, stations: [] };
  if (!isKotPrintingEnabled()) return { ...empty, reason: 'kot_disabled' };
  if (!isAutoPrintKotEnabled()) return { ...empty, reason: 'auto_print_off' };

  const db = getDatabase();
  if (!hardwarePrinter(db)) return { ...empty, reason: 'no_hardware_printer' };

  console.log('[KOT] auto-print', orderId, items ? `${items.length} items` : 'all items');
  return printKotTickets({ orderId, items });
}

/**
 * Fire-and-forget KOT after order create/append. Print lives on the till so
 * waiter-phone orders still reach USB/LAN kitchen and bar printers.
 * Failures are logged and never fail the order.
 */
export function maybeAutoPrintKot(orderId: string | number, items?: any[]): void {
  const job = autoPrintKotImpl(orderId, items).catch((error) => {
    console.error('[KOT] auto-print failed:', error);
    return {
      ok: false,
      reason: 'exception',
      warnings: [],
      failure: null,
      stations: [],
    } satisfies KotPrintTicketResult;
  });
  autoPrintTail = autoPrintTail.then(() => job, () => job);
}

export function waitForKotAutoPrint(): Promise<unknown> {
  return autoPrintTail;
}

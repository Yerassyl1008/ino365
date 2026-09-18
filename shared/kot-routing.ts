/**
 * Pure kitchen/bar ticket grouping. Stations come from kitchen_stations;
 * this module only splits items. Skip categories (tobacco, etc.) never
 * appear on a ticket. Unmatched categories default to a Kitchen fallback
 * when at least one printable item remains.
 */

export type KotRouteStation = {
  id: string;
  name: string;
  categoryIds: string[];
  printer: unknown;
};

export type KotItemGroup<T> = {
  stationName: string;
  printer: unknown;
  items: T[];
};

export function isSkipKotCategory(
  categoryId: string | null | undefined,
  skipCategoryIds: readonly string[],
): boolean {
  return !!categoryId && skipCategoryIds.includes(categoryId);
}

export function groupItemsByKitchenStations<T>(
  items: T[],
  resolveCategoryId: (item: T) => string | null | undefined,
  stations: KotRouteStation[],
  skipCategoryIds: readonly string[] = [],
  fallbackStationName = 'Kitchen',
): KotItemGroup<T>[] {
  const printable = items.filter((item) => !isSkipKotCategory(resolveCategoryId(item), skipCategoryIds));

  if (printable.length === 0) return [];

  if (stations.length === 0) {
    return [{ stationName: fallbackStationName, printer: null, items: printable }];
  }

  const groups = new Map<string, KotItemGroup<T>>();
  const unrouted: T[] = [];

  for (const item of printable) {
    const categoryId = resolveCategoryId(item);
    const matched = categoryId ? stations.find((station) => station.categoryIds.includes(categoryId)) : undefined;
    if (matched) {
      let group = groups.get(matched.id);
      if (!group) {
        group = { stationName: matched.name, printer: matched.printer, items: [] };
        groups.set(matched.id, group);
      }
      group.items.push(item);
    } else {
      unrouted.push(item);
    }
  }

  const result = Array.from(groups.values());
  if (unrouted.length > 0) {
    result.push({ stationName: fallbackStationName, printer: null, items: unrouted });
  }
  return result;
}

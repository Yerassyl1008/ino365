'use client';

import api from '@/lib/api';
import { Pencil, Trash2, AlertTriangle } from 'lucide-react';
import type { Product, Category } from '@/lib/types';
import TagBadge from '@/components/pos/DietaryBadge';
import { parseDbTimestamp } from '@/lib/utils';
import { nameToColor } from '@/lib/image-utils';
import { useTranslations } from 'use-intl';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import DishPrice from '@/components/pos/DishPrice';
import { visibleDishPrices } from '@shared/dish-discount';

const MENU_TABLE_WRAP = '@container bg-card rounded-xl border border-border overflow-x-auto';
const MENU_TH = 'px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase whitespace-nowrap';
const MENU_TD = 'px-3 py-2.5';
const MENU_COL_ADDONS = 'hidden @min-[900px]:table-cell';
const MENU_COL_SECONDARY = 'hidden @min-[1200px]:table-cell';
const MENU_ACTIONS_TH = `${MENU_TH} sticky end-0 z-20 bg-muted text-end min-w-24 border-s border-border`;
const MENU_ACTIONS_TD = `${MENU_TD} sticky end-0 z-10 bg-card group-hover:bg-muted text-end whitespace-nowrap min-w-24 border-s border-border`;

function taxCategoryOptionLabel(tc: { label: string; rate_percent?: number | null }): string {
  return tc.rate_percent != null ? `${tc.label} (${tc.rate_percent}%)` : tc.label;
}

export function productBelongsToCategory(product: Product, categoryId: string): boolean {
  return String(product.category_id || product.category?.id || '') === String(categoryId);
}

export default function MenuProductTable({
  products,
  categories,
  taxCategories,
  loyaltyEnabled,
  globalCashbackPercent,
  isOwnerOrManager,
  hideCategory = false,
  emptyMessage,
  onEdit,
  onDelete,
}: {
  products: Product[];
  categories: Category[];
  taxCategories: { id: string; label: string; rate_percent?: number | null }[];
  loyaltyEnabled: boolean;
  globalCashbackPercent: number;
  isOwnerOrManager: boolean;
  hideCategory?: boolean;
  emptyMessage: string;
  onEdit: (product: Product) => void;
  onDelete: (id: string) => void;
}) {
  const t = useTranslations('products');
  const tCommon = useTranslations('common');
  const tPos = useTranslations('pos');
  const fmt = useFormatCurrency();

  return (
    <div className={MENU_TABLE_WRAP}>
      <table className="w-max min-w-full">
        <thead className="bg-muted">
          <tr>
            <th className={`${MENU_TH} text-start`}>{t('columnProduct')}</th>
            {!hideCategory && <th className={`${MENU_TH} text-start`}>{t('columnCategory')}</th>}
            <th className={`${MENU_TH} text-center ${MENU_COL_ADDONS}`}>{t('columnAddons')}</th>
            <th className={`${MENU_TH} text-end`}>{t('columnPrice')}</th>
            <th className={`${MENU_TH} text-start ${MENU_COL_SECONDARY}`}>{t('columnTax')}</th>
            {loyaltyEnabled && <th className={`${MENU_TH} text-start ${MENU_COL_SECONDARY}`}>{t('columnCashback')}</th>}
            <th className={`${MENU_TH} text-center ${MENU_COL_SECONDARY}`}>{t('columnStock')}</th>
            <th className={`${MENU_TH} text-center`}>{t('columnStatus')}</th>
            <th className={MENU_ACTIONS_TH}>{t('columnActions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {products.map((product) => {
            const parentCat = categories.find((c) => String(c.id) === String(product.category_id || product.category?.id));
            const isCategoryInactive = Boolean(parentCat && !parentCat.is_active);
            const matchedTaxCategory = taxCategories.find((tc) => tc.id === product.tax_category_id);
            const taxLabel = product.tax_category_id
              ? (matchedTaxCategory ? taxCategoryOptionLabel(matchedTaxCategory) : product.tax_category_id)
              : '—';
            const prices = visibleDishPrices(product);
            return (
              <tr key={product.id} className="group hover:bg-muted">
                <td className={`${MENU_TD} max-w-[220px]`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 relative flex items-center justify-center">
                      <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{ backgroundColor: nameToColor(product.name) }}
                      >
                        <span className="text-sm font-bold text-white/80">
                          {product.name.substring(0, 2).toUpperCase()}
                        </span>
                      </div>
                      {product.has_image && (
                        <img
                          src={`${api.defaults.baseURL}/products/${product.id}/image?t=${product.updated_at ? parseDbTimestamp(product.updated_at).getTime() : 0}`}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{product.name}</p>
                      {product.sku && <p className="text-xs text-gray-400 mt-0.5">{t('skuLabel', { sku: product.sku })}</p>}
                      {product.barcode && <p className="text-xs text-gray-400 mt-0.5 font-mono">{t('barcodeLabel', { barcode: product.barcode })}</p>}
                      {product.tags && product.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {product.tags.map((tag: string) => <TagBadge key={tag} tag={tag} />)}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                {!hideCategory && (
                  <td className={`${MENU_TD} text-sm text-muted-foreground`}>
                    <div className="flex flex-col gap-0.5">
                      <span>{product.category?.name || '—'}</span>
                      {isCategoryInactive && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 w-fit" title="Parent category is inactive; product is hidden on POS">
                          <AlertTriangle size={11} className="shrink-0" /> {t('categoryInactiveBadge')}
                        </span>
                      )}
                    </div>
                  </td>
                )}
                <td className={`${MENU_TD} text-center ${MENU_COL_ADDONS}`}>
                  {product.addon_groups && product.addon_groups.length > 0 ? (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {t('addonGroupCount', { count: product.addon_groups.length })}
                    </span>
                  ) : (
                    <span className="text-gray-400 text-sm">—</span>
                  )}
                </td>
                <td className={`${MENU_TD} text-end whitespace-nowrap`}>
                  <p className="font-medium">
                    <DishPrice
                      original={prices.original}
                      discounted={prices.discounted}
                      className="font-medium text-foreground"
                    />
                  </p>
                  {product.cost_price != null && product.cost_price > 0 && <p className="text-xs text-gray-400">{t('costLabel', { value: fmt(Number(product.cost_price)) })}</p>}
                </td>
                <td className={`${MENU_TD} text-sm text-muted-foreground ${MENU_COL_SECONDARY}`}>
                  <div className="flex flex-col gap-0.5">
                    <span>{taxLabel}</span>
                    {!product.tax_category_id && taxCategories.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 w-fit" title={t('notTaxedTooltip')}>
                        <AlertTriangle size={11} className="shrink-0" /> {t('notTaxedBadge')}
                      </span>
                    )}
                  </div>
                </td>
                {loyaltyEnabled && (
                  <td className={`${MENU_TD} text-sm text-muted-foreground whitespace-nowrap ${MENU_COL_SECONDARY}`}>
                    {product.cb_percent === null || product.cb_percent === undefined ? (
                      <span>{globalCashbackPercent}% <span className="text-gray-400 text-xs">({t('cashbackGlobalBadge')})</span></span>
                    ) : product.cb_percent === 0 ? (
                      <span className="text-gray-400">0%</span>
                    ) : (
                      <span>{product.cb_percent}%</span>
                    )}
                  </td>
                )}
                <td className={`${MENU_TD} text-center ${MENU_COL_SECONDARY}`}>
                  {product.track_inventory ? (
                    <span className={`text-sm font-medium ${product.stock_quantity <= (product.low_stock_threshold || 0) ? 'text-red-600' : 'text-foreground'}`}>
                      {product.stock_quantity <= 0 ? tPos('outOfStock') : product.stock_quantity}
                    </span>
                  ) : (
                    <span className="text-gray-400 text-sm">—</span>
                  )}
                </td>
                <td className={`${MENU_TD} text-center`}>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    product.is_active ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground'
                  }`}>
                    {product.is_active ? tCommon('active') : tCommon('inactive')}
                  </span>
                  {product.is_active && isCategoryInactive && (
                    <span className="text-[10px] text-amber-600 font-medium block mt-1">{t('hiddenOnPos')}</span>
                  )}
                </td>
                <td className={MENU_ACTIONS_TD}>
                  <div className="flex gap-1 justify-end">
                    {isOwnerOrManager && (
                      <>
                        <button type="button" onClick={() => onEdit(product)} className="p-1.5 text-gray-400 hover:text-brand">
                          <Pencil size={16} />
                        </button>
                        <button type="button" onClick={() => onDelete(product.id)} className="p-1.5 text-gray-400 hover:text-red-600">
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {products.length === 0 && (
        <p className="text-center text-muted-foreground py-12">{emptyMessage}</p>
      )}
    </div>
  );
}

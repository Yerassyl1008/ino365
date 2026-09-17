'use client';

import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';
import { AlertTriangle, Boxes, Search, X } from 'lucide-react';
import type { Product } from '@/lib/types';
import { useTranslations, type AppConfig } from 'use-intl';
import { useRestrictBusinessType } from '@/components/layout/AuthGuard';
import axios from 'axios';

type StockAction = 'receive' | 'waste' | 'count';
type StockKey = keyof AppConfig['Messages']['stock'];

const ACTION_KEYS: Record<StockAction, StockKey> = {
  receive: 'receive',
  waste: 'waste',
  count: 'countStock',
};

function isLow(product: Product): boolean {
  if (!product.track_inventory || !product.is_active) return false;
  const threshold = product.low_stock_threshold ?? 0;
  return product.stock_quantity <= threshold;
}

export default function StockPage() {
  const allowed = useRestrictBusinessType('retail', '/warehouse');
  const t = useTranslations('stock');
  const tCommon = useTranslations('common');

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [stockTarget, setStockTarget] = useState<Product | null>(null);
  const [stockAction, setStockAction] = useState<StockAction>('receive');
  const [stockQty, setStockQty] = useState('');

  const loadProducts = async () => {
    const { data } = await api.get('/products');
    setProducts((data.products || []) as Product[]);
  };

  const refresh = async () => {
    try {
      await loadProducts();
    } catch {
      toast.error(t('failedToLoad'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!allowed) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((product) => {
      const haystack = [product.name, product.barcode, product.sku].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [products, query]);

  const lowStock = products.filter(isLow);

  const handleStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockTarget) return;
    const quantity = Number(stockQty);
    if (!Number.isFinite(quantity) || quantity < 0) {
      toast.error(t('invalidQuantity'));
      return;
    }
    const action = stockAction === 'receive' ? 'increase' : stockAction === 'waste' ? 'decrease' : 'set';
    try {
      await api.post(`/products/${stockTarget.id}/stock`, { action, quantity });
      toast.success(t('stockUpdated'));
      setStockTarget(null);
      setStockQty('');
      await loadProducts();
    } catch (error: unknown) {
      const message = axios.isAxiosError(error) && typeof error.response?.data?.error === 'string'
        ? error.response.data.error
        : t('saveFailed');
      toast.error(message === 'Insufficient stock' ? t('insufficientStock') : t('saveFailed'));
    }
  };

  const openStock = (product: Product, action: StockAction) => {
    setStockTarget(product);
    setStockAction(action);
    setStockQty(action === 'count' ? String(product.stock_quantity ?? 0) : '');
  };

  if (!allowed) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Boxes size={22} />
            {t('title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full ps-9 pe-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-brand bg-card"
          />
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{t('lowStockBanner', { count: lowStock.length })}</span>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">{tCommon('loading')}</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{query.trim() ? t('emptySearch') : t('empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">{t('product')}</th>
                <th className="px-3 py-2 font-medium">{t('barcode')}</th>
                <th className="px-3 py-2 font-medium">{t('onHand')}</th>
                <th className="px-3 py-2 font-medium">{t('minStock')}</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => (
                <tr key={product.id} className={`border-t border-border ${product.is_active ? '' : 'opacity-50'}`}>
                  <td className="px-3 py-2">
                    {product.name}
                    {isLow(product) && (
                      <span className="ms-2 text-xs text-amber-700 dark:text-amber-300">{t('lowStock')}</span>
                    )}
                    {!product.track_inventory && (
                      <span className="ms-2 text-xs text-muted-foreground">{t('notTracked')}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{product.barcode || '—'}</td>
                  <td className="px-3 py-2 font-mono">{product.track_inventory ? product.stock_quantity : '—'}</td>
                  <td className="px-3 py-2 font-mono">{product.track_inventory ? (product.low_stock_threshold ?? 0) : '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-end">
                    {product.track_inventory && product.is_active && (
                      <>
                        <button type="button" className="text-xs text-brand me-2" onClick={() => openStock(product, 'receive')}>
                          {t('receive')}
                        </button>
                        <button type="button" className="text-xs text-brand me-2" onClick={() => openStock(product, 'waste')}>
                          {t('waste')}
                        </button>
                        <button type="button" className="text-xs text-brand" onClick={() => openStock(product, 'count')}>
                          {t('countStock')}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {stockTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl w-full max-w-md p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">
                {t(ACTION_KEYS[stockAction])} — {stockTarget.name}
              </h2>
              <button type="button" onClick={() => setStockTarget(null)}><X size={18} /></button>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('currentStock', { quantity: stockTarget.stock_quantity })}
            </p>
            <form onSubmit={handleStock} className="space-y-3">
              <div>
                <label className="block text-sm mb-1">{t('fieldQuantity')}</label>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={stockQty}
                  onChange={(e) => setStockQty(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setStockTarget(null)}>{tCommon('cancel')}</Button>
                <Button type="submit">{tCommon('save')}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

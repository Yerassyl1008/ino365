'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import toast from 'react-hot-toast';
import { Search } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import type { Ingredient } from '@/lib/types';
import { unitLabel } from '@/components/warehouse/RecipeEditor';

function qtyKey(value: number): string {
  return String(value);
}

export default function StockCountList({
  ingredients,
  onSaved,
}: {
  ingredients: Ingredient[];
  onSaved: () => Promise<void> | void;
}) {
  const t = useTranslations('warehouse');
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const active = useMemo(
    () => ingredients.filter((ingredient) => ingredient.is_active),
    [ingredients],
  );

  useEffect(() => {
    setDrafts((previous) => {
      const next: Record<string, string> = {};
      for (const ingredient of active) {
        next[ingredient.id] = Object.prototype.hasOwnProperty.call(previous, ingredient.id)
          ? previous[ingredient.id]
          : qtyKey(ingredient.stock_quantity);
      }
      return next;
    });
  }, [active]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return active;
    return active.filter((ingredient) => ingredient.name.toLowerCase().includes(needle));
  }, [active, query]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const items: Array<{ ingredient_id: string; quantity: number }> = [];
    for (const ingredient of active) {
      const raw = (drafts[ingredient.id] ?? '').trim();
      if (!raw) continue;
      const quantity = Number(raw.replace(',', '.'));
      if (!Number.isFinite(quantity) || quantity < 0) {
        toast.error(t('countInvalid', { name: ingredient.name }));
        return;
      }
      items.push({ ingredient_id: ingredient.id, quantity });
    }

    setSaving(true);
    try {
      const { data } = await api.post('/warehouse/count', {
        items,
        note: note.trim() || undefined,
      });
      const counted = Number(data?.counted) || 0;
      toast.success(counted > 0 ? t('countSaved', { counted }) : t('countUnchanged'));
      setNote('');
      setDrafts({});
      await onSaved();
    } catch {
      toast.error(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (active.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('emptyIngredients')}</p>;
  }

  return (
    <form onSubmit={handleSave} className="space-y-3">
      <p className="text-sm text-muted-foreground">{t('countHint')}</p>
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchIngredients')}
            className="w-full ps-9 pe-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-brand bg-card"
          />
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('note')}
          className="flex-1 min-w-[10rem] px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-brand bg-card"
        />
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">{t('ingredient')}</th>
              <th className="px-3 py-2 font-medium">{t('onHand')}</th>
              <th className="px-3 py-2 font-medium">{t('countedQty')}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((ingredient) => (
              <tr key={ingredient.id} className="border-t border-border">
                <td className="px-3 py-2">
                  {ingredient.name}
                  {ingredient.is_low && (
                    <span className="ms-2 text-xs text-amber-700 dark:text-amber-300">{t('lowStock')}</span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono whitespace-nowrap">
                  {ingredient.stock_quantity} {unitLabel(ingredient.unit, t)}
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    aria-label={t('countedQty')}
                    placeholder={t('leaveAsIs')}
                    value={drafts[ingredient.id] ?? ''}
                    onChange={(e) => setDrafts((current) => ({ ...current, [ingredient.id]: e.target.value }))}
                    className="w-28 px-2 py-1.5 border border-border rounded-md outline-none focus:ring-2 focus:ring-brand bg-card font-mono"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visible.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('emptyCountSearch')}</p>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>{t('saveCount')}</Button>
      </div>
    </form>
  );
}

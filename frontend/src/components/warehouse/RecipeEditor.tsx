'use client';

import { useTranslations, type AppConfig } from 'use-intl';
import { Plus, Trash2 } from 'lucide-react';
import type { Ingredient, IngredientUnit } from '@/lib/types';

type WarehouseKey = keyof AppConfig['Messages']['warehouse'];

export type RecipeLineDraft = { ingredient_id: string; quantity: string };

const UNIT_KEYS: Record<IngredientUnit, WarehouseKey> = {
  g: 'unitG',
  kg: 'unitKg',
  ml: 'unitMl',
  l: 'unitL',
  pcs: 'unitPcs',
};

export function unitLabel(unit: IngredientUnit, t: (key: WarehouseKey) => string): string {
  return t(UNIT_KEYS[unit] ?? 'unitG');
}

export default function RecipeEditor({
  ingredients,
  lines,
  onChange,
}: {
  ingredients: Ingredient[];
  lines: RecipeLineDraft[];
  onChange: (lines: RecipeLineDraft[]) => void;
}) {
  const t = useTranslations('warehouse');
  const active = ingredients.filter((ingredient) => ingredient.is_active);
  const used = new Set(lines.map((line) => line.ingredient_id));

  const updateLine = (index: number, patch: Partial<RecipeLineDraft>) => {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  return (
    <div className="space-y-2">
      {lines.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('recipeEmpty')}</p>
      )}
      {lines.map((line, index) => {
        const selected = ingredients.find((ingredient) => ingredient.id === line.ingredient_id);
        return (
          <div key={`${line.ingredient_id}-${index}`} className="flex items-center gap-2">
            <select
              value={line.ingredient_id}
              onChange={(e) => updateLine(index, { ingredient_id: e.target.value })}
              className="flex-1 px-3 py-2 border border-border rounded-lg bg-background outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="">{t('selectIngredient')}</option>
              {active.map((ingredient) => (
                <option
                  key={ingredient.id}
                  value={ingredient.id}
                  disabled={used.has(ingredient.id) && ingredient.id !== line.ingredient_id}
                >
                  {ingredient.name} ({unitLabel(ingredient.unit, t)})
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              value={line.quantity}
              onChange={(e) => updateLine(index, { quantity: e.target.value })}
              placeholder={t('perPortion')}
              className="w-28 px-3 py-2 border border-border rounded-lg bg-background outline-none focus:ring-2 focus:ring-brand"
            />
            <span className="w-10 text-xs text-muted-foreground">
              {selected ? unitLabel(selected.unit, t) : ''}
            </span>
            <button
              type="button"
              onClick={() => onChange(lines.filter((_, i) => i !== index))}
              className="p-2 text-gray-400 hover:text-red-500"
              aria-label={t('removeLine')}
            >
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange([...lines, { ingredient_id: '', quantity: '' }])}
        className="inline-flex items-center gap-1 text-sm text-brand hover:text-brand-hover"
      >
        <Plus size={14} />
        {t('addLine')}
      </button>
    </div>
  );
}

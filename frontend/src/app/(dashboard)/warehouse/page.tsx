'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';
import { AlertTriangle, Pencil, Plus, Trash2, X, Warehouse } from 'lucide-react';
import type { Ingredient, IngredientUnit, StockMovement, WarehouseProductRecipe } from '@/lib/types';
import { useTranslations, type AppConfig } from 'use-intl';
import { useConfirm } from '@/hooks/use-confirm';
import RecipeEditor, { type RecipeLineDraft, unitLabel } from '@/components/warehouse/RecipeEditor';
import { useRestrictBusinessType } from '@/components/layout/AuthGuard';

type Tab = 'ingredients' | 'recipes' | 'movements';
type WarehouseKey = keyof AppConfig['Messages']['warehouse'];
type StockAction = 'receive' | 'waste' | 'count';

const UNITS: IngredientUnit[] = ['g', 'kg', 'ml', 'l', 'pcs'];

const REASON_KEYS: Record<StockMovement['reason'], WarehouseKey> = {
  sale: 'reasonSale',
  cancel: 'reasonCancel',
  restore: 'reasonRestore',
  receive: 'reasonReceive',
  waste: 'reasonWaste',
  count: 'reasonCount',
  adjustment: 'reasonAdjustment',
};

export default function WarehousePage() {
  const allowed = useRestrictBusinessType('restaurant', '/stock');
  const t = useTranslations('warehouse');
  const tCommon = useTranslations('common');
  const { confirm, ConfirmDialog } = useConfirm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: Tab = tabParam === 'recipes' || tabParam === 'movements' || tabParam === 'ingredients'
    ? tabParam
    : 'ingredients';

  const setTab = (next: Tab) => {
    router.replace(`/warehouse?tab=${next}`);
  };
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<WarehouseProductRecipe[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [form, setForm] = useState({
    name: '',
    unit: 'g' as IngredientUnit,
    stock_quantity: '0',
    low_stock_threshold: '0',
    cost_per_unit: '0',
  });
  const [stockTarget, setStockTarget] = useState<Ingredient | null>(null);
  const [stockAction, setStockAction] = useState<StockAction>('receive');
  const [stockQty, setStockQty] = useState('');
  const [stockNote, setStockNote] = useState('');
  const [recipeProduct, setRecipeProduct] = useState<WarehouseProductRecipe | null>(null);
  const [recipeLines, setRecipeLines] = useState<RecipeLineDraft[]>([]);
  const [seeding, setSeeding] = useState(false);

  const lowStock = ingredients.filter((ingredient) => ingredient.is_active && ingredient.is_low);

  const loadIngredients = async () => {
    const { data } = await api.get('/warehouse/ingredients');
    setIngredients(data.ingredients || []);
  };

  const loadRecipes = async () => {
    const { data } = await api.get('/warehouse/recipes');
    setRecipes(data.products || []);
  };

  const loadMovements = async () => {
    const { data } = await api.get('/warehouse/movements');
    setMovements(data.movements || []);
  };

  const refresh = async () => {
    try {
      await Promise.all([loadIngredients(), loadRecipes(), loadMovements()]);
    } catch {
      toast.error(t('failedToLoad'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setForm({ name: '', unit: 'g', stock_quantity: '0', low_stock_threshold: '0', cost_per_unit: '0' });
    setEditing(null);
    setShowForm(false);
  };

  const openEdit = (ingredient: Ingredient) => {
    setEditing(ingredient);
    setForm({
      name: ingredient.name,
      unit: ingredient.unit,
      stock_quantity: String(ingredient.stock_quantity),
      low_stock_threshold: String(ingredient.low_stock_threshold),
      cost_per_unit: String(ingredient.cost_per_unit),
    });
    setShowForm(true);
  };

  const handleSaveIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await api.put(`/warehouse/ingredients/${editing.id}`, {
          name: form.name,
          unit: form.unit,
          low_stock_threshold: Number(form.low_stock_threshold),
          cost_per_unit: Number(form.cost_per_unit),
        });
        toast.success(t('updated'));
      } else {
        await api.post('/warehouse/ingredients', {
          name: form.name,
          unit: form.unit,
          stock_quantity: Number(form.stock_quantity),
          low_stock_threshold: Number(form.low_stock_threshold),
          cost_per_unit: Number(form.cost_per_unit),
        });
        toast.success(t('created'));
      }
      resetForm();
      await loadIngredients();
    } catch {
      toast.error(t('saveFailed'));
    }
  };

  const handleDelete = async (ingredient: Ingredient) => {
    const ok = await confirm(t('confirmDeleteIngredient', { name: ingredient.name }), {
      title: t('deleteTitle'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/warehouse/ingredients/${ingredient.id}`);
      toast.success(t('deleted'));
      await loadIngredients();
    } catch {
      toast.error(t('deleteFailed'));
    }
  };

  const handleStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockTarget) return;
    try {
      await api.post(`/warehouse/ingredients/${stockTarget.id}/${stockAction}`, {
        quantity: Number(stockQty),
        note: stockNote || undefined,
      });
      toast.success(t('stockUpdated'));
      setStockTarget(null);
      setStockQty('');
      setStockNote('');
      await Promise.all([loadIngredients(), loadMovements()]);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || t('saveFailed'));
    }
  };

  const openRecipe = (product: WarehouseProductRecipe) => {
    setRecipeProduct(product);
    setRecipeLines(
      (product.recipe || []).map((line) => ({
        ingredient_id: line.ingredient_id,
        quantity: String(line.quantity),
      })),
    );
  };

  const saveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipeProduct) return;
    try {
      await api.put(`/warehouse/recipes/${recipeProduct.id}`, {
        items: recipeLines
          .filter((line) => line.ingredient_id && Number(line.quantity) > 0)
          .map((line) => ({ ingredient_id: line.ingredient_id, quantity: Number(line.quantity) })),
      });
      toast.success(t('recipeSaved'));
      setRecipeProduct(null);
      await loadRecipes();
    } catch {
      toast.error(t('saveFailed'));
    }
  };

  const seedMenu = async () => {
    const ok = await confirm(t('seedMenuHint'), { title: t('seedConfirmTitle') });
    if (!ok) return;
    setSeeding(true);
    try {
      await api.post('/warehouse/seed-shashlik');
      toast.success(t('seedSuccess'));
      await refresh();
    } catch {
      toast.error(t('saveFailed'));
    } finally {
      setSeeding(false);
    }
  };

  const tabs: Array<{ id: Tab; label: WarehouseKey }> = [
    { id: 'ingredients', label: 'tabIngredients' },
    { id: 'recipes', label: 'tabRecipes' },
    { id: 'movements', label: 'tabMovements' },
  ];

  if (!allowed) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Warehouse size={22} />
            {t('title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={seedMenu} disabled={seeding}>
            {t('seedMenu')}
          </Button>
          {tab === 'ingredients' && (
            <Button onClick={() => { resetForm(); setShowForm(true); }}>
              <Plus size={16} className="me-1" />
              {t('newIngredient')}
            </Button>
          )}
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{t('lowStockBanner', { count: lowStock.length })}</span>
        </div>
      )}

      <div className="flex gap-2 border-b border-border">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === item.id ? 'border-brand text-brand' : 'border-transparent text-muted-foreground'
            }`}
          >
            {t(item.label)}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{tCommon('loading')}</p>
      ) : tab === 'ingredients' ? (
        ingredients.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('emptyIngredients')}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">{t('ingredient')}</th>
                  <th className="px-3 py-2 font-medium">{t('onHand')}</th>
                  <th className="px-3 py-2 font-medium">{t('minStock')}</th>
                  <th className="px-3 py-2 font-medium">{t('costPerUnit')}</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {ingredients.map((ingredient) => (
                  <tr key={ingredient.id} className={`border-t border-border ${ingredient.is_active ? '' : 'opacity-50'}`}>
                    <td className="px-3 py-2">
                      {ingredient.name}
                      {ingredient.is_low && ingredient.is_active && (
                        <span className="ms-2 text-xs text-amber-700 dark:text-amber-300">{t('lowStock')}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono">
                      {ingredient.stock_quantity} {unitLabel(ingredient.unit, t)}
                    </td>
                    <td className="px-3 py-2 font-mono">{ingredient.low_stock_threshold}</td>
                    <td className="px-3 py-2 font-mono">{ingredient.cost_per_unit}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-end">
                      <button type="button" className="text-xs text-brand me-2" onClick={() => { setStockTarget(ingredient); setStockAction('receive'); }}>
                        {t('receive')}
                      </button>
                      <button type="button" className="text-xs text-brand me-2" onClick={() => { setStockTarget(ingredient); setStockAction('waste'); }}>
                        {t('waste')}
                      </button>
                      <button type="button" className="text-xs text-brand me-2" onClick={() => { setStockTarget(ingredient); setStockAction('count'); }}>
                        {t('countStock')}
                      </button>
                      <button type="button" className="p-1.5 text-gray-400 hover:text-brand" onClick={() => openEdit(ingredient)}>
                        <Pencil size={16} />
                      </button>
                      <button type="button" className="p-1.5 text-gray-400 hover:text-red-500" onClick={() => handleDelete(ingredient)}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : tab === 'recipes' ? (
        recipes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('emptyRecipes')}</p>
        ) : (
          <div className="space-y-2">
            {recipes.map((product) => (
              <div key={product.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{product.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {product.recipe?.length
                        ? product.recipe.map((line) => `${line.ingredient_name} ${line.quantity}${line.unit ? ` ${unitLabel(line.unit, t)}` : ''}`).join(' · ')
                        : t('noRecipe')}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => openRecipe(product)}>
                    {t('techCard')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : movements.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('emptyMovements')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">{t('ingredient')}</th>
                <th className="px-3 py-2 font-medium">{t('fieldQuantity')}</th>
                <th className="px-3 py-2 font-medium">{t('reason')}</th>
                <th className="px-3 py-2 font-medium">{t('note')}</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id} className="border-t border-border">
                  <td className="px-3 py-2">{movement.ingredient_name}</td>
                  <td className={`px-3 py-2 font-mono ${movement.quantity < 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {movement.quantity > 0 ? '+' : ''}{movement.quantity} {movement.unit ? unitLabel(movement.unit, t) : ''}
                  </td>
                  <td className="px-3 py-2">{t(REASON_KEYS[movement.reason])}</td>
                  <td className="px-3 py-2 text-muted-foreground">{movement.note || movement.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl w-full max-w-md p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{editing ? t('editIngredient') : t('newIngredient')}</h2>
              <button type="button" onClick={resetForm}><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveIngredient} className="space-y-3">
              <div>
                <label className="block text-sm mb-1">{t('fieldName')}</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">{t('fieldUnit')}</label>
                <select
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value as IngredientUnit })}
                  className="w-full px-3 py-2 border border-border rounded-lg outline-none focus:ring-2 focus:ring-brand"
                >
                  {UNITS.map((unit) => (
                    <option key={unit} value={unit}>{unitLabel(unit, t)}</option>
                  ))}
                </select>
              </div>
              {!editing && (
                <div>
                  <label className="block text-sm mb-1">{t('onHand')}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.stock_quantity}
                    onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1">{t('minStock')}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.low_stock_threshold}
                    onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">{t('costPerUnit')}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.cost_per_unit}
                    onChange={(e) => setForm({ ...form, cost_per_unit: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>{tCommon('cancel')}</Button>
                <Button type="submit">{tCommon('save')}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {stockTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl w-full max-w-md p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">
                {stockAction === 'receive' ? t('receive') : stockAction === 'waste' ? t('waste') : t('countStock')} — {stockTarget.name}
              </h2>
              <button type="button" onClick={() => setStockTarget(null)}><X size={18} /></button>
            </div>
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
              <div>
                <label className="block text-sm mb-1">{t('note')}</label>
                <input
                  value={stockNote}
                  onChange={(e) => setStockNote(e.target.value)}
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

      {recipeProduct && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl w-full max-w-lg p-4 space-y-4 max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{t('techCard')} — {recipeProduct.name}</h2>
              <button type="button" onClick={() => setRecipeProduct(null)}><X size={18} /></button>
            </div>
            <p className="text-sm text-muted-foreground">{t('recipeHint')}</p>
            <form onSubmit={saveRecipe} className="space-y-3">
              <RecipeEditor ingredients={ingredients} lines={recipeLines} onChange={setRecipeLines} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setRecipeProduct(null)}>{tCommon('cancel')}</Button>
                <Button type="submit">{t('saveRecipe')}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {ConfirmDialog}
    </div>
  );
}

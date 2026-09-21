'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, X, Package, Folder, Puzzle, FileSpreadsheet, Download, Upload, CheckCircle, AlertCircle, AlertTriangle, ArrowLeft, ChevronRight } from 'lucide-react';
import type { Product, Category, AddonGroup, Ingredient } from '@/lib/types';
import { tagLabel } from '@/components/pos/DietaryBadge';
import ImageUploader from '@/components/products/ImageUploader';
import { PdfMenuImportButton } from '@/components/products/PdfMenuImportModal';
import MenuProductTable, { productBelongsToCategory } from '@/components/products/MenuProductTable';
import { getCurrencySymbol, getCountryByCode, resolveDisplayCurrency } from '@/lib/countries';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import { useConfirm } from '@/hooks/use-confirm';
import { useTranslations, type AppConfig } from 'use-intl';
import { ROLE_ACCESS, hasRole } from '@shared/role-permissions';
import RecipeEditor, { type RecipeLineDraft } from '@/components/warehouse/RecipeEditor';
import DishPrice from '@/components/pos/DishPrice';
import { ALL_ORDER_TYPES, visibleDishPrices, type OrderType } from '@shared/dish-discount';

type PosKey = keyof AppConfig['Messages']['pos'];
type ProductsKey = keyof AppConfig['Messages']['products'];

const PRESET_TAGS: { key: string; labelKey: PosKey }[] = [
  { key: 'veg', labelKey: 'tagVeg' },
  { key: 'non_veg', labelKey: 'tagNonVeg' },
  { key: 'vegan', labelKey: 'tagVegan' },
  { key: 'egg', labelKey: 'tagEgg' },
  { key: 'spicy', labelKey: 'tagSpicy' },
  { key: 'contains_nuts', labelKey: 'tagContainsNuts' },
  { key: 'gluten_free', labelKey: 'tagGlutenFree' },
  { key: 'dairy_free', labelKey: 'tagDairyFree' },
  { key: 'new_arrival', labelKey: 'tagNewArrival' },
  { key: 'bestseller', labelKey: 'tagBestseller' },
  { key: 'organic', labelKey: 'tagOrganic' },
  { key: 'fragrance_free', labelKey: 'tagFragranceFree' },
  { key: 'limited', labelKey: 'tagLimited' },
];

const CATEGORY_COLORS: { key: string; labelKey: ProductsKey; bg: string; text: string }[] = [
  { key: '', labelKey: 'colorNone', bg: 'bg-muted', text: 'text-muted-foreground' },
  { key: 'red', labelKey: 'colorRed', bg: 'bg-red-100', text: 'text-red-700' },
  { key: 'orange', labelKey: 'colorOrange', bg: 'bg-orange-100', text: 'text-orange-700' },
  { key: 'amber', labelKey: 'colorAmber', bg: 'bg-amber-100', text: 'text-amber-700' },
  { key: 'yellow', labelKey: 'colorYellow', bg: 'bg-yellow-100', text: 'text-yellow-700' },
  { key: 'lime', labelKey: 'colorLime', bg: 'bg-lime-100', text: 'text-lime-700' },
  { key: 'green', labelKey: 'colorGreen', bg: 'bg-green-100', text: 'text-green-700' },
  { key: 'emerald', labelKey: 'colorEmerald', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  { key: 'teal', labelKey: 'colorTeal', bg: 'bg-teal-100', text: 'text-teal-700' },
  { key: 'cyan', labelKey: 'colorCyan', bg: 'bg-cyan-100', text: 'text-cyan-700' },
  { key: 'sky', labelKey: 'colorSky', bg: 'bg-sky-100', text: 'text-sky-700' },
  { key: 'blue', labelKey: 'colorBlue', bg: 'bg-blue-100', text: 'text-blue-700' },
  { key: 'indigo', labelKey: 'colorIndigo', bg: 'bg-indigo-100', text: 'text-indigo-700' },
  { key: 'violet', labelKey: 'colorViolet', bg: 'bg-violet-100', text: 'text-violet-700' },
  { key: 'purple', labelKey: 'colorPurple', bg: 'bg-purple-100', text: 'text-purple-700' },
  { key: 'fuchsia', labelKey: 'colorFuchsia', bg: 'bg-fuchsia-100', text: 'text-fuchsia-700' },
  { key: 'pink', labelKey: 'colorPink', bg: 'bg-pink-100', text: 'text-pink-700' },
  { key: 'rose', labelKey: 'colorRose', bg: 'bg-rose-100', text: 'text-rose-700' },
];

type TabType = 'products' | 'categories' | 'addons';

/** Menu tables: hide secondary columns on narrow containers; keep actions sticky. */
const MENU_TABLE_WRAP = '@container bg-card rounded-xl border border-border overflow-x-auto';
const MENU_TH = 'px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase whitespace-nowrap';
const MENU_TD = 'px-3 py-2.5';
const MENU_ACTIONS_TH = `${MENU_TH} sticky end-0 z-20 bg-muted text-end min-w-24 border-s border-border`;
const MENU_ACTIONS_TD = `${MENU_TD} sticky end-0 z-10 bg-card group-hover:bg-muted text-end whitespace-nowrap min-w-24 border-s border-border`;

function taxCategoryOptionLabel(tc: { label: string; rate_percent?: number | null }): string {
  return tc.rate_percent != null ? `${tc.label} (${tc.rate_percent}%)` : tc.label;
}

export default function ProductsPage() {
  const t = useTranslations('products');
  const tCommon = useTranslations('common');
  const tPos = useTranslations('pos');
  const tWarehouse = useTranslations('warehouse');

  // Translate a raw tag string: known tags go through the `pos` namespace;
  // custom tags render a formatted name (reuses DietaryBadge's tagLabel).
  const tagLabelText = (tag: string): string => {
    const label = tagLabel(tag);
    return label.startsWith('pos.') ? tPos(label.slice(4) as PosKey) : label;
  };
  const { currentTenant } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [addonGroups, setAddonGroups] = useState<AddonGroup[]>([]);
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const [globalCashbackPercent, setGlobalCashbackPercent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [openedCategoryId, setOpenedCategoryId] = useState<string | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();
  const [editingAddonGroup, setEditingAddonGroup] = useState<AddonGroup | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '', color: '', is_active: true });
  const [addonForm, setAddonForm] = useState({ name: '', description: '', is_required: false, allow_multiple_quantities: false, min_selection: 0, max_selection: 10 });
  const [showAddonModal, setShowAddonModal] = useState(false);

  const [addonList, setAddonList] = useState<{ id?: number | string; name: string; price: number; is_active?: boolean }[]>([]);
  const [form, setForm] = useState({
    name: '', category_id: '', price: '', cost_price: '', cb_percent: '', sku: '', barcode: '',
    sale_unit: 'each' as Product['sale_unit'], allow_fractional_quantity: false, weight_precision: '3',
    tax_category_id: '', tax_behavior: 'country_default', description: '',
    track_inventory: false, stock_quantity: '0', low_stock_threshold: '5', is_active: true,
    tags: [] as string[],
    customTag: '',
    addon_group_ids: [] as string[],
    image_url: null as string | null,
    discount_type: 'percentage' as 'percentage' | 'amount',
    discount_value: '',
    discount_applies_to: [...ALL_ORDER_TYPES] as OrderType[],
  });
  const [imageTouched, setImageTouched] = useState(false);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipeLines, setRecipeLines] = useState<RecipeLineDraft[]>([]);

  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvType, setCsvType] = useState<'categories' | 'products' | 'addons'>('categories');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvResult, setCsvResult] = useState<Record<string, unknown> | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [catDeleteModal, setCatDeleteModal] = useState<{ open: boolean; id: string | null; name: string; productCount: number }>({ open: false, id: null, name: '', productCount: 0 });
  const [catReassignTo, setCatReassignTo] = useState<string>('');

  const [taxCategories, setTaxCategories] = useState<{ id: string; label: string; rate_percent?: number | null; rate_label?: string | null }[]>([]);
  const [defaultTaxCategoryId, setDefaultTaxCategoryId] = useState('');
  const [showBulkTaxModal, setShowBulkTaxModal] = useState(false);
  const [bulkTaxCategoryId, setBulkTaxCategoryId] = useState('');
  const [bulkTaxApplying, setBulkTaxApplying] = useState(false);

  const currency = getCurrencySymbol(
    resolveDisplayCurrency(currentTenant?.country, currentTenant?.currency),
    getCountryByCode(currentTenant?.country ?? '')?.locale ?? 'ru-KZ',
  );
  const fmt = useFormatCurrency();
  const isRestaurant = (currentTenant?.business_type ?? 'restaurant') === 'restaurant';
  const isOwnerOrManager = hasRole(currentTenant?.role, ROLE_ACCESS.ownerManager);

  useEffect(() => {
    if (!isRestaurant) {
      setIngredients([]);
      return;
    }
    api.get('/warehouse/ingredients')
      .then(({ data }) => setIngredients(data.ingredients || []))
      .catch(() => setIngredients([]));
  }, [isRestaurant]);

  const fetchData = async () => {
    try {
      const requests: Promise<{ data: Record<string, unknown> }>[] = [
        api.get('/products'),
        api.get('/categories'),
      ];
      if (isRestaurant) requests.push(api.get('/addon-groups'));
      const [prodRes, catRes, agRes] = await Promise.all(requests);
      setProducts((prodRes.data.products as Product[]) || []);
      setCategories((catRes.data.categories as Category[]) || []);
      if (agRes) setAddonGroups((agRes.data.addon_groups as AddonGroup[]) || []);
      if (isRestaurant) {
        try {
          const { data } = await api.get('/warehouse/ingredients');
          setIngredients(data.ingredients || []);
        } catch {
          setIngredients([]);
        }
      } else {
        setIngredients([]);
      }
    } catch {
      toast.error(t('failedToLoad'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    const requests: Promise<{ data: Record<string, unknown> }>[] = [
      api.get('/products', { signal: controller.signal }),
      api.get('/categories', { signal: controller.signal }),
    ];
    if (isRestaurant) requests.push(api.get('/addon-groups', { signal: controller.signal }));
    Promise.all(requests)
      .then(([prodRes, catRes, agRes]) => {
        setProducts((prodRes.data.products as Product[]) || []);
        setCategories((catRes.data.categories as Category[]) || []);
        if (agRes) setAddonGroups((agRes.data.addon_groups as AddonGroup[]) || []);
      })
      .catch((err: unknown) => {
        if (!(err instanceof Error && (err.name === 'CanceledError' || err.name === 'AbortError'))) toast.error(t('failedToLoad'));
      })
      .finally(() => { setLoading(false); });
    api.get('/tax/categories', { signal: controller.signal })
      .then((res) => {
        const data = res.data as { categories?: { id: string; label: string; rate_percent?: number | null; rate_label?: string | null }[]; default_category_id?: string | null };
        setTaxCategories(data.categories || []);
        setDefaultTaxCategoryId(data.default_category_id || '');
      })
      .catch((err: unknown) => {
        if (!(err instanceof Error && (err.name === 'CanceledError' || err.name === 'AbortError'))) setTaxCategories([]);
      });
    api.get('/settings/loyalty', { signal: controller.signal })
      .then((res) => {
        setLoyaltyEnabled(!!res.data.loyalty_enabled);
        setGlobalCashbackPercent(Number(res.data.global_cashback_percent) || 0);
      })
      .catch(() => {});
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCsvModal = (type: 'categories' | 'products' | 'addons') => {
    setCsvType(type);
    setCsvFile(null);
    setCsvResult(null);
    setShowCsvModal(true);
  };

  const downloadCsv = async (path: string, filename: string) => {
    try {
      const res = await api.get(path, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(tCommon('downloadFailed'));
    }
  };

  const legacyProducts = products.filter((p) => !p.tax_category_id && p.is_active);

  const handleBulkTaxAssign = async () => {
    if (!bulkTaxCategoryId || legacyProducts.length === 0) return;
    setBulkTaxApplying(true);
    try {
      const results = await Promise.allSettled(
        legacyProducts.map((p) => api.put(`/products/${p.id}`, { tax_category_id: bulkTaxCategoryId })),
      );
      const failedCount = results.filter((r) => r.status === 'rejected').length;
      if (failedCount > 0) {
        toast.error(t('categoryAssignPartial', { assigned: results.length - failedCount, total: results.length, failed: failedCount }));
      } else {
        toast.success(t('categoryAssignSuccess', { count: results.length }));
      }
      setShowBulkTaxModal(false);
      fetchData();
    } finally {
      setBulkTaxApplying(false);
    }
  };

  const handleCsvUpload = async () => {
    if (!csvFile) return;
    setCsvUploading(true);
    setCsvResult(null);
    try {
      const text = await csvFile.text();
      const res = await api.post(`/menu-csv/import/${csvType}`, { csv: text });
      setCsvResult(res.data);
      fetchData();
    } catch {
      toast.error(tCommon('importFailed'));
    } finally {
      setCsvUploading(false);
    }
  };

  const resetForm = () => {
    setForm({
      name: '', category_id: '', price: '', cost_price: '', cb_percent: '', sku: '', barcode: '',
      sale_unit: 'each', allow_fractional_quantity: false, weight_precision: '3',
      tax_category_id: '', tax_behavior: 'country_default', description: '',
      track_inventory: false, stock_quantity: '0', low_stock_threshold: '5', is_active: true,
      tags: [], customTag: '', addon_group_ids: [], image_url: null,
      discount_type: 'percentage', discount_value: '', discount_applies_to: [...ALL_ORDER_TYPES],
    });
    setImageTouched(false);
    setEditingProduct(null);
    setShowForm(false);
    setRecipeLines([]);
  };

  const openCreate = () => {
    resetForm();
    setForm((current) => ({
      ...current,
      tax_category_id: defaultTaxCategoryId,
      track_inventory: !isRestaurant,
    }));
    setShowForm(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      category_id: product.category_id != null ? String(product.category_id) : '',
      price: String(product.price),
      cost_price: String(product.cost_price || ''),
      cb_percent: product.cb_percent === null || product.cb_percent === undefined ? '' : String(product.cb_percent),
      sku: product.sku || '',
      barcode: product.barcode || '',
      sale_unit: product.sale_unit || 'each',
      allow_fractional_quantity: !!product.allow_fractional_quantity,
      weight_precision: String(product.weight_precision ?? 3),
      tax_category_id: product.tax_category_id || '',
      tax_behavior: product.tax_behavior || 'country_default',
      description: product.description || '',
      track_inventory: product.track_inventory,
      stock_quantity: String(product.stock_quantity || '0'),
      low_stock_threshold: String(product.low_stock_threshold ?? '5'),
      is_active: product.is_active,
      tags: product.tags || [],
      customTag: '',
      addon_group_ids: product.addon_groups?.map((g) => g.id) || [],
      image_url: product.has_image ? 'EXISTING' : null,
      discount_type: product.discount_type === 'amount' ? 'amount' : 'percentage',
      discount_value: product.discount_value && Number(product.discount_value) > 0 ? String(product.discount_value) : '',
      discount_applies_to: product.discount_applies_to && product.discount_applies_to.length > 0
        ? product.discount_applies_to
        : [...ALL_ORDER_TYPES],
    });
    setShowForm(true);
    if (!isRestaurant) {
      setRecipeLines([]);
      return;
    }
    api.get(`/warehouse/recipes/${product.id}`)
      .then(({ data }) => {
        setRecipeLines(
          (data.recipe || []).map((line: { ingredient_id: string; quantity: number }) => ({
            ingredient_id: line.ingredient_id,
            quantity: String(line.quantity),
          })),
        );
      })
      .catch(() => setRecipeLines([]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loyaltyEnabled && form.cb_percent !== '') {
      const parsed = Number(form.cb_percent);
      if (isNaN(parsed) || parsed < 0 || parsed > 100) {
        toast.error(t('invalidCashbackRate'));
        return;
      }
    }
    const discountValue = form.discount_value === '' ? 0 : Number(form.discount_value);
    if (form.discount_value !== '') {
      if (!Number.isFinite(discountValue) || discountValue < 0) {
        toast.error(t('invalidDishDiscount'));
        return;
      }
      if (form.discount_type === 'percentage' && discountValue > 100) {
        toast.error(t('invalidDishDiscount'));
        return;
      }
      if (discountValue > 0 && form.discount_applies_to.length === 0) {
        toast.error(t('dishDiscountNeedChannel'));
        return;
      }
    }
    try {
      const cbPercentVal: number | null = form.cb_percent === '' ? null : Number(form.cb_percent);

      const payload: Record<string, unknown> = {
        name: form.name,
        category_id: form.category_id || null,
        price: Number(form.price),
        cost_price: form.cost_price ? Number(form.cost_price) : null,
        cb_percent: cbPercentVal,
        sku: form.sku || null,
        barcode: form.barcode || null,
        sale_unit: form.sale_unit,
        allow_fractional_quantity: form.allow_fractional_quantity,
        weight_precision: Number(form.weight_precision),
        tax_category_id: form.tax_category_id || null,
        tax_behavior: form.tax_category_id ? form.tax_behavior : 'country_default',
        description: form.description || null,
        track_inventory: form.track_inventory,
        stock_quantity: Number(form.stock_quantity),
        low_stock_threshold: Number(form.low_stock_threshold),
        is_active: form.is_active,
        tags: form.tags.length > 0 ? form.tags : null,
        addon_group_ids: form.addon_group_ids,
        discount_type: discountValue > 0 ? form.discount_type : null,
        discount_value: discountValue > 0 ? discountValue : 0,
        discount_applies_to: discountValue > 0 ? form.discount_applies_to : [],
      };

      // Only include image_url when the user actually touched the image field
      // (avoids sending 50KB payloads when the image wasn't changed)
      if (imageTouched) {
        payload.image_url = form.image_url; // Can be a data URI or null (to clear)
      }

      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, payload);
        if (isRestaurant) {
          await api.put(`/warehouse/recipes/${editingProduct.id}`, {
            items: recipeLines
              .filter((line) => line.ingredient_id && Number(line.quantity) > 0)
              .map((line) => ({ ingredient_id: line.ingredient_id, quantity: Number(line.quantity) })),
          });
        }
        toast.success(t('updated'));
      } else {
        const { data } = await api.post('/products', payload);
        const productId = data?.product?.id;
        if (isRestaurant && productId) {
          await api.put(`/warehouse/recipes/${productId}`, {
            items: recipeLines
              .filter((line) => line.ingredient_id && Number(line.quantity) > 0)
              .map((line) => ({ ingredient_id: line.ingredient_id, quantity: Number(line.quantity) })),
          });
        }
        toast.success(t('created'));
      }
      resetForm();
      fetchData();
    } catch {
      toast.error(t('failedToSave'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!await confirm(t('deleteConfirm'), { destructive: true, confirmLabel: tCommon('delete') })) return;
    try {
      await api.delete(`/products/${id}`);
      toast.success(t('deleted'));
      fetchData();
    } catch {
      toast.error(tCommon('failedToDelete'));
    }
  };

  const resetCategoryForm = () => {
    setCategoryForm({ name: '', description: '', color: '', is_active: true });
    setEditingCategory(null);
    setShowForm(false);
  };

  const openEditCategory = (cat: Category) => {
    setEditingCategory(cat);
    setCategoryForm({ name: cat.name, description: cat.description || '', color: cat.color || '', is_active: cat.is_active });
    setShowForm(true);
  };

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { name: categoryForm.name, description: categoryForm.description || null, color: categoryForm.color || null, is_active: categoryForm.is_active };
      if (editingCategory) {
        await api.put(`/categories/${editingCategory.id}`, payload);
        toast.success(t('categoryUpdated'));
      } else {
        await api.post('/categories', payload);
        toast.success(t('categoryCreated'));
      }
      resetCategoryForm();
      fetchData();
    } catch (err) {
      console.error('[Category] Save error:', err);
      toast.error(t('failedToSaveCategory'));
    }
  };

  const handleCategoryDelete = async (id: string, name: string) => {
    const productCount = products.filter(p => p.category_id === id).length;
    if (productCount > 0) {
      setCatReassignTo('');
      setCatDeleteModal({ open: true, id, name, productCount });
      return;
    }

    try {
      await api.delete(`/categories/${id}`);
      toast.success(t('categoryDeleted'));
      setOpenedCategoryId((cur) => (cur === String(id) ? null : cur));
      fetchData();
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { error?: string; productCount?: number } } };
      if (e?.response?.status === 400 && e?.response?.data?.productCount) {
        setCatReassignTo('');
        setCatDeleteModal({ open: true, id, name, productCount: e.response.data.productCount });
      } else {
        toast.error(tCommon('failedToDelete'));
      }
    }
  };

  const handleCategoryReassignDelete = async () => {
    if (!catDeleteModal.id || !catReassignTo) return;
    try {
      await api.delete(`/categories/${catDeleteModal.id}?action=reassign&reassign_to=${catReassignTo}`);
      toast.success(t('reassignAndDelete'));
      setOpenedCategoryId((cur) => (cur === String(catDeleteModal.id) ? null : cur));
      setCatDeleteModal({ open: false, id: null, name: '', productCount: 0 });
      fetchData();
    } catch {
      toast.error(tCommon('failedToDelete'));
    }
  };

  const handleCategoryForceDelete = async () => {
    if (!catDeleteModal.id) return;
    try {
      await api.delete(`/categories/${catDeleteModal.id}?action=delete_all`);
      toast.success(t('categoryAndProductsDeleted'));
      setOpenedCategoryId((cur) => (cur === String(catDeleteModal.id) ? null : cur));
      setCatDeleteModal({ open: false, id: null, name: '', productCount: 0 });
      fetchData();
    } catch {
      toast.error(tCommon('failedToDelete'));
    }
  };

  const resetAddonForm = () => {
    setAddonForm({ name: '', description: '', is_required: false, allow_multiple_quantities: false, min_selection: 0, max_selection: 10 });
    setEditingAddonGroup(null);
    setShowAddonModal(false);
    setAddonList([]);
  };

  const openEditAddonGroup = (group: AddonGroup) => {
    setEditingAddonGroup(group);
    setAddonForm({ name: group.name, description: group.description || '', is_required: Boolean(group.is_required), allow_multiple_quantities: Boolean(group.allow_multiple_quantities), min_selection: group.min_selection, max_selection: group.max_selection });
    setAddonList(group.addons?.map((a) => ({ id: a.id, name: a.name, price: a.price, is_active: Boolean(a.is_active) })) || []);
    setShowAddonModal(true);
  };

  const handleAddonGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { name: addonForm.name, description: addonForm.description || null, is_required: addonForm.is_required, allow_multiple_quantities: addonForm.allow_multiple_quantities, min_selection: addonForm.min_selection, max_selection: addonForm.max_selection, addons: addonList };
      if (editingAddonGroup) {
        await api.put(`/addon-groups/${editingAddonGroup.id}`, payload);
        toast.success(t('addonGroupUpdated'));
      } else {
        await api.post('/addon-groups', payload);
        toast.success(t('addonGroupCreated'));
      }
      resetAddonForm();
      fetchData();
    } catch { toast.error(t('failedToSaveAddonGroup')); }
  };

  const handleAddonGroupDelete = async (id: number | string) => {
    if (!await confirm(t('deleteAddonGroupConfirm'), { destructive: true, confirmLabel: tCommon('delete') })) return;
    try {
      await api.delete(`/addon-groups/${id}`);
      toast.success(t('addonGroupDeleted'));
      fetchData();
    } catch { toast.error(tCommon('failedToDelete')); }
  };

  const addAddonItem = () => setAddonList((prev) => [...prev, { name: '', price: 0 }]);
  const updateAddonItem = (idx: number, field: string, value: string | number) => setAddonList((prev) => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a));
  const removeAddonItem = (idx: number) => setAddonList((prev) => prev.filter((_, i) => i !== idx));

  const openedCategory = openedCategoryId
    ? categories.find((c) => String(c.id) === String(openedCategoryId)) ?? null
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
      </div>

      <div className="flex gap-1 mb-6 border-b">
        <button onClick={() => { setOpenedCategoryId(null); setActiveTab('products'); }} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === 'products' ? 'border-brand text-brand' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          <Package size={16} /> {t('tabProducts')}
        </button>
        <button onClick={() => setActiveTab('categories')} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === 'categories' ? 'border-brand text-brand' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          <Folder size={16} /> {t('tabCategories')}
        </button>
        {isRestaurant && (
          <button onClick={() => { setOpenedCategoryId(null); setActiveTab('addons'); }} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${activeTab === 'addons' ? 'border-brand text-brand' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <Puzzle size={16} /> {t('tabAddonGroups')}
          </button>
        )}
      </div>

      {activeTab === 'products' && (
        <>
          <div className="flex justify-end gap-2 mb-4">
            {isOwnerOrManager && taxCategories.length > 0 && (
              <Button variant="outline" onClick={() => { setBulkTaxCategoryId(''); setShowBulkTaxModal(true); }}>
                {t('assignTaxCategory')}
              </Button>
            )}
            <Button variant="outline" onClick={() => openCsvModal('products')}>
              <FileSpreadsheet size={16} className="me-1" /> CSV
            </Button>
            {isOwnerOrManager && <PdfMenuImportButton onImported={fetchData} />}
            <Button onClick={openCreate}>
              <Plus size={16} className="me-1" /> {t('addProduct')}
            </Button>
          </div>

      <MenuProductTable
            products={products}
            categories={categories}
            taxCategories={taxCategories}
            loyaltyEnabled={loyaltyEnabled}
            globalCashbackPercent={globalCashbackPercent}
            isOwnerOrManager={isOwnerOrManager}
            emptyMessage={t('empty')}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
        </>
      )}

      {/* Product Form Modal */}
      {showForm && (activeTab === 'products' || !!editingProduct) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex justify-between items-center p-6 border-b border-border shrink-0">
              <h2 className="text-lg font-bold">{editingProduct ? t('editProductTitle') : t('addProductTitle')}</h2>
              <button onClick={resetForm} className="text-gray-400 hover:text-muted-foreground"><X size={20} /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">{t('fieldName')}<span className="text-red-500 ms-1">*</span></label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg focus:ring-2 focus:ring-brand outline-none" required />
              </div>
              <div>
                <label htmlFor="product-description" className="block text-sm font-medium text-foreground mb-1">{t('categoryDescription')}</label>
                <textarea id="product-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg focus:ring-2 focus:ring-brand outline-none" rows={2} />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">{t('fieldImage')}</label>
                <ImageUploader
                  value={form.image_url}
                  onChange={(val) => {
                    setForm({ ...form, image_url: val });
                    setImageTouched(true);
                  }}
                  productId={editingProduct?.id ? String(editingProduct.id) : undefined}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{t('fieldCategory')}<span className="text-red-500 ms-1">*</span></label>
                  <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg focus:ring-2 focus:ring-brand outline-none" required>
                    <option value="">{t('selectPlaceholder')}</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{t('fieldSku')}</label>
                  <input type="text" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg focus:ring-2 focus:ring-brand outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">{t('fieldBarcode')}</label>
                <input type="text" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  placeholder={t('fieldBarcodePlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg focus:ring-2 focus:ring-brand outline-none font-mono" />
                <p className="text-xs text-gray-400 mt-1">{t('fieldBarcodeHint')}</p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{t('fieldSaleUnit')}</label>
                  <select
                    value={form.sale_unit}
                    onChange={(e) => {
                      const saleUnit = e.target.value as Product['sale_unit'];
                      setForm({
                        ...form,
                        sale_unit: saleUnit,
                        allow_fractional_quantity: saleUnit === 'each' ? false : true,
                      });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg focus:ring-2 focus:ring-brand outline-none"
                  >
                    <option value="each">{t('saleUnitEach')}</option>
                    <option value="kg">{t('saleUnitKg')}</option>
                    <option value="g">{t('saleUnitG')}</option>
                    <option value="lb">{t('saleUnitLb')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{t('fieldWeightPrecision')}</label>
                  <input
                    type="number"
                    min="0"
                    max="4"
                    value={form.weight_precision}
                    onChange={(e) => setForm({ ...form, weight_precision: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg focus:ring-2 focus:ring-brand outline-none"
                  />
                </div>
                <label className="flex items-center gap-2 pt-7">
                  <input
                    type="checkbox"
                    checked={form.allow_fractional_quantity}
                    onChange={(e) => setForm({ ...form, allow_fractional_quantity: e.target.checked })}
                    className="rounded border-gray-300 dark:border-border text-brand focus:ring-brand"
                  />
                  <span className="text-sm text-foreground">{t('fieldAllowFractionalQuantity')}</span>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{t('priceLabel', { currency })}<span className="text-red-500 ms-1">*</span></label>
                  <input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg focus:ring-2 focus:ring-brand outline-none" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{t('fieldCostPrice')}</label>
                  <input type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg focus:ring-2 focus:ring-brand outline-none" />
                </div>
              </div>
              <div className="bg-muted p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-sm font-medium text-foreground">{t('dishDiscount')}</label>
                  {form.discount_value !== '' && Number(form.price) > 0 && (
                    <DishPrice
                      original={Number(form.price) || 0}
                      discounted={visibleDishPrices({
                        price: Number(form.price) || 0,
                        discount_type: form.discount_type,
                        discount_value: Number(form.discount_value) || 0,
                        discount_applies_to: form.discount_applies_to,
                      }).discounted}
                      className="text-sm font-bold text-brand"
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{t('dishDiscountHint')}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, discount_type: 'percentage' })}
                    className={`min-h-9 px-3 rounded-lg text-sm font-medium ${form.discount_type === 'percentage' ? 'bg-brand text-white' : 'bg-card border border-border text-foreground'}`}
                  >
                    {t('dishDiscountPercent')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, discount_type: 'amount' })}
                    className={`min-h-9 px-3 rounded-lg text-sm font-medium ${form.discount_type === 'amount' ? 'bg-brand text-white' : 'bg-card border border-border text-foreground'}`}
                  >
                    {t('dishDiscountAmount')}
                  </button>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={form.discount_type === 'percentage' ? 100 : undefined}
                    value={form.discount_value}
                    onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder={form.discount_type === 'percentage' ? '%' : currency}
                    className="w-28 px-3 py-2 border border-gray-300 dark:border-border rounded-lg focus:ring-2 focus:ring-brand outline-none"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground mb-2">{t('dishDiscountAppliesTo')}</p>
                  <div className="flex flex-wrap gap-3">
                    {ALL_ORDER_TYPES.map((type) => {
                      const label = type === 'dine_in'
                        ? tPos('orderTypeDineIn')
                        : type === 'takeaway'
                          ? tPos('orderTypeTakeaway')
                          : type === 'delivery'
                            ? tPos('orderTypeDelivery')
                            : tPos('orderTypeOnline');
                      return (
                        <label key={type} className="inline-flex items-center gap-2 text-sm text-foreground">
                          <input
                            type="checkbox"
                            checked={form.discount_applies_to.includes(type)}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...form.discount_applies_to, type]
                                : form.discount_applies_to.filter((channel) => channel !== type);
                              setForm({ ...form, discount_applies_to: ALL_ORDER_TYPES.filter((channel) => next.includes(channel)) });
                            }}
                            className="rounded border-gray-300 dark:border-border text-brand focus:ring-brand"
                          />
                          {label}
                        </label>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, discount_applies_to: [...ALL_ORDER_TYPES] })}
                      className="text-xs font-medium text-brand hover:underline"
                    >
                      {t('dishDiscountAll')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, discount_applies_to: ['dine_in', 'delivery'] })}
                      className="text-xs font-medium text-brand hover:underline"
                    >
                      {t('dishDiscountCafeDelivery')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, discount_value: '', discount_type: 'percentage', discount_applies_to: [...ALL_ORDER_TYPES] })}
                      className="text-xs font-medium text-muted-foreground hover:underline"
                    >
                      {t('dishDiscountClear')}
                    </button>
                  </div>
                </div>
              </div>
              {loyaltyEnabled && (
                <div className="bg-muted p-4 rounded-xl space-y-2">
                  <label className="block text-sm font-medium text-foreground">{t('cashbackLabel')}</label>
                  <div className="flex items-center gap-2">
                    <input type="number" step="0.1" min="0" max="100" value={form.cb_percent}
                      onChange={(e) => setForm({ ...form, cb_percent: e.target.value })}
                      placeholder={String(globalCashbackPercent)}
                      className="w-24 px-3 py-2 border border-gray-300 dark:border-border rounded-lg focus:ring-2 focus:ring-brand outline-none" />
                    <span className="text-muted-foreground font-medium">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {form.cb_percent === ''
                      ? t('cashbackUsingGlobal', { rate: globalCashbackPercent })
                      : t('cashbackOverrideHint')}
                  </p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">{t('taxRateGroupLabel')}</label>
                <select value={form.tax_category_id} onChange={(e) => setForm({ ...form, tax_category_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg focus:ring-2 focus:ring-brand outline-none">
                  <option value="">{t('taxNoTax')}</option>
                  {taxCategories.map((tc) => <option key={tc.id} value={tc.id}>{taxCategoryOptionLabel(tc)}</option>)}
                </select>
                {taxCategories.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">{t('taxNoGroupsHint')}</p>
                )}
                {taxCategories.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">{t('taxDefaultHint')}</p>
                )}
              </div>
              {form.tax_category_id ? (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{t('taxBehaviorLabel')}</label>
                  <select value={form.tax_behavior} onChange={(e) => setForm({ ...form, tax_behavior: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg focus:ring-2 focus:ring-brand outline-none">
                    <option value="country_default">{t('taxCountryDefault')}</option>
                    <option value="inclusive">{t('taxInclusive')}</option>
                    <option value="exclusive">{t('taxExclusive')}</option>
                    <option value="exempt">{t('taxExempt')}</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">{t('taxRateHint')}</p>
                </div>
              ) : (
                <p className="text-xs text-gray-400 -mt-2">
                  {t('taxNoCategory')}
                </p>
              )}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">{t('fieldTags')}</label>
                {/* Selected tags */}
                {form.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {form.tags.map((tag) => (
                      <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 bg-brand/10 text-brand rounded-lg text-xs font-medium">
                        {tagLabelText(tag)}
                        <button type="button" onClick={() => setForm((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }))} className="hover:text-red-500">
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {/* Preset tag chips */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {PRESET_TAGS.filter((pt) => !form.tags.includes(pt.key)).map((pt) => (
                    <button
                      key={pt.key}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, tags: [...prev.tags, pt.key] }))}
                      className="px-2 py-1 text-xs border border-border rounded-lg text-muted-foreground hover:border-brand hover:text-brand transition-colors"
                    >
                      + {tPos(pt.labelKey)}
                    </button>
                  ))}
                </div>
                {/* Custom tag input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.customTag}
                    onChange={(e) => setForm((prev) => ({ ...prev, customTag: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        const val = form.customTag.trim().toLowerCase().replace(/\s+/g, '_');
                        if (val && !form.tags.includes(val)) {
                          setForm((prev) => ({ ...prev, tags: [...prev.tags, val], customTag: '' }));
                        }
                      }
                    }}
                    placeholder={t('tagPlaceholder')}
                    className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg focus:ring-2 focus:ring-brand outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const val = form.customTag.trim().toLowerCase().replace(/\s+/g, '_');
                      if (val && !form.tags.includes(val)) {
                        setForm((prev) => ({ ...prev, tags: [...prev.tags, val], customTag: '' }));
                      }
                    }}
                    className="px-3 py-1.5 text-sm bg-muted rounded-lg hover:bg-muted text-muted-foreground"
                  >
                    {tCommon('add')}
                  </button>
                </div>
              </div>
              {isRestaurant && addonGroups.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">{t('fieldAddonGroups')}</label>
                  <div className="space-y-2 max-h-40 overflow-y-auto border border-border rounded-lg p-3">
                    {addonGroups.map((group) => {
                      const isChecked = form.addon_group_ids.includes(group.id);
                      return (
                        <div key={group.id} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`addon-group-${group.id}`}
                            checked={isChecked}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setForm((prev) => ({
                                ...prev,
                                addon_group_ids: checked
                                  ? [...prev.addon_group_ids, group.id]
                                  : prev.addon_group_ids.filter((id) => id !== group.id),
                              }));
                            }}
                            className="rounded border-gray-300 dark:border-border text-brand focus:ring-brand"
                          />
                          <label htmlFor={`addon-group-${group.id}`} className="flex items-center gap-2 cursor-pointer select-none">
                            <span className="text-sm text-foreground">{group.name}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${group.is_required ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground'}`}>
                              {group.is_required ? t('required') : t('optional')}
                            </span>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.track_inventory} onChange={(e) => setForm({ ...form, track_inventory: e.target.checked })}
                    className="rounded border-gray-300 dark:border-border text-brand focus:ring-brand" />
                  <span className="text-sm text-foreground">{t('fieldTrackInventory')}</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="rounded border-gray-300 dark:border-border text-brand focus:ring-brand" />
                  <span className="text-sm text-foreground">{t('fieldActive')}</span>
                </label>
              </div>
              {!!form.track_inventory && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">{t('fieldStock')}<span className="text-red-500 ms-1">*</span></label>
                    <input type="number" min="0" value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg focus:ring-2 focus:ring-brand outline-none" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">{t('fieldLowStockThreshold')}</label>
                    <input type="number" min="0" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg focus:ring-2 focus:ring-brand outline-none" required />
                  </div>
                </div>
              )}
              {isRestaurant && (
              <div className="border border-border rounded-lg p-3 space-y-2">
                <label className="block text-sm font-medium text-foreground">{tWarehouse('techCard')}</label>
                <p className="text-xs text-muted-foreground">{tWarehouse('recipeHint')}</p>
                <RecipeEditor ingredients={ingredients} lines={recipeLines} onChange={setRecipeLines} />
              </div>
              )}
              <Button type="submit" className="w-full">
                {editingProduct ? t('updateProduct') : t('createProduct')}
              </Button>
            </form>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'categories' && (
        <>
          {openedCategory ? (
            <>
              <div className="flex items-center gap-3 mb-4 min-w-0">
                <Button variant="outline" onClick={() => setOpenedCategoryId(null)}>
                  <ArrowLeft size={16} className="rtl-flip" /> {t('backToCategories')}
                </Button>
                <h2 className="text-lg font-bold text-foreground truncate">{openedCategory.name}</h2>
                {!openedCategory.is_active && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 w-fit shrink-0">
                    <AlertTriangle size={11} className="shrink-0" /> {t('categoryInactiveBadge')}
                  </span>
                )}
              </div>
              <MenuProductTable
                products={products.filter((p) => productBelongsToCategory(p, openedCategory.id))}
                categories={categories}
                taxCategories={taxCategories}
                loyaltyEnabled={loyaltyEnabled}
                globalCashbackPercent={globalCashbackPercent}
                isOwnerOrManager={isOwnerOrManager}
                hideCategory
                emptyMessage={t('categoryDishesEmpty')}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            </>
          ) : (
            <>
          <div className="flex justify-end gap-2 mb-4">
            <Button variant="outline" onClick={() => openCsvModal('categories')}>
              <FileSpreadsheet size={16} className="me-1" /> CSV
            </Button>
            {isOwnerOrManager && <PdfMenuImportButton onImported={fetchData} />}
            <Button onClick={() => { resetCategoryForm(); setShowForm(true); }}>
              <Plus size={16} className="me-1" /> {t('addCategory')}
            </Button>
          </div>
          <div className={MENU_TABLE_WRAP}>
            <table className="w-max min-w-full">
              <thead className="bg-muted">
                <tr>
                  <th className={`${MENU_TH} text-start`}>{t('categoryName')}</th>
                  <th className={`${MENU_TH} text-start`}>{t('categoryColor')}</th>
                  <th className={`${MENU_TH} text-center`}>{t('columnStatus')}</th>
                  <th className={MENU_ACTIONS_TH}>{t('columnActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {categories.map((cat) => {
                  const colorObj = CATEGORY_COLORS.find((c) => c.key === cat.color);
                  return (
                    <tr
                      key={cat.id}
                      className="group hover:bg-muted cursor-pointer"
                      onClick={() => setOpenedCategoryId(String(cat.id))}
                    >
                      <td className={`${MENU_TD} font-medium text-foreground`}>
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 text-start font-medium text-foreground hover:text-brand"
                          aria-label={t('openCategory')}
                          onClick={(e) => { e.stopPropagation(); setOpenedCategoryId(String(cat.id)); }}
                        >
                          {cat.name}
                          <ChevronRight size={16} className="text-gray-400 shrink-0 rtl-flip" />
                        </button>
                      </td>
                      <td className={MENU_TD}>
                        {colorObj ? (
                          <span className={`inline-flex px-2 py-1 rounded-lg text-xs font-medium ${colorObj.bg} ${colorObj.text}`}>{t(colorObj.labelKey)}</span>
                        ) : <span className="text-gray-400 text-sm">—</span>}
                      </td>
                      <td className={`${MENU_TD} text-center`}>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${cat.is_active ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground'}`}>
                          {cat.is_active ? tCommon('active') : tCommon('inactive')}
                        </span>
                      </td>
                      <td className={MENU_ACTIONS_TD} onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1 justify-end">
                          {isOwnerOrManager && (
                            <>
                              <button type="button" onClick={() => openEditCategory(cat)} className="p-1.5 text-gray-400 hover:text-brand"><Pencil size={16} /></button>
                              <button type="button" onClick={() => handleCategoryDelete(cat.id, cat.name)} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {categories.length === 0 && <p className="text-center text-muted-foreground py-12">{t('categoryEmpty')}</p>}
          </div>
            </>
          )}

          {showForm && !editingProduct && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-card rounded-2xl p-6 w-full max-w-md">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-bold">{editingCategory ? t('editCategoryTitle') : t('addCategoryTitle')}</h2>
                  <button onClick={resetCategoryForm} className="text-gray-400 hover:text-muted-foreground"><X size={20} /></button>
                </div>
                <form onSubmit={handleCategorySubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">{t('fieldName')}<span className="text-red-500 ms-1">*</span></label>
                    <input type="text" value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg focus:ring-2 focus:ring-brand outline-none" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">{t('categoryDescription')}</label>
                    <textarea value={categoryForm.description} onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg focus:ring-2 focus:ring-brand outline-none" rows={2} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">{t('colorLabel')}</label>
                    <div className="flex flex-wrap gap-2">
                      {CATEGORY_COLORS.map((c) => (
                        <button type="button" key={c.key} onClick={() => setCategoryForm({ ...categoryForm, color: c.key })} className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 ${c.key === categoryForm.color ? 'border-brand' : 'border-transparent'} ${c.bg} ${c.text}`}>{t(c.labelKey)}</button>
                      ))}
                    </div>
                  </div>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={categoryForm.is_active} onChange={(e) => setCategoryForm({ ...categoryForm, is_active: e.target.checked })} className="rounded border-gray-300 dark:border-border text-brand focus:ring-brand" />
                    <span className="text-sm text-foreground">{t('fieldActive')}</span>
                  </label>
                  <Button type="submit" className="w-full">{editingCategory ? tCommon('update') : tCommon('create')}</Button>
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'addons' && isRestaurant && (
        <>
          <div className="flex justify-end gap-2 mb-4">
            <Button variant="outline" onClick={() => openCsvModal('addons')}>
              <FileSpreadsheet size={16} className="me-1" /> CSV
            </Button>
            <Button onClick={() => { resetAddonForm(); setShowAddonModal(true); }}>
              <Plus size={16} className="me-1" /> {t('addAddonGroup')}
            </Button>
          </div>
          <div className={MENU_TABLE_WRAP}>
            <table className="w-max min-w-full">
              <thead className="bg-muted">
                <tr>
                  <th className={`${MENU_TH} text-start`}>{t('categoryName')}</th>
                  <th className={`${MENU_TH} text-center`}>{t('columnRequired')}</th>
                  <th className={`${MENU_TH} text-center hidden @min-[700px]:table-cell`}>{t('columnSelection')}</th>
                  <th className={`${MENU_TH} text-center`}>{t('columnAddons')}</th>
                  <th className={MENU_ACTIONS_TH}>{t('columnActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {addonGroups.map((group) => (
                  <tr key={group.id} className="group hover:bg-muted">
                    <td className={`${MENU_TD} font-medium text-foreground`}>{group.name}</td>
                    <td className={`${MENU_TD} text-center`}>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${group.is_required ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground'}`}>{group.is_required ? tCommon('yes') : tCommon('no')}</span>
                    </td>
                    <td className={`${MENU_TD} text-center text-sm text-muted-foreground hidden @min-[700px]:table-cell`}>{t('addonSelectionRange', { min: group.min_selection, max: group.max_selection })}</td>
                    <td className={`${MENU_TD} text-center text-sm text-muted-foreground`}>{group.addons?.length || 0}</td>
                    <td className={MENU_ACTIONS_TD}>
                      <div className="flex gap-1 justify-end">
                        {isOwnerOrManager && (
                          <>
                            <button onClick={() => openEditAddonGroup(group)} className="p-1.5 text-gray-400 hover:text-brand"><Pencil size={16} /></button>
                            <button onClick={() => handleAddonGroupDelete(group.id)} className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {addonGroups.length === 0 && <p className="text-center text-muted-foreground py-12">{t('addonEmpty')}</p>}
          </div>

          {showAddonModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-card rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
                <div className="flex justify-between items-center p-6 border-b border-border shrink-0">
                  <h2 className="text-lg font-bold">{editingAddonGroup ? t('editAddonGroupTitle') : t('addAddonGroupTitle')}</h2>
                  <button onClick={resetAddonForm} className="text-gray-400 hover:text-muted-foreground"><X size={20} /></button>
                </div>
                <div className="p-6 overflow-y-auto flex-1">
                  <form onSubmit={handleAddonGroupSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">{t('fieldName')}<span className="text-red-500 ms-1">*</span></label>
                    <input type="text" value={addonForm.name} onChange={(e) => setAddonForm({ ...addonForm, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg focus:ring-2 focus:ring-brand outline-none" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">{t('categoryDescription')}</label>
                    <input type="text" value={addonForm.description} onChange={(e) => setAddonForm({ ...addonForm, description: e.target.value })} className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg focus:ring-2 focus:ring-brand outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">{t('addonMin')}</label>
                      <input type="number" min="0" value={addonForm.min_selection} onChange={(e) => setAddonForm({ ...addonForm, min_selection: Number(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg focus:ring-2 focus:ring-brand outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">{t('addonMax')}</label>
                      <input type="number" min="0" value={addonForm.max_selection} onChange={(e) => setAddonForm({ ...addonForm, max_selection: Number(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg focus:ring-2 focus:ring-brand outline-none" />
                    </div>
                  </div>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={addonForm.is_required} onChange={(e) => setAddonForm({ ...addonForm, is_required: e.target.checked })} className="rounded border-gray-300 dark:border-border text-brand focus:ring-brand" />
                    <span className="text-sm text-foreground">{t('addonRequired')}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={addonForm.allow_multiple_quantities} onChange={(e) => setAddonForm({ ...addonForm, allow_multiple_quantities: e.target.checked })} className="rounded border-gray-300 dark:border-border text-brand focus:ring-brand" />
                    <span className="text-sm text-foreground">{t('addonAllowMultipleQuantities')}</span>
                  </label>
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-medium text-foreground">{t('addonAddons')}</label>
                      <button type="button" onClick={addAddonItem} className="text-xs text-brand hover:underline">{t('addAddonInline')}</button>
                    </div>
                    <div className="space-y-2">
                      <div className="grid grid-cols-[minmax(0,1fr)_6rem_1.5rem] gap-2 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        <span>{t('nameLabel')}</span>
                        <span>{t('columnPrice')}</span>
                        <span aria-hidden="true" />
                      </div>
                      {addonList.map((addon, idx) => (
                        <div key={idx} className="grid grid-cols-[minmax(0,1fr)_6rem_1.5rem] gap-2 items-center">
                          <input type="text" value={addon.name} onChange={(e) => updateAddonItem(idx, 'name', e.target.value)} placeholder={tCommon('namePlaceholder')} className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-border rounded-lg focus:ring-2 focus:ring-brand outline-none" />
                          <input type="number" step="0.01" value={addon.price} onChange={(e) => updateAddonItem(idx, 'price', Number(e.target.value))} onWheel={(e) => e.currentTarget.blur()} placeholder={tCommon('pricePlaceholder')} aria-label={t('columnPrice')} className="w-24 px-3 py-2 text-sm border border-gray-300 dark:border-border rounded-lg focus:ring-2 focus:ring-brand outline-none" />
                          <button type="button" onClick={() => removeAddonItem(idx)} className="text-gray-400 hover:text-red-500"><X size={16} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Button type="submit" className="w-full">{editingAddonGroup ? tCommon('update') : tCommon('create')}</Button>
                </form>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {showBulkTaxModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">{t('assignTaxCategory')}</h2>
              <button onClick={() => setShowBulkTaxModal(false)} className="text-gray-400 hover:text-muted-foreground"><X size={20} /></button>
            </div>
            {legacyProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('taxAllAssigned')}</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  {t('taxBulkBody', { count: legacyProducts.length })}
                </p>
                <label className="block text-sm font-medium text-foreground mb-1">{t('taxRateGroupLabel')}</label>
                <select value={bulkTaxCategoryId} onChange={(e) => setBulkTaxCategoryId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg focus:ring-2 focus:ring-brand outline-none mb-5">
                  <option value="">{t('selectPlaceholder')}</option>
                  {taxCategories.map((tc) => <option key={tc.id} value={tc.id}>{taxCategoryOptionLabel(tc)}</option>)}
                </select>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowBulkTaxModal(false)}>{tCommon('cancel')}</Button>
                  <Button onClick={handleBulkTaxAssign} disabled={!bulkTaxCategoryId || bulkTaxApplying}>
                    {bulkTaxApplying ? t('csvImporting') : t('taxApplyToProducts', { count: legacyProducts.length })}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showCsvModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-2xl p-6 w-full max-w-lg">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold">
                {t('csvModalTitle', { type: csvType === 'categories' ? t('tabCategories') : csvType === 'products' ? t('tabProducts') : t('tabAddonGroups') })}
              </h2>
              <button onClick={() => setShowCsvModal(false)} className="text-gray-400 hover:text-muted-foreground">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5">
              {/* Download section */}
              <div className="bg-muted rounded-xl p-4 space-y-3">
                <p className="text-sm font-medium text-foreground">{t('download')}</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => downloadCsv(`/menu-csv/template/${csvType}`, `${csvType}-template.csv`)}
                    className="flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-lg bg-card hover:bg-muted font-medium"
                  >
                    <Download size={14} /> {t('csvBlankTemplate')}
                  </button>
                  <button
                    onClick={() => downloadCsv(`/menu-csv/export/${csvType}`, `${csvType}-export.csv`)}
                    className="flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-lg bg-card hover:bg-muted font-medium"
                  >
                    <Download size={14} /> {t('csvCurrentData')}
                  </button>
                </div>
                {csvType === 'products' && (
                  <p className="text-xs text-muted-foreground">{t('csvProductsHelp')}</p>
                )}
                {csvType === 'categories' && (
                  <p className="text-xs text-muted-foreground">{t('csvCategoriesHelp')}</p>
                )}
                {csvType === 'addons' && (
                  <p className="text-xs text-muted-foreground">{t('csvAddonsHelp')}</p>
                )}
              </div>

              {/* Upload section */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">{t('uploadCsv')}</p>
                <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-border rounded-xl cursor-pointer hover:bg-muted transition-colors">
                  <Upload size={20} className="text-gray-400 mb-1" />
                  <span className="text-sm text-muted-foreground">
                    {csvFile ? csvFile.name : t('csvChooseFile')}
                  </span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => { setCsvFile(e.target.files?.[0] ?? null); setCsvResult(null); }}
                  />
                </label>
                {csvFile && (
                  <Button onClick={handleCsvUpload} disabled={csvUploading} className="w-full">
                    {csvUploading ? t('csvImporting') : tCommon('import')}
                  </Button>
                )}
              </div>

              {/* Result */}
              {csvResult && (
                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border-b border-border">
                    <CheckCircle size={15} className="text-green-600" />
                    <span className="text-sm font-medium text-green-800">{t('importComplete')}</span>
                  </div>
                  <div className="px-4 py-3 text-sm text-foreground space-y-1">
                    {csvType === 'addons' ? (
                      <>
                        <p>{t('csvGroupsCreated')} <span className="font-medium">{String(csvResult.groups_created ?? 0)}</span></p>
                        <p>{t('csvAddonsCreated')} <span className="font-medium">{String(csvResult.addons_created ?? 0)}</span></p>
                      </>
                    ) : (
                      <p>{tCommon('created')} <span className="font-medium">{String(csvResult.created ?? 0)}</span></p>
                    )}
                    <p>{tCommon('skipped')} <span className="font-medium">{String(csvResult.skipped ?? 0)}</span></p>
                  </div>
                  {Array.isArray(csvResult.warnings) && (csvResult.warnings as string[]).length > 0 && (
                    <div className="px-4 py-3 border-t border-border bg-amber-50">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle size={14} className="text-amber-500" />
                        <span className="text-xs font-medium text-amber-700">{t('csvMissingFields')}</span>
                      </div>
                      <ul className="space-y-1">
                        {(csvResult.warnings as string[]).map((w, i) => (
                          <li key={i} className="text-xs text-amber-800">{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray(csvResult.errors) && (csvResult.errors as string[]).length > 0 && (
                    <div className="px-4 py-3 border-t border-border">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle size={14} className="text-red-500" />
                        <span className="text-xs font-medium text-red-700">{t('csvSkippedErrors')}</span>
                      </div>
                      <ul className="space-y-1">
                        {(csvResult.errors as string[]).map((e, i) => (
                          <li key={i} className="text-xs text-muted-foreground">{e}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {catDeleteModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-2xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-foreground">{t('deleteCategoryTitle')}</h2>
              <button onClick={() => setCatDeleteModal({ open: false, id: null, name: '', productCount: 0 })} className="text-gray-400 hover:text-muted-foreground"><X size={20} /></button>
            </div>
            <p className="text-sm text-foreground mb-5">
              {t('deleteCategoryBody', { name: catDeleteModal.name, count: catDeleteModal.productCount })}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">{t('moveProductsTo')}</label>
                <select
                  value={catReassignTo}
                  onChange={(e) => setCatReassignTo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg focus:ring-2 focus:ring-brand outline-none"
                >
                  <option value="">{t('selectCategoryPlaceholder')}</option>
                  {categories
                    .filter((c) => c.name.toLowerCase() === 'uncategorized' && c.id !== catDeleteModal.id)
                    .map((c) => <option key={c.id} value={String(c.id)}>{t('defaultCategoryTag', { name: c.name })}</option>)}
                  {categories
                    .filter((c) => c.name.toLowerCase() !== 'uncategorized' && c.id !== catDeleteModal.id)
                    .map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                </select>
              </div>
              <Button onClick={handleCategoryReassignDelete} disabled={!catReassignTo} className="w-full">
                {t('moveAndDelete')}
              </Button>
              <div className="relative flex items-center">
                <div className="flex-grow border-t border-border" />
                <span className="mx-3 text-xs text-gray-400">{tCommon('or')}</span>
                <div className="flex-grow border-t border-border" />
              </div>
              <button
                onClick={handleCategoryForceDelete}
                className="w-full px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                {t('deleteCategoryAndProducts')}
              </button>
            </div>
          </div>
        </div>
      )}
      {ConfirmDialog}
    </div>
  );
}

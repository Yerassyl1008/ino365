'use client';

import axios, { AxiosInstance } from 'axios';
import toast from 'react-hot-toast';
import { ArrowLeft, Bell, CheckCircle2, ChefHat, Circle, Flame, LogOut, Minus, Plus, RefreshCw, Search, Send, Smartphone, UserRound } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { parsePhone } from '@/lib/phone';
import { useSyncServerLanguage } from '@/lib/i18n';
import { useTranslations, type AppConfig } from 'use-intl';
import { Ltr } from '@/components/layout/Ltr';
import { toastApiError } from '@/lib/api-error';

type User = { id: string; name: string; email: string; role: string };
type Category = { id: string; name: string };
type Product = { id: string; category_id: string | null; name: string; price: number | string; is_active: number };
type Table = { id: string; name?: string; number?: string; status?: string; activeOrder?: Order | null; current_order?: Order | null };
type OrderItem = { id: number; product_name: string; quantity: number; status: string; special_instructions?: string | null };
type Order = { id: number; order_number: string; table_id?: string | null; status: string; items?: OrderItem[]; customer?: { id: string; name: string; phone?: string } | null };
type DraftLine = { product: Product; quantity: number; note: string };
type MobileView = 'tables' | 'menu';

type ServerAppKey = keyof AppConfig['Messages']['serverApp'];

const TOKEN_KEY = 'flocafe:server-app-token';

function createApi(): AxiosInstance {
  const api = axios.create({ baseURL: window.location.origin, timeout: 10000 });
  api.interceptors.request.use((config) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
  api.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) localStorage.removeItem(TOKEN_KEY);
      return Promise.reject(error);
    },
  );
  return api;
}

function itemStatusIcon(status: string, t: (key: ServerAppKey) => string) {
  if (status === 'preparing') return <Flame size={15} className="text-orange-500" aria-label={t('statusPreparing')} />;
  if (status === 'ready') return <Bell size={15} className="text-emerald-600" aria-label={t('statusReady')} />;
  if (status === 'served') return <CheckCircle2 size={15} className="text-blue-600" aria-label={t('statusServed')} />;
  return <Circle size={15} className="text-gray-400" aria-label={t('statusWaiting')} />;
}

function money(value: number | string) {
  return Number(value || 0).toFixed(2);
}

function nextKitchenItemStatus(status: string): 'preparing' | 'ready' | 'served' | null {
  if (status === 'pending') return 'preparing';
  if (status === 'preparing') return 'ready';
  if (status === 'ready') return 'served';
  return null;
}

function kitchenAdvanceLabelKey(next: 'preparing' | 'ready' | 'served'): 'markPreparing' | 'markReady' | 'markServed' {
  if (next === 'preparing') return 'markPreparing';
  if (next === 'ready') return 'markReady';
  return 'markServed';
}

function TicketPanel({
  t,
  customerName,
  customerPhone,
  setCustomerName,
  setCustomerPhone,
  currentOrder,
  draft,
  changeQty,
  setDraft,
  draftTotal,
  sendDraft,
  selectedTableId,
  sending,
  advancingItemId,
  onAdvanceItem,
}: {
  t: (key: ServerAppKey) => string;
  customerName: string;
  customerPhone: string;
  setCustomerName: (value: string) => void;
  setCustomerPhone: (value: string) => void;
  currentOrder: Order | null;
  draft: DraftLine[];
  changeQty: (productId: string, delta: number) => void;
  setDraft: Dispatch<SetStateAction<DraftLine[]>>;
  draftTotal: number;
  sendDraft: () => void;
  selectedTableId: string;
  sending: boolean;
  advancingItemId: number | null;
  onAdvanceItem: (item: OrderItem) => void;
}) {
  return (
    <>
      <h2 className="text-lg font-semibold">{t('currentTicket')}</h2>
      <div className="mt-3 grid grid-cols-1 gap-3">
        <input
          value={customerName}
          onChange={(event) => setCustomerName(event.target.value)}
          placeholder={t('customerNamePlaceholder')}
          className="h-14 w-full min-w-0 rounded-xl border border-gray-200 bg-white px-4 text-lg text-gray-900 caret-gray-900 focus:border-brand focus:outline-none"
        />
        <input
          value={customerPhone}
          onChange={(event) => setCustomerPhone(event.target.value)}
          dir="ltr"
          placeholder={t('phonePlaceholder')}
          className="h-14 w-full min-w-0 rounded-xl border border-gray-200 bg-white px-4 text-lg text-gray-900 caret-gray-900 focus:border-brand focus:outline-none"
        />
      </div>

      {currentOrder?.items && currentOrder.items.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="mb-2 text-sm font-semibold uppercase text-gray-500">{t('kitchen')}</p>
          <div className="space-y-3">
            {currentOrder.items.map((item) => {
              const next = nextKitchenItemStatus(item.status);
              return (
                <div key={item.id} className="flex min-h-14 items-center gap-3 text-base">
                  {itemStatusIcon(item.status, t)}
                  <span className="min-w-0 flex-1">
                    <span className="block leading-snug"><Ltr>{item.quantity}</Ltr> x {item.product_name}</span>
                  </span>
                  {next ? (
                    <button
                      type="button"
                      disabled={advancingItemId === item.id}
                      onClick={() => onAdvanceItem(item)}
                      className="h-12 shrink-0 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {t(kitchenAdvanceLabelKey(next))}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-gray-100 pt-3">
        <p className="mb-2 text-sm font-semibold uppercase text-gray-500">{t('newItems')}</p>
        {draft.length === 0 ? (
          <p className="py-8 text-center text-base text-gray-400">{t('emptyDraft')}</p>
        ) : (
          <div className="space-y-3">
            {draft.map((line) => (
              <div key={line.product.id} className="rounded-xl border border-gray-100 p-4">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 text-base font-semibold">{line.product.name}</span>
                  <button
                    type="button"
                    onClick={() => changeQty(line.product.id, -1)}
                    className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200"
                    aria-label="-"
                  >
                    <Minus size={18} />
                  </button>
                  <span className="w-8 text-center text-lg font-semibold"><Ltr>{line.quantity}</Ltr></span>
                  <button
                    type="button"
                    onClick={() => changeQty(line.product.id, 1)}
                    className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200"
                    aria-label="+"
                  >
                    <Plus size={18} />
                  </button>
                </div>
                <input
                  value={line.note}
                  onChange={(event) => setDraft((lines) => lines.map((draftLine) => draftLine.product.id === line.product.id ? { ...draftLine, note: event.target.value } : draftLine))}
                  placeholder={t('itemNotePlaceholder')}
                  className="mt-3 h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-base text-gray-900 caret-gray-900 focus:border-brand focus:outline-none"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
        <span className="text-base text-gray-500">{t('draftTotal')}</span>
        <span className="text-2xl font-bold"><Ltr>{money(draftTotal)}</Ltr></span>
      </div>
      <button
        type="button"
        onClick={sendDraft}
        disabled={!selectedTableId || draft.length === 0 || sending}
        className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-brand text-lg font-semibold text-white disabled:opacity-50"
      >
        <Send size={17} />
        {sending ? t('sending') : currentOrder ? t('addToOrder') : t('sendToKitchen')}
      </button>
    </>
  );
}

export default function ServerStandalonePage() {
  // The Server App inherits the tenant language from `/api/server-app/info`,
  // the same way the standalone KDS inherits it from `/api/kds/info` — no
  // separate language store, just the shared usePosSettingsStore.
  useSyncServerLanguage('/api/server-app/info');
  const t = useTranslations('serverApp');
  const tAuth = useTranslations('auth');
  const tOrders = useTranslations('orders');
  const tTables = useTranslations('tables');

  // toastApiError (shared legacy helper) resolves `apiError.<code>` dotted keys;
  // server-app errors have no such keys, so bridge with a no-op that always
  // falls back to the caller-supplied localized message.
  const apiErrorT = (key: string): string => key;
  const api = useMemo(() => (typeof window !== 'undefined' ? createApi() : null), []);
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginMode, setLoginMode] = useState<'pin' | 'email'>('pin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [disabled, setDisabled] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [advancingItemId, setAdvancingItemId] = useState<number | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>('tables');
  const [ticketOpen, setTicketOpen] = useState(false);

  async function loadAll() {
    if (!api) return;
    const [categoriesRes, productsRes, tablesRes] = await Promise.all([
      api.get('/api/categories', { params: { active: 'true' } }),
      api.get('/api/products', { params: { active: 'true' } }),
      api.get('/api/tables', { params: { active: 'true' } }),
    ]);
    setCategories(categoriesRes.data.categories || []);
    setProducts(productsRes.data.products || []);
    const loadedTables = tablesRes.data.tables || [];
    setTables(loadedTables);
    if (!selectedTableId && loadedTables[0]) setSelectedTableId(loadedTables[0].id);
  }

  async function loadOrder(tableId: string) {
    if (!api || !tableId) return;
    const res = await api.get('/api/orders', {
      params: { table_id: tableId, type: 'dine_in', status: 'pending,preparing,ready,served', per_page: 1 },
    });
    const order = res.data.orders?.[0] || null;
    setCurrentOrder(order);
    if (order?.customer) {
      setCustomerName(order.customer.name || '');
      setCustomerPhone(order.customer.phone || '');
    } else {
      setCustomerName('');
      setCustomerPhone('');
    }
  }

  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    api.get('/api/server-app/info')
      .then(() => api.get('/api/auth/me'))
      .then((res) => {
        if (!cancelled) setUser(res.data.user);
      })
      .catch((error) => {
        if (error.response?.status === 404) setDisabled(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [api]);

  useEffect(() => {
    if (!user || !api) return;
    let cancelled = false;
    Promise.all([
      api.get('/api/categories', { params: { active: 'true' } }),
      api.get('/api/products', { params: { active: 'true' } }),
      api.get('/api/tables', { params: { active: 'true' } }),
    ]).then(([categoriesRes, productsRes, tablesRes]) => {
      if (cancelled) return;
      setCategories(categoriesRes.data.categories || []);
      setProducts(productsRes.data.products || []);
      const loadedTables = tablesRes.data.tables || [];
      setTables(loadedTables);
      if (!selectedTableId && loadedTables[0]) setSelectedTableId(loadedTables[0].id);
    }).catch(() => toast.error(t('couldNotLoadData')));
    return () => { cancelled = true; };
  }, [api, selectedTableId, user, t]);

  useEffect(() => {
    if (!selectedTableId || !user || !api) return;
    let cancelled = false;
    api.get('/api/orders', {
      params: { table_id: selectedTableId, type: 'dine_in', status: 'pending,preparing,ready,served', per_page: 1 },
    }).then((res) => {
      if (cancelled) return;
      const order = res.data.orders?.[0] || null;
      setCurrentOrder(order);
      if (order?.customer) {
        setCustomerName(order.customer.name || '');
        setCustomerPhone(order.customer.phone || '');
      } else {
        setCustomerName('');
        setCustomerPhone('');
      }
    }).catch(() => {
      if (!cancelled) setCurrentOrder(null);
    });
    return () => { cancelled = true; };
  }, [api, selectedTableId, user]);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    if (!api) return;
    setLoginLoading(true);
    try {
      const res = await api.post('/api/auth/login', { email, password, remember_me: rememberMe });
      localStorage.setItem(TOKEN_KEY, res.data.access_token);
      setUser(res.data.user);
    } catch (error: unknown) {
      toastApiError(error, t('signInFailed'), apiErrorT);
    } finally {
      setLoginLoading(false);
    }
  }

  async function handlePinLogin(event: FormEvent) {
    event.preventDefault();
    if (!api || pin.length < 4) return;
    setLoginLoading(true);
    try {
      const res = await api.post('/api/auth/pin-login', { pin, remember_me: rememberMe });
      localStorage.setItem(TOKEN_KEY, res.data.access_token);
      setUser(res.data.user);
      setPin('');
    } catch (error: unknown) {
      setPin('');
      toastApiError(error, t('signInFailed'), apiErrorT);
    } finally {
      setLoginLoading(false);
    }
  }

  async function logout() {
    try { await api?.post('/api/auth/logout'); } catch {}
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setMobileView('tables');
    setTicketOpen(false);
  }

  function addProduct(product: Product) {
    setDraft((lines) => {
      const existing = lines.find((line) => line.product.id === product.id && line.note === '');
      if (existing) {
        return lines.map((line) => line === existing ? { ...line, quantity: line.quantity + 1 } : line);
      }
      return [...lines, { product, quantity: 1, note: '' }];
    });
  }

  function changeQty(productId: string, delta: number) {
    setDraft((lines) => lines
      .map((line) => line.product.id === productId ? { ...line, quantity: line.quantity + delta } : line)
      .filter((line) => line.quantity > 0));
  }

  async function ensureCustomer(): Promise<string | null> {
    if (!api) return null;
    const name = customerName.trim();
    const rawPhone = customerPhone.trim();
    if (!name && !rawPhone) return null;
    let normalizedPhone: string | undefined = undefined;
    if (rawPhone) {
      const parsed = parsePhone(rawPhone, 'IN');
      normalizedPhone = parsed ? parsed.e164 : rawPhone;
      try {
        const lookup = await api.get('/api/crm/lookup', { params: { phone: normalizedPhone } });
        if (lookup.data.found && lookup.data.customer?.id) return lookup.data.customer.id;
      } catch {}
    }
    const fallbackName = name || t('guestFallbackName', { last4: rawPhone.slice(-4) });
    const res = await api.post('/api/customers', { name: fallbackName, phone: normalizedPhone || undefined });
    return res.data.customer?.id || null;
  }

  async function sendDraft() {
    if (!api || !selectedTableId || draft.length === 0) return;
    setSending(true);
    try {
      const customerId = await ensureCustomer();
      const items = draft.map((line) => ({
        product_id: line.product.id,
        quantity: line.quantity,
        special_instructions: line.note.trim() || undefined,
      }));
      if (currentOrder?.id) {
        await api.post(`/api/orders/${currentOrder.id}/items`, { items });
      } else {
        await api.post('/api/orders', {
          table_id: selectedTableId,
          customer_id: customerId,
          type: 'dine_in',
          items,
        }, { headers: { 'Idempotency-Key': `server-app-${Date.now()}-${selectedTableId}` } });
      }
      setDraft([]);
      setTicketOpen(false);
      await Promise.all([loadAll(), loadOrder(selectedTableId)]);
      toast.success(t('orderSent'));
    } catch (error: unknown) {
      toastApiError(error, t('couldNotSendOrder'), apiErrorT);
    } finally {
      setSending(false);
    }
  }

  async function advanceItem(item: OrderItem) {
    const next = nextKitchenItemStatus(item.status);
    if (!api || !next) return;
    setAdvancingItemId(item.id);
    try {
      await api.patch(`/api/order-items/${item.id}/status`, { status: next, expected_status: item.status });
      await loadOrder(selectedTableId);
    } catch {
      toast.error(t('statusUpdateFailed'));
    } finally {
      setAdvancingItemId(null);
    }
  }

  const activeTable = tables.find((table) => table.id === selectedTableId) || null;
  const tableName = (activeTable?.name?.trim() || (activeTable?.number != null ? String(activeTable.number) : '')).trim();
  const menuTitle = mobileView === 'menu' && tableName ? tableName : t('title');
  const filteredProducts = products.filter((product) => {
    const matchesCategory = selectedCategoryId === 'all' || product.category_id === selectedCategoryId;
    const matchesQuery = !query || product.name.toLowerCase().includes(query.toLowerCase());
    return matchesCategory && matchesQuery;
  });
  const draftTotal = draft.reduce((sum, line) => sum + Number(line.product.price || 0) * line.quantity, 0);
  const draftCount = draft.reduce((sum, line) => sum + line.quantity, 0);
  const ticketProps = {
    t,
    customerName,
    customerPhone,
    setCustomerName,
    setCustomerPhone,
    currentOrder,
    draft,
    changeQty,
    setDraft,
    draftTotal,
    sendDraft,
    selectedTableId,
    sending,
    advancingItemId,
    onAdvanceItem: advanceItem,
  };

  if (loading) {
    return <div className="flex h-dvh items-center justify-center"><div className="h-10 w-10 rounded-full border-4 border-brand border-t-transparent animate-spin" /></div>;
  }

  if (disabled) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <Smartphone size={44} className="text-gray-400" />
        <h1 className="text-lg font-semibold text-gray-900">{t('disabledTitle')}</h1>
        <p className="max-w-sm text-sm text-gray-500">{t('disabledHint')}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 text-center">
            <UserRound size={42} className="mx-auto mb-3 text-brand" />
            <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
            <p className="mt-1 text-sm text-gray-500">{t('loginSubtitle')}</p>
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{t('notAdminHint')}</p>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setLoginMode('pin')}
              className={`min-h-11 rounded-md text-sm font-medium ${loginMode === 'pin' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
            >
              {tAuth('pinTab')}
            </button>
            <button
              type="button"
              onClick={() => setLoginMode('email')}
              className={`min-h-11 rounded-md text-sm font-medium ${loginMode === 'email' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
            >
              {tAuth('emailTab')}
            </button>
          </div>
          {loginMode === 'pin' ? (
            <form onSubmit={handlePinLogin} className="space-y-3">
              <p className="text-center text-sm text-gray-500">{t('pinLoginHint')}</p>
              <div className="rounded-xl border border-gray-300 px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] text-gray-900" dir="ltr">
                {pin ? '•'.repeat(pin.length) : '••••'}
              </div>
              <div className="grid grid-cols-3 gap-2" dir="ltr">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((key) => (
                  <button
                    key={key}
                    type="button"
                    disabled={loginLoading}
                    onClick={() => {
                      if (key === 'C') setPin('');
                      else if (key === '⌫') setPin((current) => current.slice(0, -1));
                      else setPin((current) => (current + key).slice(0, 6));
                    }}
                    className="min-h-12 rounded-xl border border-gray-200 bg-white text-lg font-semibold text-gray-900 disabled:opacity-50"
                  >
                    {key === 'C' ? tAuth('pinClear') : key}
                  </button>
                ))}
              </div>
              <label className="flex min-h-12 items-center gap-3 text-base text-gray-600">
                <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className="size-6 rounded border-gray-300 text-brand focus:ring-brand" />
                {tAuth('rememberMe')}
              </label>
              <button disabled={loginLoading || pin.length < 4} className="h-14 w-full rounded-xl bg-brand text-lg font-semibold text-white disabled:opacity-60">
                {loginLoading ? tAuth('signingIn') : tAuth('pinLogin')}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-3">
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" dir="ltr" placeholder={t('emailPlaceholder')} required className="h-14 w-full rounded-xl border border-gray-300 bg-white px-4 text-lg text-gray-900 caret-gray-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder={tAuth('password')} required className="h-14 w-full rounded-xl border border-gray-300 bg-white px-4 text-lg text-gray-900 caret-gray-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
              <label className="flex min-h-12 items-center gap-3 text-base text-gray-600">
                <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className="size-6 rounded border-gray-300 text-brand focus:ring-brand" />
                {tAuth('rememberMe')}
              </label>
              <button disabled={loginLoading} className="h-14 w-full rounded-xl bg-brand text-lg font-semibold text-white disabled:opacity-60">
                {loginLoading ? tAuth('signingIn') : tAuth('signIn')}
              </button>
            </form>
          )}
          <p className="mt-4 text-center text-xs text-gray-500">{t('loginHint')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-slate-50 text-gray-900">
      <header className="relative z-20 shrink-0 border-b border-gray-200 bg-white/95 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="flex w-full min-w-0 items-center gap-2 sm:gap-3">
          {mobileView === 'menu' && (
            <button
              type="button"
              onClick={() => { setMobileView('tables'); setTicketOpen(false); }}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-600 md:hidden"
              aria-label={t('backToTables')}
            >
              <ArrowLeft size={22} className="rtl-flip" />
            </button>
          )}
          <div className={`${mobileView === 'menu' ? 'hidden md:flex' : 'flex'} h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand text-white`}>
            <ChefHat size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold leading-tight md:text-xl">{menuTitle}</h1>
            {!(mobileView === 'menu' && tableName) && (
              <p className="truncate text-sm text-gray-500">{tableName || t('selectTable')}</p>
            )}
          </div>
          <button type="button" onClick={() => loadAll().catch(() => toast.error(t('refreshFailed')))} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-600"><RefreshCw size={20} /></button>
          <button type="button" onClick={logout} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-600"><LogOut size={20} /></button>
        </div>
      </header>

      <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <section className={`${mobileView === 'tables' ? 'flex' : 'hidden'} min-h-0 w-full shrink-0 flex-col overflow-y-auto border-gray-200 bg-white p-4 md:flex md:w-56 md:border-e`}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{t('tables')}</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
            {tables.map((table) => {
              const selected = table.id === selectedTableId;
              const order = table.activeOrder || table.current_order;
              return (
                <button
                  key={table.id}
                  type="button"
                  onClick={() => {
                    setSelectedTableId(table.id);
                    setMobileView('menu');
                    setTicketOpen(false);
                  }}
                  className={`min-h-20 rounded-xl border px-4 py-4 text-start ${selected ? 'border-brand bg-brand/5' : 'border-gray-200 bg-white'}`}
                >
                  <span className="block truncate text-lg font-semibold">{table.name || table.number}</span>
                  <span className="text-sm text-gray-500">{order ? t('openOrder') : tTables('statusAvailable')}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className={`${mobileView === 'menu' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white md:flex`}>
          <div className="shrink-0 space-y-3 px-4 pt-4">
            <div className="relative min-w-0">
              <Search size={20} className="pointer-events-none absolute start-4 top-4 text-gray-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('searchMenu')} className="h-14 w-full rounded-xl border border-gray-200 bg-white ps-12 pe-4 text-lg text-gray-900 caret-gray-900 focus:border-brand focus:outline-none" />
            </div>
            <div className="flex min-h-12 min-w-0 max-w-full flex-nowrap gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-1 touch-pan-x [-webkit-overflow-scrolling:touch]">
              <button type="button" onClick={() => setSelectedCategoryId('all')} className={`h-12 shrink-0 whitespace-nowrap rounded-full px-5 text-base font-medium ${selectedCategoryId === 'all' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-700'}`}>{tOrders('all')}</button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setSelectedCategoryId(category.id)}
                  className={`h-12 shrink-0 whitespace-nowrap rounded-full px-5 text-base font-medium ${selectedCategoryId === category.id ? 'bg-brand text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addProduct(product)}
                  className="flex min-h-16 min-w-0 items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-4 text-start active:bg-brand/5 md:min-h-28 md:flex-col md:items-start"
                >
                  <span className="text-lg font-semibold leading-snug">{product.name}</span>
                  <span className="shrink-0 text-lg font-medium text-gray-600"><Ltr>{money(product.price)}</Ltr></span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="hidden min-h-0 w-80 shrink-0 overflow-y-auto border-s border-gray-200 bg-white p-4 xl:block">
          <TicketPanel {...ticketProps} />
        </section>
      </main>

      <div className={`${mobileView === 'menu' ? 'block' : 'hidden'} shrink-0 border-t border-gray-200 bg-white px-4 pt-3 md:block xl:hidden pb-[max(1rem,env(safe-area-inset-bottom))]`}>
          <button
            type="button"
            onClick={() => setTicketOpen(true)}
            className="flex h-16 w-full items-center justify-between rounded-xl bg-brand px-5 text-lg font-semibold text-white"
          >
            <span>{t('viewTicket', { count: draftCount })}</span>
            <span><Ltr>{money(draftTotal)}</Ltr></span>
          </button>
        </div>

      {ticketOpen && (
        <div className="fixed inset-0 z-40 xl:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label={t('hideTicket')}
            onClick={() => setTicketOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-auto rounded-t-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-lg font-semibold">{t('currentTicket')}</span>
              <button type="button" onClick={() => setTicketOpen(false)} className="h-12 rounded-xl px-4 text-base text-gray-600">
                {t('hideTicket')}
              </button>
            </div>
            <TicketPanel {...ticketProps} />
          </div>
        </div>
      )}
    </div>
  );
}

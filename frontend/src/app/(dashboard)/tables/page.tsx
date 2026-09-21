'use client';

import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';
import { Plus, X, Search, UserPlus, RotateCcw, Pencil, Trash2 } from 'lucide-react';
import type { Table, Hall, Customer, Order, OrderItem } from '@/lib/types';
import { useAuthStore } from '@/store/auth';
import { useRestrictBusinessType } from '@/components/layout/AuthGuard';
import { countryName } from '@/lib/countries';
import { parsePhone, dialCodeFor } from '@/lib/phone';
import { useTranslations, type AppConfig } from 'use-intl';
import { Ltr } from '@/components/layout/Ltr';
import { ORDER_STATUS_LABEL_KEYS, ITEM_STATUS_LABEL_KEYS, TABLE_STATUS_LABEL_KEYS } from '@/lib/i18n-enums';
import { toastApiError } from '@/lib/api-error';

const statusColors: Record<string, string> = {
  available: 'bg-green-500',
  occupied: 'bg-red-500',
  reserved: 'bg-purple-500',
  cleaning: 'bg-gray-500',
  held: 'bg-blue-500',
  precheck: 'bg-yellow-500',
};

type OrdersKey = keyof AppConfig['Messages']['orders'];

const itemStatusLabelKey = (status: OrderItem['status']): OrdersKey =>
  ITEM_STATUS_LABEL_KEYS[status] ?? 'itemStatusPending';

interface ReserveModalProps {
  table: Table;
  onClose: () => void;
  onDone: () => void;
}

function ReserveModal({ table, onClose, onDone }: ReserveModalProps) {
  const { currentTenant } = useAuthStore();
  const tTables = useTranslations('tables');
  const tPos = useTranslations('pos');
  const tNav = useTranslations('nav');
  const tSettings = useTranslations('settings');
  const tProducts = useTranslations('products');
  const dialCode = dialCodeFor(currentTenant?.country ?? 'IN') || '+91';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);


  const searchCustomers = (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/customers-search?q=${encodeURIComponent(q)}`);
        setResults(data.customers || []);
      } catch { setResults([]); }
    }, 300);
  };

  const handleCreateCustomer = async () => {
    if (!newName.trim() || !newPhone.trim()) return;
    const country = currentTenant?.country ?? 'IN';
    const parsed = parsePhone(newPhone, country);
    if (!parsed) {
      toast.error(tPos('invalidPhone', { country: countryName(country) }));
      return;
    }
    setCreating(true);
    try {
      const { data } = await api.post('/customers', { name: newName, phone: parsed.e164, country_code: parsed.countryCode });
      setSelected(data.customer);
      setShowCreate(false);
      setQuery('');
      setResults([]);
      toast.success(tPos('customerCreated'));
    } catch {
      toast.error(tPos('createCustomerFailed'));
    } finally {
      setCreating(false);
    }
  };

  const handleReserve = async () => {
    setSaving(true);
    try {
      await api.patch(`/tables/${table.id}/status`, {
        status: 'reserved',
        reservation_customer_id: selected?.id ?? null,
        reservation_customer_name: selected?.name ?? null,
        reservation_customer_phone: selected?.phone ?? null,
      });
      const msg = selected
        ? tTables('reservedFor', { name: table.name, customer: selected.name })
        : tTables('reservedNoCustomer', { name: table.name });
      toast.success(msg);
      onDone();
    } catch {
      toast.error(tTables('tableReserveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl p-6 w-full max-w-sm">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">{tNav('tables')} · {table.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-muted-foreground"><X size={20} /></button>
        </div>

        {selected ? (
          <div className="flex items-center justify-between px-3 py-2.5 bg-brand-light rounded-xl mb-4">
            <div>
              <p className="font-semibold text-brand text-sm">{selected.name}</p>
              <p className="text-xs text-brand/70"><Ltr>{selected.phone}</Ltr></p>
            </div>
            <button onClick={() => setSelected(null)} className="text-brand hover:text-brand-hover">
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="mb-4">
            <p className="text-sm text-muted-foreground mb-2">{tTables('linkCustomer')}</p>
            <div className="relative mb-2">
              <Search size={14} className="absolute start-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); searchCustomers(e.target.value); }}
                placeholder={tTables('searchCustomerPlaceholder')}
                className="w-full ps-8 pe-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-brand outline-none"
              />
            </div>
            {results.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden mb-2 max-h-36 overflow-y-auto">
                {results.map((c) => (
                  <button key={c.id} onClick={() => { setSelected(c); setQuery(''); setResults([]); }}
                    className="w-full text-start px-3 py-2 hover:bg-muted text-sm border-b border-border last:border-0">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-gray-400 ms-2 text-xs"><Ltr>{c.phone}</Ltr></span>
                  </button>
                ))}
              </div>
            )}
            {!showCreate ? (
              <button onClick={() => { setShowCreate(true); if (/^\d+$/.test(query.trim())) setNewPhone(query.trim()); }}
                className="flex items-center gap-1.5 text-sm text-brand font-medium hover:text-brand-hover">
                <UserPlus size={14} /> {tTables('newCustomer')}
              </button>
            ) : (
              <div className="space-y-2 border border-border rounded-xl p-3">
                <input type="text" placeholder={tProducts('nameLabel')} value={newName} onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-border rounded-lg outline-none focus:ring-1 focus:ring-brand" />
                <div className="flex items-stretch gap-2">

                  <input type="tel" inputMode="numeric" placeholder={`${dialCode} ${tSettings('phone')}`} value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg outline-none focus:ring-1 focus:ring-brand" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowCreate(false)} className="flex-1 py-1.5 text-sm border border-border rounded-lg hover:bg-muted">{tTables('cancel')}</button>
                  <button onClick={handleCreateCustomer} disabled={creating || !newName.trim() || !newPhone.trim()}
                    className="flex-1 py-1.5 text-sm bg-brand text-white rounded-lg hover:opacity-90 disabled:opacity-50">
                    {creating ? tTables('creating') : tTables('create')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">{tTables('cancel')}</Button>
          <Button onClick={handleReserve} disabled={saving} className="flex-1">
            {saving ? tTables('reserving') : tTables('reserveTable')}
          </Button>
        </div>
      </div>
    </div>
  );
}

const itemStatusColors: Record<string, { bg: string; text: string; dot: string }> = {
  pending: { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-400' },
  preparing: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  ready: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  served: { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  cancelled: { bg: 'bg-red-50', text: 'text-red-500', dot: 'bg-red-400' },
  voided: { bg: 'bg-red-50', text: 'text-red-500', dot: 'bg-red-400' },
  void_adjustment: { bg: 'bg-red-50', text: 'text-red-500', dot: 'bg-red-400' },
};

export default function TablesPage() {
  const allowed = useRestrictBusinessType('restaurant', '/pos');
  const tTables = useTranslations('tables');
  const tOrders = useTranslations('orders');
  const tableErrorT = (key: string) => {
    if (key === 'apiError.table_number_exists_in_hall') return tTables('tableNumberExistsInHall');
    if (key === 'apiError.table_number_inactive_in_hall') return tTables('tableNumberInactiveInHall');
    if (key === 'apiError.table_number_exists_in_target_hall') return tTables('hallReassignNumberConflict');
    return key;
  };
  const [tables, setTables] = useState<Table[]>([]);
  const [halls, setHalls] = useState<Hall[]>([]);
  const [selectedHallId, setSelectedHallId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showHallForm, setShowHallForm] = useState(false);
  const [editingHall, setEditingHall] = useState<Hall | null>(null);
  const [deletingHall, setDeletingHall] = useState<Hall | null>(null);
  const [reassignHallId, setReassignHallId] = useState('');
  const [hallName, setHallName] = useState('');
  const [reservingTable, setReservingTable] = useState<Table | null>(null);
  const [form, setForm] = useState({ name: '', capacity: '4', hall_id: '' });
  const [showDetails, setShowDetails] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('tables_showDetails');
      return stored !== null ? stored === 'true' : true;
    }
    return true;
  });

  const toggleDetails = () => {
    const next = !showDetails;
    setShowDetails(next);
    localStorage.setItem('tables_showDetails', String(next));
  };

  const fetchTables = async () => {
    try {
      const [tablesRes, hallsRes] = await Promise.all([
        api.get('/tables'),
        api.get('/halls'),
      ]);
      const nextHalls: Hall[] = hallsRes.data.halls || [];
      setTables(tablesRes.data.tables || []);
      setHalls(nextHalls);
      setSelectedHallId((current) => {
        if (current && nextHalls.some((hall) => hall.id === current)) return current;
        return nextHalls[0]?.id ?? null;
      });
    } catch {
      toast.error(tTables('loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let initial = true;
    const load = () => {
      Promise.all([api.get('/tables'), api.get('/halls')])
        .then(([tablesRes, hallsRes]) => {
          const nextHalls: Hall[] = hallsRes.data.halls || [];
          setTables(tablesRes.data.tables || []);
          setHalls(nextHalls);
          setSelectedHallId((current) => {
            if (current && nextHalls.some((hall) => hall.id === current)) return current;
            return nextHalls[0]?.id ?? null;
          });
        })
        .catch(() => {
          // Interval polls should stay quiet when the floor is already on screen
          // (same pattern as order details below) so a blip doesn't cover the header.
          if (initial) toast.error(tTables('loadFailed'));
        })
        .finally(() => {
          initial = false;
          setLoading(false);
        });
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear stale orders the moment details get hidden, read directly during render (React's
  // recommended pattern for "adjusting state when a prop changes") so the effect below only
  // needs to own the polling subscription.
  const [syncedShowDetails, setSyncedShowDetails] = useState(showDetails);
  if (showDetails !== syncedShowDetails) {
    setSyncedShowDetails(showDetails);
    if (!showDetails) setOrders([]);
  }

  useEffect(() => {
    if (!showDetails) return;
    const fetchOrders = () => {
      api.get('/orders', { params: { status: 'pending,preparing,ready,served', per_page: 500 } })
        .then(({ data }) => setOrders(data.orders || []))
        .catch(() => {
          // silently fail — tables still show
        });
    };
    fetchOrders();
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, [showDetails]);

  // Group active orders by table_id
  const ordersByTable = new Map<string, Order[]>();
  if (showDetails) {
    for (const order of orders) {
      if (!order.table_id) continue;
      const tableKey = String(order.table_id);
      const existing = ordersByTable.get(tableKey);
      if (existing) existing.push(order);
      else ordersByTable.set(tableKey, [order]);
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/tables', { ...form, capacity: Number(form.capacity) });
      toast.success(tTables('tableCreated'));
      setShowForm(false);
      setForm({ name: '', capacity: '4', hall_id: selectedHallId || halls[0]?.id || '' });
      fetchTables();
    } catch (err) {
      toastApiError(err, tTables('tableCreateFailed'), tableErrorT);
    }
  };

  const handleSaveHall = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = hallName.trim();
    if (!name) {
      toast.error(tTables('hallNameRequired'));
      return;
    }
    try {
      if (editingHall) {
        await api.put(`/halls/${editingHall.id}`, { name });
        toast.success(tTables('hallRenamed'));
      } else {
        await api.post('/halls', { name });
        toast.success(tTables('hallCreated'));
      }
      setShowHallForm(false);
      setEditingHall(null);
      setHallName('');
      fetchTables();
    } catch {
      toast.error(editingHall ? tTables('hallRenameFailed') : tTables('hallCreateFailed'));
    }
  };

  const handleDeleteHall = async () => {
    if (!deletingHall) return;
    const tableCount = Number(deletingHall.table_count || 0);
    try {
      await api.delete(`/halls/${deletingHall.id}`, {
        data: tableCount > 0 ? { reassign_to_hall_id: reassignHallId } : {},
      });
      toast.success(tTables('hallDeleted'));
      setDeletingHall(null);
      setReassignHallId('');
      fetchTables();
    } catch (err) {
      toastApiError(err, tTables('hallDeleteFailed'), tableErrorT);
    }
  };

  const visibleTables = selectedHallId
    ? tables.filter((table) => table.hall_id === selectedHallId || (!table.hall_id && halls.find((hall) => hall.id === selectedHallId)?.is_default))
    : tables;

  const updateStatus = async (id: string, status: string) => {
    try {
      await api.patch(`/tables/${id}/status`, { status });
      fetchTables();
    } catch {
      toast.error(tTables('tableUpdateFailed'));
    }
  };

  const toggleActive = async (table: Table) => {
    try {
      await api.post(`/tables/${table.id}/${table.is_active ? 'deactivate' : 'reactivate'}`);
      fetchTables();
    } catch {
      toast.error(tTables('updateStatusFailed'));
    }
  };

  if (!allowed) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground shrink-0">{tTables('title')}</h1>
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
          <label className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showDetails}
              onChange={toggleDetails}
              className="w-4 h-4 shrink-0 rounded border-gray-300 dark:border-border text-brand focus:ring-brand"
            />
            <span className="leading-snug">{tTables('showOrderDetails')}</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => { setEditingHall(null); setHallName(''); setShowHallForm(true); }}>
              <Plus size={16} className="me-1" /> {tTables('addHall')}
            </Button>
            <Button onClick={() => { setForm({ name: '', capacity: '4', hall_id: selectedHallId || halls[0]?.id || '' }); setShowForm(true); }}>
              <Plus size={16} className="me-1" /> {tTables('addTable')}
            </Button>
          </div>
        </div>
      </div>

      {halls.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {halls.map((hall) => {
            const selected = hall.id === selectedHallId;
            return (
              <div key={hall.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSelectedHallId(hall.id)}
                  className={`h-9 shrink-0 rounded-full px-3 text-sm font-medium ${
                    selected ? 'bg-brand text-white' : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {hall.name}
                </button>
                {selected && (
                  <>
                    <button
                      type="button"
                      onClick={() => { setEditingHall(hall); setHallName(hall.name); setShowHallForm(true); }}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={tTables('renameHall')}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeletingHall(hall);
                        setReassignHallId(halls.find((item) => item.id !== hall.id)?.id || '');
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-red-50 hover:text-red-600"
                      aria-label={tTables('deleteHall')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showDetails ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleTables.map((table) => {
            const tableOrders = ordersByTable.get(table.id) || [];
            const hasOrders = tableOrders.length > 0;

            return (
              <div key={table.id}
                className={`bg-card rounded-xl border border-border hover:shadow-md transition-shadow ${
                  hasOrders ? 'border-s-4 border-s-brand' : ''
                } ${!table.is_active ? 'opacity-60' : ''}`}>
                {/* Table header */}
                <div className="px-3 py-3 sm:px-4 border-b border-border flex items-center justify-between gap-2 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-3 h-3 shrink-0 rounded-full ${statusColors[table.status]}`} />
                    <h3 className="font-bold text-foreground truncate">{table.name}</h3>
                    <span className="text-xs text-gray-400 shrink-0">· {tTables('capacitySeats', { count: table.capacity })}</span>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{tTables(TABLE_STATUS_LABEL_KEYS[table.status])}</span>
                </div>

                {/* Orders section */}
                {hasOrders ? (
                  <div className="px-4 py-3 space-y-3">
                    {tableOrders.map((order) => (
                      <div key={order.id} className="bg-muted rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-foreground">#<Ltr>{order.order_number}</Ltr></span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            order.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                            order.status === 'preparing' ? 'bg-blue-100 text-blue-700' :
                            order.status === 'ready' ? 'bg-green-100 text-green-700' :
                            order.status === 'served' ? 'bg-purple-100 text-purple-700' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {tOrders(ORDER_STATUS_LABEL_KEYS[order.status])}
                          </span>
                        </div>
                        {order.customer?.name && (
                          <p className="text-xs text-muted-foreground mb-1.5">{order.customer.name}</p>
                        )}
                        <div className="space-y-1">
                          {order.items?.filter(i => i.status !== 'cancelled').map((item) => {
                            const sc = itemStatusColors[item.status] || itemStatusColors.pending;
                            return (
                              <div key={item.id} className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${sc.bg}`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${sc.dot} flex-shrink-0`} />
                                <span className="flex-1 truncate text-foreground">{item.product_name}</span>
                                <span className="text-muted-foreground">×{item.quantity}</span>
                                <span className={`font-medium capitalize ${sc.text}`}>{tOrders(itemStatusLabelKey(item.status))}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-4 text-center text-xs text-gray-400">
                    {tTables('noActiveOrders')}
                  </div>
                )}

                {/* Actions */}
                <div className="px-3 py-2 sm:px-4 border-t border-border flex flex-wrap justify-end gap-2">
                  {(table.status === 'occupied' || table.status === 'reserved' || table.status === 'precheck') && (
                    <button onClick={() => updateStatus(table.id, 'available')}
                      className="text-xs text-brand hover:text-brand-hover font-medium">
                      {tTables('markAvailable')}
                    </button>
                  )}
                  {table.status === 'available' && (
                    <button onClick={() => setReservingTable(table)}
                      className="text-xs text-yellow-600 hover:text-yellow-700 font-medium">
                      {tTables('reserve')}
                    </button>
                  )}
                  <button onClick={() => toggleActive(table)}
                    className={`text-xs font-medium flex items-center gap-1 ${!table.is_active ? 'text-green-600 hover:text-green-700' : 'text-red-500 hover:text-red-700'}`}>
                    {!table.is_active ? <><RotateCcw size={12} /> {tTables('reactivate')}</> : tTables('deactivate')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {visibleTables.map((table) => (
            <div key={table.id}
              className={`bg-card rounded-xl p-5 border border-border text-center hover:shadow-md transition-shadow ${!table.is_active ? 'opacity-60' : ''}`}>
              <div className={`w-3 h-3 rounded-full ${statusColors[table.status]} mx-auto mb-3`} />
              <h3 className="font-bold text-lg text-foreground">{table.name}</h3>
              <p className="text-sm text-muted-foreground">{tTables('capacitySeats', { count: table.capacity })}</p>
              <p className="text-xs text-gray-400 mt-1">{tTables(TABLE_STATUS_LABEL_KEYS[table.status])}</p>
              {table.hall_name && <p className="text-xs text-gray-400">{table.hall_name}</p>}
              {table.status === 'reserved' && table.reservation_customer_name && (
                <p className="text-xs text-yellow-700 font-medium mt-1 truncate">{table.reservation_customer_name}</p>
              )}
              {table.status === 'reserved' && table.reservation_customer_phone && (
                <p className="text-xs text-yellow-600 mt-0.5"><Ltr>{table.reservation_customer_phone}</Ltr></p>
              )}

              {(table.status === 'occupied' || table.status === 'reserved' || table.status === 'precheck') && (
                <button onClick={() => updateStatus(table.id, 'available')}
                  className="mt-3 text-xs text-brand hover:text-brand-hover font-medium">
                  {tTables('markAvailable')}
                </button>
              )}
              {table.status === 'available' && (
                <button onClick={() => setReservingTable(table)}
                  className="mt-3 text-xs text-yellow-600 hover:text-yellow-700 font-medium">
                  {tTables('reserve')}
                </button>
              )}
              <button onClick={() => toggleActive(table)}
                className={`mt-2 block mx-auto text-xs font-medium ${!table.is_active ? 'text-green-600 hover:text-green-700' : 'text-red-500 hover:text-red-700'}`}>
                {!table.is_active ? tTables('reactivate') : tTables('deactivate')}
              </button>
            </div>
          ))}
        </div>
      )}

      {visibleTables.length === 0 && (
        <p className="text-center text-muted-foreground py-12">{tables.length === 0 ? tTables('noTablesYet') : tTables('noTablesInHall')}</p>
      )}

      {/* Reserve Modal */}
      {reservingTable && (
        <ReserveModal
          table={reservingTable}
          onClose={() => setReservingTable(null)}
          onDone={() => { setReservingTable(null); fetchTables(); }}
        />
      )}

      {/* Add Table Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-2xl p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">{tTables('add')}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-muted-foreground"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">{tTables('tableName')}</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={tTables('tableNamePlaceholder')} className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg outline-none focus:ring-2 focus:ring-brand" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{tTables('capacity')}</label>
                  <input type="number" min="1" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg outline-none focus:ring-2 focus:ring-brand" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{tTables('hall')}</label>
                  <select
                    value={form.hall_id}
                    onChange={(e) => setForm({ ...form, hall_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg outline-none focus:ring-2 focus:ring-brand bg-card"
                    required
                  >
                    {halls.map((hall) => (
                      <option key={hall.id} value={hall.id}>{hall.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <Button type="submit" className="w-full">{tTables('createTable')}</Button>
            </form>
          </div>
        </div>
      )}

      {showHallForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">{editingHall ? tTables('renameHall') : tTables('addHall')}</h2>
              <button onClick={() => { setShowHallForm(false); setEditingHall(null); }} className="text-gray-400 hover:text-muted-foreground"><X size={20} /></button>
            </div>
            <form onSubmit={handleSaveHall} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">{tTables('hallName')}</label>
                <input
                  type="text"
                  value={hallName}
                  onChange={(e) => setHallName(e.target.value)}
                  placeholder={tTables('hallNamePlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg outline-none focus:ring-2 focus:ring-brand"
                  required
                />
              </div>
              <Button type="submit" className="w-full">{editingHall ? tTables('saveHall') : tTables('createHall')}</Button>
            </form>
          </div>
        </div>
      )}

      {deletingHall && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">{tTables('deleteHall')}</h2>
              <button onClick={() => setDeletingHall(null)} className="text-gray-400 hover:text-muted-foreground"><X size={20} /></button>
            </div>
            {Number(deletingHall.table_count || 0) > 0 ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">{tTables('hallNotEmptyHint', { count: Number(deletingHall.table_count || 0) })}</p>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{tTables('moveTablesTo')}</label>
                  <select
                    value={reassignHallId}
                    onChange={(e) => setReassignHallId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-lg outline-none focus:ring-2 focus:ring-brand bg-card"
                  >
                    {halls.filter((hall) => hall.id !== deletingHall.id).map((hall) => (
                      <option key={hall.id} value={hall.id}>{hall.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setDeletingHall(null)} className="flex-1">{tTables('cancel')}</Button>
                  <Button onClick={handleDeleteHall} disabled={!reassignHallId} className="flex-1">{tTables('reassignAndDelete')}</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">{tTables('deleteHallConfirm', { name: deletingHall.name })}</p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setDeletingHall(null)} className="flex-1">{tTables('cancel')}</Button>
                  <Button onClick={handleDeleteHall} className="flex-1">{tTables('deleteHall')}</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

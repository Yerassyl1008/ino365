'use client';

import { useState, useEffect } from 'react';
import { X, ShoppingCart, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TaxBreakdown from '@/components/pos/TaxBreakdown';
import api from '@/lib/api';
import { useTranslations } from 'use-intl';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import toast from 'react-hot-toast';
import type { Table, Order, Bill, OrderItem } from '@/lib/types';
import { SplitCheckModal } from '@/components/pos/SplitCheckModal';
import { useAuthStore } from '@/store/auth';
import { ROLE_ACCESS, hasRole } from '@shared/role-permissions';

interface Props {
  table: Table;
  currency: string;
  cartItemCount: number;
  onClose: () => void;
  onAddItems: (table: Table, order: Order) => void;
  onPayment: (bill: Bill) => void;
  onAddCartToOrder?: (table: Table, order: Order) => void;
  onFloorChanged?: () => void;
}

export default function TableCheckoutModal({
  table,
  cartItemCount,
  onClose,
  onAddItems,
  onPayment,
  onAddCartToOrder,
  onFloorChanged,
}: Props) {
  const t = useTranslations('pos');
  const fmt = useFormatCurrency();
  const { currentTenant } = useAuthStore();
  const canCheckout = hasRole(currentTenant?.role, ROLE_ACCESS.ownerManagerCashier);
  const formatItemTotal = (value: unknown, fallback: unknown) => {
    const total = Number(value);
    if (Number.isFinite(total)) return fmt(total);
    const subtotal = Number(fallback);
    return fmt(Number.isFinite(subtotal) ? subtotal : 0);
  };
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [addingItems, setAddingItems] = useState(false);
  const [splitChecksEnabled, setSplitChecksEnabled] = useState(false);
  const [splitBill, setSplitBill] = useState<Bill | null>(null);
  const [advancingItemId, setAdvancingItemId] = useState<number | null>(null);
  const [floorTables, setFloorTables] = useState<Table[]>([]);
  const [targetTableId, setTargetTableId] = useState('');
  const [managerPin, setManagerPin] = useState('');
  const [showCancelPrecheck, setShowCancelPrecheck] = useState(false);
  const isPrecheck = table.status === 'precheck';

  useEffect(() => {
    const controller = new AbortController();
    const fetchOrder = async () => {
      try {
        const { data } = await api.get(`/tables/${table.id}`, { signal: controller.signal });
        const tbl = data.table;
        const activeOrder = tbl.activeOrder || tbl.current_order;
        if (activeOrder) {
          const orderRes = await api.get(`/orders/${activeOrder.id}`, { signal: controller.signal });
          setOrder(orderRes.data.order);
        }
      } catch {
        if (controller.signal.aborted) return;
        toast.error(t('loadOrderFailed'));
      } finally {
        setLoading(false);
      }
    };
    fetchOrder();
    return () => controller.abort();
  }, [table.id, t]);

  useEffect(() => {
    api.get('/settings/split_checks_enabled').then((res) => setSplitChecksEnabled(res.data?.setting?.value === 'true')).catch(() => setSplitChecksEnabled(false));
  }, []);

  useEffect(() => {
    api.get('/tables?active=1').then((res) => setFloorTables(res.data?.tables || [])).catch(() => setFloorTables([]));
  }, []);

  const handleCheckout = async () => {
    if (!order || !canCheckout) return;
    setGenerating(true);
    try {
      if (order.bill) {
        onPayment(order.bill);
        return;
      }
      const { data } = await api.post('/bills/generate', { order_id: order.id });
      onPayment(data.bill);
    } catch {
      toast.error(t('generateBillFailed'));
    } finally {
      setGenerating(false);
    }
  };

  const handlePrecheck = async () => {
    if (!order) return;
    setGenerating(true);
    try {
      await api.post(`/orders/${order.id}/precheck`);
      toast.success(t('precheckPrinted'));
      onFloorChanged?.();
      onClose();
    } catch {
      toast.error(t('precheckFailed'));
    } finally {
      setGenerating(false);
    }
  };

  const handleCancelPrecheck = async () => {
    if (!order) return;
    if (!managerPin) {
      toast.error(t('managerPinRequired'));
      return;
    }
    setGenerating(true);
    try {
      await api.post(`/orders/${order.id}/cancel-precheck`, { override_pin: managerPin });
      setShowCancelPrecheck(false);
      setManagerPin('');
      onFloorChanged?.();
      onClose();
    } catch {
      toast.error(t('cancelPrecheckFailed'));
    } finally {
      setGenerating(false);
    }
  };

  const handleTransfer = async () => {
    if (!targetTableId) return;
    setGenerating(true);
    try {
      await api.post(`/tables/${table.id}/move-order`, { target_table_id: targetTableId, order_id: order?.id });
      onFloorChanged?.();
      onClose();
    } catch {
      toast.error(t('transferFailed'));
    } finally {
      setGenerating(false);
    }
  };

  const handleMerge = async () => {
    if (!targetTableId) return;
    setGenerating(true);
    try {
      await api.post(`/tables/${table.id}/merge-order`, { source_table_id: targetTableId });
      onFloorChanged?.();
      onClose();
    } catch {
      toast.error(t('mergeFailed'));
    } finally {
      setGenerating(false);
    }
  };

  const handleSplitCheck = async () => {
    if (!order || !canCheckout) return;
    setGenerating(true);
    try {
      const bill = order.bill || (await api.post('/bills/generate', { order_id: order.id })).data.bill;
      setSplitBill(bill);
    } catch {
      toast.error(t('generateBillFailed'));
    }
    finally { setGenerating(false); }
  };

  const handleAddCartToOrder = async () => {
    if (!order || !onAddCartToOrder) return;
    setAddingItems(true);
    try {
      await onAddCartToOrder(table, order);
    } catch {
      toast.error(t('addItemsFailed'));
    } finally {
      setAddingItems(false);
    }
  };

  const handleAdvanceKitchenItem = async (item: OrderItem) => {
    const next = item.status === 'pending' ? 'preparing' : item.status === 'preparing' ? 'ready' : item.status === 'ready' ? 'served' : null;
    if (!next || !order) return;
    setAdvancingItemId(item.id);
    try {
      await api.patch(`/order-items/${item.id}/status`, { status: next, expected_status: item.status });
      const orderRes = await api.get(`/orders/${order.id}`);
      setOrder(orderRes.data.order);
    } catch {
      toast.error(t('statusUpdateFailed'));
    } finally {
      setAdvancingItemId(null);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-card rounded-2xl p-8">
          <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-card rounded-2xl p-6 w-full max-w-md">
          <p className="text-muted-foreground text-center py-4">{t('noActiveOrder')}</p>
          <Button onClick={onClose} variant="outline" className="w-full">{t('close')}</Button>
        </div>
      </div>
    );
  }

  const activeItems = (order.items || []).filter((item: OrderItem) => item.status !== 'cancelled');
  const splitBills = (order.bills || []).filter((bill) => Boolean(bill.split_group_id));
  const stayStarted = table.stay_started_at || order.created_at;
  const stayMins = stayStarted ? Math.max(0, Math.floor((Date.now() - new Date(stayStarted).getTime()) / 60000)) : 0;
  const stayText = stayMins < 60
    ? t('stayMinutes', { count: stayMins })
    : t('stayHours', { hours: Math.floor(stayMins / 60), minutes: stayMins % 60 });
  const availableTables = floorTables.filter((row) => row.id !== table.id && row.status === 'available');
  const mergeTables = floorTables.filter((row) => row.id !== table.id && row.status === 'occupied');

  return (
    <>
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="flex justify-between items-center p-5 border-b border-border">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-foreground">{table.name}</h2>
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                isPrecheck
                  ? 'bg-yellow-100 text-yellow-800'
                  : order.bill?.payment_status === 'paid'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
              }`}>
                {isPrecheck ? t('awaitingPayment') : order.bill?.payment_status === 'paid' ? t('paid') : t('unpaid')}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{t('orderNumber', { number: order.order_number })} · {stayText}</p>
          </div>
          <button onClick={onClose} className="touch-target rounded-full text-gray-400 hover:text-muted-foreground active:bg-muted" aria-label={t('close')}>
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-3">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">{t('previousItems')}</p>
            <div className="space-y-1">
              {activeItems.map((item) => {
                const next = item.status === 'pending' ? 'preparing' : item.status === 'preparing' ? 'ready' : item.status === 'ready' ? 'served' : null;
                const label = next === 'preparing' ? t('markPreparing') : next === 'ready' ? t('markReady') : next === 'served' ? t('markServed') : null;
                return (
                  <div key={item.id} className="flex items-center gap-2 py-1.5 px-2 bg-muted rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground font-medium">
                        {item.quantity}x {item.product_name}
                      </p>
                      {(item.guest_seat || item.course) && (
                        <p className="text-[10px] text-muted-foreground">
                          {t('guestSeat', { seat: item.guest_seat || 1 })} · {t('course', { course: item.course || 1 })}
                        </p>
                      )}
                      {item.special_instructions && (
                        <p className="text-xs text-gray-400 italic">{item.special_instructions}</p>
                      )}
                    </div>
                    {label ? (
                      <button
                        type="button"
                        disabled={advancingItemId === item.id}
                        onClick={() => handleAdvanceKitchenItem(item)}
                        className="h-11 shrink-0 rounded-md bg-brand px-3 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {label}
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground ms-2 font-medium">
                        {formatItemTotal(item.total, item.subtotal)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-border space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('subtotal')}</span>
            <span>{fmt(Number(order.subtotal))}</span>
          </div>
          <TaxBreakdown
            taxAmount={Number(order.tax_amount)}
            taxBreakdown={order.tax_breakdown}
            theme="light"
          />
          {Number(order.service_charge) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('serviceCharge')}</span>
              <span>{fmt(Number(order.service_charge))}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold">
            <span>{t('total')}</span>
            <span className="text-brand">{fmt(Number(order.total))}</span>
          </div>
          {order.bill && order.bill.payment_status !== 'paid' && Number(order.bill.balance) > 0 && (
            <div className="flex justify-between text-sm font-medium">
              <span className="text-orange-600">{t('balanceDue')}</span>
              <span className="text-orange-600">{fmt(Number(order.bill.balance))}</span>
            </div>
          )}

          {splitBills.length > 0 && <div className="space-y-2">{splitBills.map((bill) => <div key={bill.id} className="flex items-center justify-between rounded-lg border p-2"><div><p className="text-sm font-medium">{bill.split_label}</p><p className="text-xs text-muted-foreground">{fmt(Number(bill.total))} · {bill.payment_status}</p></div>{bill.payment_status !== 'paid' && canCheckout && <Button size="sm" onClick={() => onPayment(bill)}>{t('pay')}</Button>}</div>)}</div>}

          {splitBills.length === 0 && splitChecksEnabled && canCheckout && order.type === 'dine_in' && order.bill?.payment_status !== 'paid' && <Button variant="outline" onClick={handleSplitCheck} disabled={generating} className="w-full"><Users size={15} className="me-2" />{t('splitCheck')}</Button>}

          <div className="grid grid-cols-2 gap-2">
            <select
              value={targetTableId}
              onChange={(e) => setTargetTableId(e.target.value)}
              className="col-span-2 min-h-11 rounded-lg border border-border bg-card px-3 text-sm"
            >
              <option value="">{t('selectTargetTable')}</option>
              {availableTables.map((row) => (
                <option key={`move-${row.id}`} value={row.id}>{row.name} · {t('tableLegendFree')}</option>
              ))}
              {mergeTables.map((row) => (
                <option key={`merge-${row.id}`} value={row.id}>{row.name} · {t('tableLegendOccupied')}</option>
              ))}
            </select>
            <Button variant="outline" disabled={generating || !availableTables.some((row) => row.id === targetTableId)} onClick={handleTransfer}>
              {t('transferTable')}
            </Button>
            <Button variant="outline" disabled={generating || isPrecheck || !mergeTables.some((row) => row.id === targetTableId)} onClick={handleMerge}>
              {t('mergeTables')}
            </Button>
          </div>

          {isPrecheck && (
            showCancelPrecheck ? (
              <div className="space-y-2">
                <input
                  type="password"
                  inputMode="numeric"
                  value={managerPin}
                  onChange={(e) => setManagerPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder={t('managerPin')}
                  className="w-full min-h-11 rounded-lg border border-border px-3 text-sm"
                />
                <Button variant="outline" disabled={generating} onClick={handleCancelPrecheck} className="w-full">
                  {t('cancelPrecheck')}
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={() => setShowCancelPrecheck(true)} className="w-full">
                {t('cancelPrecheck')}
              </Button>
            )
          )}

          {cartItemCount > 0 ? (
            <div className="space-y-2">
              <Button
                onClick={handleAddCartToOrder}
                disabled={addingItems}
                className="w-full"
                size="lg"
              >
                <ShoppingCart size={16} className="me-2" />
                {addingItems ? t('adding') : t('addToOrder', { count: cartItemCount })}
              </Button>
              {!isPrecheck && (
                <Button onClick={handlePrecheck} variant="outline" className="w-full" disabled={generating}>
                  {generating ? t('generating') : t('printPrecheck')}
                </Button>
              )}
              {canCheckout && (
                <Button onClick={handleCheckout} variant="outline" className="w-full" disabled={generating}>
                  {generating ? t('generating') : t('checkoutInstead')}
                </Button>
              )}
            </div>
          ) : splitBills.length === 0 ? (
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => onAddItems(table, order)}>
                {t('addItems')}
              </Button>
              {canCheckout ? (
                <Button onClick={handleCheckout} disabled={generating}>
                  {generating ? t('generating') : t('checkout')}
                </Button>
              ) : (
                <Button onClick={handlePrecheck} disabled={generating || isPrecheck}>
                  {generating ? t('generating') : t('printPrecheck')}
                </Button>
              )}
            </div>
          ) : null}
          {canCheckout && !isPrecheck && splitBills.length === 0 && cartItemCount === 0 && (
            <Button variant="outline" onClick={handlePrecheck} disabled={generating} className="w-full">
              {t('printPrecheck')}
            </Button>
          )}
          {!canCheckout && (
            <p className="text-xs text-muted-foreground text-center">{t('checkoutCashierOnly')}</p>
          )}
        </div>
      </div>
    </div>
    {splitBill && <SplitCheckModal bill={splitBill} order={order} onClose={() => setSplitBill(null)} onSplit={(bills) => { setOrder({ ...order, bill: bills[0], bills }); setSplitBill(null); }} />}
    </>
  );
}

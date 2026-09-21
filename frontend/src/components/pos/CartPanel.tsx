'use client';

import {
  ShoppingCart, UtensilsCrossed, Package, Truck, Globe,
  Plus, Minus, Trash2, Pause, MapPin, SquarePen,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/store/cart';
import { heldOrderErrorMessage, useHeldOrdersStore } from '@/store/held-orders';
import { useAuthStore } from '@/store/auth';
import { usePosSettingsStore } from '@/store/pos-settings';
import { useTranslations } from 'use-intl';
import toast from 'react-hot-toast';
import type { Table, Order, OrderItem, CartItem } from '@/lib/types';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import DishPrice from './DishPrice';
import { catalogLineDiscount, visibleDishPrices } from '@shared/dish-discount';

interface Props {
  tables: Table[];
  currency: string;
  submitting: boolean;
  onPlaceOrder: () => void;
  onShowTablePicker: () => void;
  onEditItem?: (item: CartItem) => void;
  variant?: 'sidebar' | 'drawer';
  existingOrder?: Order | null;
  advancingItemId?: number | null;
  onAdvanceKitchenItem?: (item: OrderItem) => void;
  /** Floor plan already has order-type tabs — hide the duplicate cart bar. */
  hideOrderTypeTabs?: boolean;
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

const orderTypeIcons = {
  dine_in: UtensilsCrossed,
  takeaway: Package,
  delivery: Truck,
  online: Globe,
};

export default function CartPanel({ tables, submitting, onPlaceOrder, onEditItem, variant = 'sidebar', existingOrder, advancingItemId, onAdvanceKitchenItem, hideOrderTypeTabs = false }: Props) {
  const cart = useCartStore();
  const heldOrders = useHeldOrdersStore();
  const { currentTenant } = useAuthStore();
  const billingType = usePosSettingsStore((s) => s.billingType);
  const t = useTranslations('pos');
  const tCommon = useTranslations('common');
  const isRestaurant = (currentTenant?.business_type ?? 'restaurant') === 'restaurant';
  const fmt = useFormatCurrency();
  const canHold = isRestaurant && cart.orderType === 'dine_in' && cart.tableId && cart.items.length > 0 && billingType === 'postpaid';

  const handleHold = async () => {
    if (!cart.tableId) {
      toast.error(t('selectTableFirst'));
      return;
    }
    if (cart.items.length === 0) {
      toast.error(t('cartEmpty'));
      return;
    }
    const tableName = tables.find((t) => t.id === cart.tableId)?.name || cart.tableId;
    try {
      await heldOrders.holdOrder(cart.tableId, cart.items, cart.customerId, cart.guestCount, cart.orderNotes);
      cart.clearCart();
      toast.success(t('orderHeldFor', { table: tableName }));
    } catch (err) {
      toast.error(heldOrderErrorMessage(err, t('holdOrderFailed')));
    }
  };

  const isDrawer = variant === 'drawer';
  const showDineInExtras = !hideOrderTypeTabs && cart.orderType === 'dine_in';
  const showDelivery = !hideOrderTypeTabs && cart.orderType === 'delivery';
  const showOnline = !hideOrderTypeTabs && cart.orderType === 'online';
  const showOrderHeader = !hideOrderTypeTabs || showDineInExtras || showDelivery || showOnline;

  return (
    <div className={
      isDrawer
        ? 'flex flex-col w-full'
        : 'w-full h-full bg-card rounded-xl border border-border dark:border-border flex flex-col shadow-sm'
    }>
      {/* Order Type */}
      {showOrderHeader && (
      <div className="p-4 border-b border-border dark:border-border space-y-2">
        {!hideOrderTypeTabs && (
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {(['dine_in', 'takeaway', 'delivery', 'online'] as const)
            .filter((type) => isRestaurant || type !== 'dine_in')
            .map((type) => {
              const Icon = orderTypeIcons[type];
              const label = type === 'dine_in' ? t('orderTypeDineIn') : type === 'takeaway' ? t('orderTypeTakeaway') : type === 'delivery' ? t('orderTypeDelivery') : t('orderTypeOnline');
              return (
                <button
                  key={type}
                  onClick={() => cart.setOrderType(type)}
                  className={`touch-target flex-1 gap-1 px-2 rounded-md text-xs font-medium transition-colors ${
                    cart.orderType === type
                      ? 'bg-card text-brand shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </button>
              );
            })}
        </div>
        )}

        {showDineInExtras && (
          <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Users size={15} /><span>{t('pax')}</span></div>
            <div className="flex items-center gap-2">
              <button type="button" aria-label={t('decreasePax')} onClick={() => cart.setGuestCount(Math.max(1, cart.guestCount - 1))} className="touch-target rounded-full bg-muted"><Minus size={15} /></button>
              <input aria-label={t('pax')} inputMode="numeric" type="number" min="1" max="99" value={cart.guestCount} onChange={(e) => cart.setGuestCount(Math.min(99, Math.max(1, Number(e.target.value) || 1)))} className="w-12 text-center text-base font-semibold border-0 outline-none bg-transparent" />
              <button type="button" aria-label={t('increasePax')} onClick={() => cart.setGuestCount(Math.min(99, cart.guestCount + 1))} className="touch-target rounded-full bg-muted"><Plus size={15} /></button>
            </div>
          </div>
        )}

        {showDineInExtras && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: cart.guestCount }, (_, index) => index + 1).map((seat) => (
                <button
                  key={seat}
                  type="button"
                  onClick={() => cart.setCurrentGuestSeat(seat)}
                  className={`min-h-9 rounded-md px-2 text-xs font-medium ${
                    cart.currentGuestSeat === seat ? 'bg-brand text-white' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {t('guestSeat', { seat })}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => cart.setCurrentCourse(1)}
                className={`min-h-9 flex-1 rounded-md text-xs font-medium ${
                  cart.currentCourse === 1 ? 'bg-brand text-white' : 'bg-muted text-muted-foreground'
                }`}
              >
                {t('courseFirst')}
              </button>
              <button
                type="button"
                onClick={() => cart.setCurrentCourse(2)}
                className={`min-h-9 flex-1 rounded-md text-xs font-medium ${
                  cart.currentCourse === 2 ? 'bg-brand text-white' : 'bg-muted text-muted-foreground'
                }`}
              >
                {t('courseSecond')}
              </button>
            </div>
          </div>
        )}

        {/* Delivery address — shown inline when delivery is selected */}
        {showDelivery && (
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-gray-400 shrink-0" />
            <input
              type="text"
              value={cart.deliveryAddress}
              onChange={(e) => cart.setDeliveryAddress(e.target.value)}
              placeholder={t('deliveryAddress')}
              className="flex-1 min-h-11 px-3 py-2 text-sm border border-border bg-card rounded-lg focus:ring-2 focus:ring-brand focus:border-brand outline-none"
            />
          </div>
        )}

        {/* Online platform + external order id — shown inline when online is selected */}
        {showOnline && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Globe size={14} className="text-gray-400 shrink-0" />
              <input
                type="text"
                value={cart.onlinePlatform}
                onChange={(e) => cart.setOnlinePlatform(e.target.value)}
                placeholder={t('onlinePlatformPlaceholder')}
                className="flex-1 min-h-11 px-3 py-2 text-sm border border-border bg-card rounded-lg focus:ring-2 focus:ring-brand focus:border-brand outline-none"
              />
            </div>
            <input
              type="text"
              value={cart.externalOrderId}
              onChange={(e) => cart.setExternalOrderId(e.target.value)}
              placeholder={t('externalOrderIdPlaceholder')}
              className="flex-1 min-h-11 px-3 py-2 text-sm border border-border bg-card rounded-lg focus:ring-2 focus:ring-brand focus:border-brand outline-none"
            />
          </div>
        )}
      </div>
      )}

      {/* Cart Items */}
      <div className={isDrawer ? 'overflow-y-auto p-4 max-h-[40vh]' : 'flex-1 overflow-y-auto p-4'}>
        {/* Previously ordered items (add-items mode) */}
        {existingOrder && existingOrder.items && existingOrder.items.filter((i: OrderItem) => i.status !== 'cancelled').length > 0 && (
          <div className="mb-3 pb-3 border-b border-dashed border-border">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{t('alreadyOrdered')}</p>
            <div className="space-y-1.5">
              {existingOrder.items.filter((i: OrderItem) => i.status !== 'cancelled').map((item: OrderItem) => {
                const next = nextKitchenItemStatus(item.status);
                return (
                  <div key={item.id} className="flex items-center gap-2 rounded-lg bg-muted/60 px-2 py-1.5">
                    <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                      {item.quantity}× {item.product_name}
                    </span>
                    {next && onAdvanceKitchenItem ? (
                      <button
                        type="button"
                        disabled={advancingItemId === item.id}
                        onClick={() => onAdvanceKitchenItem(item)}
                        className="h-11 shrink-0 rounded-md bg-brand px-3 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {t(kitchenAdvanceLabelKey(next))}
                      </button>
                    ) : Number(item.discount_amount) > 0 ? (
                      <span className="inline-flex items-baseline gap-1 text-xs font-medium">
                        <span className="text-gray-400 line-through">{fmt(Number(item.subtotal) + Number(item.discount_amount))}</span>
                        <span className="text-blue-600">{fmt(Number(item.total))}</span>
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-blue-600">{fmt(Number(item.total))}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {cart.items.length === 0 ? (
          <div className={`flex flex-col items-center justify-center text-gray-400 ${existingOrder ? 'py-4' : isDrawer ? 'py-8' : 'h-full'}`}>
            <ShoppingCart size={existingOrder ? 24 : 40} />
            <p className="mt-2 text-sm">{existingOrder ? t('addNewItemsAbove') : t('cartEmpty')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {cart.items.map((item) => (
              <div key={item.id} className="flex items-start gap-3">
                <button
                  onClick={() => cart.removeItem(item.id)}
                  className="touch-target -ms-2 -mt-2 rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 active:bg-red-50 transition-colors shrink-0"
                  aria-label={t('remove')}
                >
                  <Trash2 size={16} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground truncate">
                      {item.product.name}
                    </p>
                    {onEditItem && (
                      <button
                        onClick={() => onEditItem(item)}
                        className="touch-target shrink-0 gap-1 rounded-full bg-amber-100 px-3 text-amber-700 hover:bg-amber-200 active:bg-amber-200 text-xs font-medium transition-colors"
                      >
                        <SquarePen size={12} />
                        {tCommon('edit')}
                      </button>
                    )}
                  </div>
                  {item.addons.length > 0 && (
                    <div className="mt-0.5">
                      {item.addons.map((a) => (
                        <p key={a.id} className="text-xs text-gray-400">
                          + {a.name}{(a.quantity || 1) > 1 ? ` ×${a.quantity}` : ''} {Number(a.price) > 0 && `(${fmt(Number(a.price) * (a.quantity || 1))})`}
                        </p>
                      ))}
                    </div>
                  )}
                  {item.special_instructions && (
                    <p className="text-xs text-gray-400 italic mt-0.5 break-words">{item.special_instructions}</p>
                  )}
                  {cart.orderType === 'dine_in' && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {t('guestSeat', { seat: item.guest_seat || 1 })} · {t('course', { course: item.course || 1 })}
                    </p>
                  )}
                  {(() => {
                    const prices = visibleDishPrices(item.product, cart.orderType);
                    const addonUnit = (item.addons || []).reduce((sum, addon) => sum + (Number(addon.price) || 0) * (Number(addon.quantity) || 1), 0);
                    const lineOriginal = (prices.original + addonUnit) * item.quantity;
                    const lineDiscount = catalogLineDiscount(item.product, cart.orderType, prices.original, item.quantity, addonUnit * item.quantity);
                    const lineDiscounted = Math.max(0, lineOriginal - lineDiscount);
                    return (
                      <p className="text-sm text-muted-foreground">
                        <DishPrice
                          original={lineOriginal}
                          discounted={lineDiscount > 0 ? lineDiscounted : null}
                          className="text-sm font-medium text-foreground"
                          originalClassName="text-xs text-gray-400 line-through"
                        />
                      </p>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => cart.updateQuantity(item.id, item.quantity - 1)}
                    className="touch-target rounded-full bg-muted hover:bg-muted/70 active:bg-muted/70 transition-colors"
                    aria-label={t('remove')}
                  >
                    <Minus size={16} />
                  </button>
                  <span className="text-base font-semibold w-6 text-center tabular-nums">{item.quantity}</span>
                  <button
                    onClick={() => cart.updateQuantity(item.id, item.quantity + 1)}
                    className="touch-target rounded-full bg-muted hover:bg-muted/70 active:bg-muted/70 transition-colors"
                    aria-label={t('addItems')}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cart Footer */}
      <div className="p-4 border-t border-border dark:border-border">
        {/* Order Notes */}
        {cart.items.length > 0 && (
          <div className="mb-3">
            <textarea
              value={cart.orderNotes}
              onChange={(e) => cart.setOrderNotes(e.target.value.slice(0, 200))}
              placeholder={t('orderNotesPlaceholder')}
              rows={2}
              maxLength={200}
              className="w-full min-h-20 px-3 py-2 text-sm border border-border bg-card rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
            <p className="text-xs text-gray-400 text-end mt-0.5">{cart.orderNotes.length}/200</p>
          </div>
        )}
        <div className="flex justify-between mb-1 text-sm">
          <span className="text-muted-foreground">{t('items')}</span>
          <span className="font-medium">{cart.itemCount()}</span>
        </div>
        <div className="flex justify-between mb-4 text-lg">
          <span className="font-semibold text-foreground">{t('subtotal')}</span>
          <span className="font-bold text-brand">
            {fmt(cart.subtotal())}
          </span>
        </div>
        <div className="flex gap-2">
          {canHold && (
            <Button variant="outline" onClick={handleHold} className="flex-1">
              <Pause size={14} className="me-1" /> {t('holdButton')}
            </Button>
          )}
          <Button
            onClick={onPlaceOrder}
            disabled={submitting || cart.items.length === 0}
            className="flex-1"
            size="lg"
          >
            {submitting ? t('placing') : t('placeOrderButton')}
          </Button>
        </div>
      </div>
    </div>
  );
}

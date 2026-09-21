'use client';

import { useEffect, useMemo, useState } from 'react';
import { Globe, Package, Truck, UtensilsCrossed, X } from 'lucide-react';
import type { Hall, Table } from '@/lib/types';
import { useHeldOrdersStore } from '@/store/held-orders';
import { useCartStore } from '@/store/cart';
import { useTranslations, type AppConfig } from 'use-intl';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import HallSwitcher from '@/components/pos/HallSwitcher';
import { Ltr } from '@/components/layout/Ltr';

type OrderType = 'dine_in' | 'takeaway' | 'delivery' | 'online';

interface Props {
  tables: Table[];
  halls?: Hall[];
  selectedTableId: string | null;
  onSelectAvailable: (tableId: string, customer?: { id: number; name: string; phone: string } | null) => void;
  onSelectOccupied: (table: Table) => void;
  onSelectHeld: (tableId: string) => void;
  onPlaceOrder: () => void;
  onHoldTable: (tableId: string) => void;
  onClose?: () => void;
  /** Full-area floor plan until a table is confirmed. */
  variant?: 'modal' | 'panel';
  orderType?: OrderType;
  onOrderTypeChange?: (type: OrderType) => void;
}

type PosKey = keyof AppConfig['Messages']['pos'];

const ORDER_TYPES: Array<{ type: OrderType; Icon: typeof UtensilsCrossed; labelKey: PosKey }> = [
  { type: 'dine_in', Icon: UtensilsCrossed, labelKey: 'orderTypeDineIn' },
  { type: 'takeaway', Icon: Package, labelKey: 'orderTypeTakeaway' },
  { type: 'delivery', Icon: Truck, labelKey: 'orderTypeDelivery' },
  { type: 'online', Icon: Globe, labelKey: 'orderTypeOnline' },
];

const statusStyles: Record<string, { border: string; badge: string; badgeKey: PosKey | null }> = {
  available: { border: 'border-green-400 bg-green-50', badge: 'bg-green-500', badgeKey: null },
  occupied: { border: 'border-red-400 bg-red-50', badge: 'bg-red-500', badgeKey: 'tableOccupied' },
  reserved: { border: 'border-purple-400 bg-purple-50', badge: 'bg-purple-500', badgeKey: 'tableReserved' },
  cleaning: { border: 'border-gray-300 dark:border-border bg-muted', badge: 'bg-gray-500', badgeKey: 'tableCleaning' },
  held: { border: 'border-blue-400 bg-blue-50', badge: 'bg-blue-500', badgeKey: 'tableHeld' },
  precheck: { border: 'border-yellow-400 bg-yellow-50', badge: 'bg-yellow-500', badgeKey: 'tablePrecheck' },
};

function stayLabel(startedAt: string | null | undefined, t: (key: PosKey, values?: Record<string, number>) => string): string | null {
  if (!startedAt) return null;
  const mins = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000));
  if (mins < 60) return t('stayMinutes', { count: mins });
  return t('stayHours', { hours: Math.floor(mins / 60), minutes: mins % 60 });
}

function tableInHall(table: Table, hallId: string | null, halls: Hall[]): boolean {
  if (!hallId) return true;
  if (table.hall_id === hallId) return true;
  if (table.hall_id) return false;
  const hall = halls.find((item) => item.id === hallId);
  return Boolean(hall?.is_default) || halls.length === 1;
}

export default function TablePickerModal({
  tables, halls = [], selectedTableId, onSelectAvailable, onSelectOccupied, onSelectHeld, onPlaceOrder, onHoldTable, onClose,
  variant = 'modal',
  orderType = 'dine_in',
  onOrderTypeChange,
}: Props) {
  const heldOrders = useHeldOrdersStore();
  const cartItemCount = useCartStore((state) => state.items.length);
  const t = useTranslations('pos');
  const fmt = useFormatCurrency();
  const isPanel = variant === 'panel';
  const selectedTable = selectedTableId ? tables.find((table) => table.id === selectedTableId) : undefined;
  const selectedOccupied = selectedTable?.status === 'occupied' || selectedTable?.status === 'precheck';
  const holdDisabledReason = !selectedTableId
    ? t('selectTableFirst')
    : cartItemCount === 0
      ? t('holdRequiresItems')
      : selectedOccupied
        ? t('holdTableOccupied')
        : null;
  const [hallId, setHallId] = useState<string | null>(null);
  const orderTypeLabel = t(ORDER_TYPES.find((item) => item.type === orderType)?.labelKey ?? 'orderTypeDineIn');
  const hint = orderType === 'dine_in'
    ? t('chooseTableToOpenMenu')
    : t('chooseTableKeepOrderType', { type: orderTypeLabel });

  useEffect(() => {
    const selected = selectedTableId ? tables.find((table) => table.id === selectedTableId) : undefined;
    if (selected?.hall_id && halls.some((hall) => hall.id === selected.hall_id)) {
      setHallId(selected.hall_id);
      return;
    }
    setHallId((current) => {
      if (current && halls.some((hall) => hall.id === current)) return current;
      return halls[0]?.id ?? null;
    });
  }, [halls, selectedTableId, tables]);

  const visibleTables = useMemo(
    () => tables.filter((table) => tableInHall(table, hallId, halls)),
    [tables, hallId, halls],
  );

  const handleClick = (table: Table) => {
    if (heldOrders.hasHeldOrder(table.id)) {
      onSelectHeld(table.id);
      return;
    }
    if (table.status === 'occupied' || table.status === 'precheck') {
      onSelectOccupied(table);
      return;
    }
    if (table.status === 'available' || table.status === 'reserved') {
      const customer = table.status === 'reserved' && table.reservation_customer_id
        ? { id: table.reservation_customer_id, name: table.reservation_customer_name ?? '', phone: table.reservation_customer_phone ?? '' }
        : null;
      onSelectAvailable(table.id, customer);
      return;
    }
  };

  const header = (
    <div className={isPanel ? 'shrink-0 px-3 pt-2 md:px-6 md:pt-5' : ''}>
      <div className="mb-2 flex items-center justify-between md:mb-4">
        <div className="min-w-0">
          <h2 className="text-base font-bold leading-tight md:text-lg">{t('selectTable')}</h2>
          {isPanel && (
            <p className="mt-0.5 hidden text-sm text-muted-foreground md:block">{hint}</p>
          )}
        </div>
        {onClose && (
          <button onClick={onClose} className="touch-target rounded-full text-gray-400 hover:text-muted-foreground active:bg-muted" aria-label={t('close')}>
            <X size={20} />
          </button>
        )}
      </div>

      {isPanel && onOrderTypeChange && (
        <div data-testid="pos-floor-order-types" className="mb-2 flex gap-1 rounded-lg bg-muted p-0.5 md:mb-4 md:p-1">
          {ORDER_TYPES.map(({ type, Icon, labelKey }) => (
            <button
              key={type}
              type="button"
              onClick={() => onOrderTypeChange(type)}
              className={`inline-flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-colors md:min-h-11 md:px-2 md:text-xs ${
                orderType === type
                  ? 'bg-card text-brand shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon size={14} className="shrink-0" />
              <span className="truncate">{t(labelKey)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flo-h-scroll mb-2 flex flex-nowrap gap-2 text-[11px] text-muted-foreground md:mb-4 md:flex-wrap md:gap-3 md:overflow-visible md:text-xs">
        <span className="flex shrink-0 items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-green-500" />{t('tableLegendFree')}</span>
        <span className="flex shrink-0 items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500" />{t('tableLegendOccupied')}</span>
        <span className="flex shrink-0 items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />{t('tableLegendPrecheck')}</span>
        <span className="flex shrink-0 items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-purple-500" />{t('tableLegendReserved')}</span>
      </div>

      {!isPanel && (
        <HallSwitcher halls={halls} selectedHallId={hallId} onSelect={setHallId} testId="pos-hall-tabs" />
      )}
    </div>
  );

  const grid = (
    <div className={`grid gap-3 ${isPanel ? 'grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]' : 'grid-cols-3'}`}>
      {visibleTables.map((table) => {
        const isHeld = heldOrders.hasHeldOrder(table.id);
        const isSelected = selectedTableId === table.id;
        const style = statusStyles[table.status] || statusStyles.available;
        const isDisabled = table.status === 'cleaning';
        const stay = stayLabel(table.stay_started_at, t);
        const total = table.order_total;
        const activeOrder = table.current_order || table.activeOrder;
        const occupied = table.status === 'occupied' || table.status === 'precheck';

        return (
          <button
            key={table.id}
            onClick={() => !isDisabled && handleClick(table)}
            disabled={isDisabled}
            className={`min-h-[8.75rem] min-w-0 p-3 rounded-xl border-2 text-center transition-colors relative ${
              isSelected
                ? 'border-brand bg-brand-light'
                : isHeld
                  ? 'border-blue-400 bg-blue-50'
                  : style.border
            } ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${
              occupied && !isHeld ? 'text-red-950' : ''
            }`}
          >
            {isHeld && (
              <span className="absolute -top-2 -end-2 bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {t('tableHeld')}
              </span>
            )}
            {!isHeld && style.badgeKey && (
              <span className={`absolute -top-2 -end-2 ${style.badge} text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold`}>
                {t(style.badgeKey)}
              </span>
            )}
            <p className="font-bold text-foreground truncate">{table.name}</p>
            <p className="text-xs text-muted-foreground">{t('tableSeats', { count: table.capacity })}</p>
            {occupied && activeOrder && (
              <Ltr as="p" className="mt-1 max-w-full truncate text-xs font-medium text-red-600" title={`#${activeOrder.order_number}`}>
                #{activeOrder.order_number}
              </Ltr>
            )}
            {typeof total === 'number' && Number.isFinite(total) && occupied && (
              <p className="mt-0.5 text-xs font-semibold text-foreground tabular-nums">{fmt(total)}</p>
            )}
            {stay && occupied && (
              <p className="mt-0.5 whitespace-nowrap text-[10px] text-muted-foreground">{stay}</p>
            )}
          </button>
        );
      })}
    </div>
  );

  const empty = visibleTables.length === 0 && (
    <p className="text-center text-muted-foreground py-8">{t('noTablesFound')}</p>
  );

  const footer = selectedTableId && (
    <div className={isPanel ? 'shrink-0 border-t border-border px-4 py-4 md:px-6' : 'mt-4 pt-4 border-t border-border'}>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => {
            if (holdDisabledReason) return;
            onHoldTable(selectedTableId);
          }}
          disabled={!!holdDisabledReason}
          title={holdDisabledReason ?? undefined}
          aria-disabled={!!holdDisabledReason}
          className="touch-target flex-1 px-4 rounded-xl border-2 border-border text-foreground font-medium hover:bg-muted active:bg-muted transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('holdTable')}
        </button>
        <button
          type="button"
          onClick={() => {
            onPlaceOrder();
            onClose?.();
          }}
          className="touch-target flex-1 px-4 rounded-xl bg-brand text-white font-medium hover:bg-brand/90 active:bg-brand/90 transition-colors"
        >
          {t('placeOrderButton')}
        </button>
      </div>
      {holdDisabledReason && (
        <p className="mt-2 text-center text-xs text-muted-foreground">{holdDisabledReason}</p>
      )}
    </div>
  );

  if (isPanel) {
    return (
      <div
        data-testid="pos-table-picker"
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card flo-phone-page-scroll md:overflow-hidden"
      >
        {header}
        <div className="z-10 shrink-0 bg-card px-3 pt-0.5 md:px-6">
          <HallSwitcher halls={halls} selectedHallId={hallId} onSelect={setHallId} testId="pos-hall-tabs" />
        </div>
        <div className="flo-primary-scroll px-3 pb-24 md:px-6 md:pb-6">
          {grid}
          {empty}
        </div>
        {footer}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-card p-4 md:p-6">
        {header}
        <div className="flo-primary-scroll">
          {grid}
          {empty}
        </div>
        {footer}
      </div>
    </div>
  );
}
